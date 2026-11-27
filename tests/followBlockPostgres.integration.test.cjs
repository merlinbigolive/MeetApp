const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join } = require('node:path');

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
const fixturePath = join(__dirname, 'fixtures', 'follow-block-postgres.sql');
const migrationPath = join(__dirname, '..', 'supabase_follow_requests_and_blocked_accounts_rpc_hardening.sql');

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const C = '10000000-0000-4000-8000-000000000003';
const D = '10000000-0000-4000-8000-000000000004';
const E = '10000000-0000-4000-8000-000000000005';

async function psql(sql, options = {}) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', '--dbname', databaseUrl];
  if (options.file) args.push('-f', options.file);
  else args.push('-A', '-t', '-c', sql);
  return execFileAsync('psql', args, { env: process.env, maxBuffer: 4 * 1024 * 1024 });
}

function asUser(userId, statement) {
  const identity = userId ? `select set_config('request.jwt.claim.sub', '${userId}', false);` : '';
  return `set role authenticated; ${identity} ${statement}`;
}

async function seed() {
  await psql(`
    truncate public.follows, public.user_blocks, public.profiles cascade;
    insert into public.profiles(id, username, display_name, is_private) values
      ('${A}', 'actor_a', 'Actor A', false),
      ('${B}', 'actor_b', 'Actor B', true),
      ('${C}', 'actor_c', 'Actor C', false),
      ('${D}', 'actor_d', 'Actor D', false),
      ('${E}', 'actor_e', 'Actor E', false);
  `);
}

test('follow/block RPCs enforce auth, RLS, symmetric blocks and transaction serialization in PostgreSQL', {
  skip: !databaseUrl ? 'DATABASE_URL is not configured; isolated PostgreSQL integration suite runs in CI.' : false,
}, async (t) => {
  await psql('', { file: fixturePath });

  // Prove the disposable fixture reproduces the deployed legacy direct-insert
  // path before applying hardening; the migration must close this exact route.
  await seed();
  await psql(asUser(A, `insert into public.follows(follower_id, followed_id, status) values ('${A}', '${C}', 'accepted');`));
  const legacyDirectInsert = await psql(`select count(*) from public.follows where follower_id='${A}' and followed_id='${C}';`);
  assert.equal(legacyDirectInsert.stdout.trim(), '1', 'legacy permissive policy should allow the pre-hardening fixture insert');

  await psql('', { file: migrationPath });

  await t.test('rejects unauthenticated follow and block RPC calls', async () => {
    await assert.rejects(psql(asUser(null, `select public.request_profile_follow('${C}');`)), /Authentication required/i);
    await assert.rejects(psql(asUser(null, `select public.block_user('${C}');`)), /Authentication required/i);
  });

  await t.test('creates accepted public follows and pending private follow requests', async () => {
    await seed();
    const publicResult = await psql(asUser(A, `select public.request_profile_follow('${C}');`));
    const privateResult = await psql(asUser(A, `select public.request_profile_follow('${B}');`));
    assert.equal(publicResult.stdout.trim().split(/\r?\n/).at(-1), 'accepted');
    assert.equal(privateResult.stdout.trim().split(/\r?\n/).at(-1), 'pending');
    const rows = await psql(`select follower_id || ':' || followed_id || ':' || status from public.follows order by followed_id;`);
    assert.match(rows.stdout, new RegExp(`${A}:${B}:pending`));
    assert.match(rows.stdout, new RegExp(`${A}:${C}:accepted`));
  });

  await t.test('blocks in either direction prevent new follows and remove existing relationships', async () => {
    await seed();
    await psql(`insert into public.follows(follower_id, followed_id, status) values ('${A}', '${B}', 'pending'), ('${B}', '${A}', 'accepted');`);
    await psql(asUser(A, `select public.block_user('${B}');`));
    await assert.rejects(psql(asUser(B, `select public.request_profile_follow('${A}');`)), /Cannot follow an account/i);
    const remaining = await psql(`select count(*) from public.follows where (follower_id='${A}' and followed_id='${B}') or (follower_id='${B}' and followed_id='${A}');`);
    assert.equal(remaining.stdout.trim(), '0');
  });

  await t.test('follow approval succeeds only for an existing pending request and blocking removes it', async () => {
    await seed();
    await psql(`insert into public.follows(follower_id, followed_id, status) values ('${A}', '${B}', 'pending');`);
    const approved = await psql(asUser(B, `select public.respond_to_follow_request('${A}', true);`));
    assert.equal(approved.stdout.trim().split(/\r?\n/).at(-1), 't');
    await psql(asUser(B, `select public.block_user('${A}');`));
    const remaining = await psql(`select count(*) from public.follows where follower_id='${A}' and followed_id='${B}';`);
    assert.equal(remaining.stdout.trim(), '0');
    await assert.rejects(psql(asUser(A, `select public.respond_to_follow_request('${B}', true);`)), /Cannot accept a follow request/i);
  });

  await t.test('authenticated RLS reads only relationships involving the current account; direct inserts are denied', async () => {
    await seed();
    await psql(`insert into public.follows(follower_id, followed_id, status) values ('${A}', '${B}', 'pending'), ('${D}', '${E}', 'accepted');`);
    const visible = await psql(asUser(A, 'select count(*) from public.follows;'));
    assert.equal(visible.stdout.trim().split(/\r?\n/).at(-1), '1');
    await assert.rejects(psql(asUser(A, `insert into public.follows(follower_id, followed_id, status) values ('${A}', '${C}', 'accepted');`)), /permission denied/i);
    await assert.rejects(psql(asUser(A, `update public.follows set status='accepted' where follower_id='${A}' and followed_id='${B}';`)), /permission denied/i);
    const unchanged = await psql(`select status from public.follows where follower_id='${A}' and followed_id='${B}';`);
    assert.equal(unchanged.stdout.trim(), 'pending');
    const blocks = await psql(asUser(A, `select count(*) from public.user_blocks;`));
    assert.equal(blocks.stdout.trim().split(/\r?\n/).at(-1), '0');
  });

  await t.test('restrictive global-block RLS hides follow rows when either account has blocked the other', async () => {
    await seed();
    await psql(`
      insert into public.follows(follower_id, followed_id, status)
      values ('${A}', '${B}', 'pending');
      insert into public.user_blocks(blocker_id, blocked_id)
      values ('${B}', '${A}');
    `);
    const visibleToA = await psql(asUser(A, 'select count(*) from public.follows;'));
    const visibleToB = await psql(asUser(B, 'select count(*) from public.follows;'));
    assert.equal(visibleToA.stdout.trim().split(/\r?\n/).at(-1), '0');
    assert.equal(visibleToB.stdout.trim().split(/\r?\n/).at(-1), '0');
  });

  await t.test('a follower can unfollow only their own relationship; the followed account cannot delete it', async () => {
    await seed();
    await psql(`
      insert into public.follows(follower_id, followed_id, status)
      values ('${A}', '${C}', 'accepted'), ('${D}', '${A}', 'accepted');
    `);
    // Being the followed account grants SELECT visibility, not DELETE ownership.
    await psql(asUser(A, `delete from public.follows where follower_id='${D}' and followed_id='${A}';`));
    const protectedRow = await psql(`select count(*) from public.follows where follower_id='${D}' and followed_id='${A}';`);
    assert.equal(protectedRow.stdout.trim(), '1', 'the followed account must not remove another account\'s follow');
    // The follower retains the intended unfollow path after INSERT/UPDATE hardening.
    await psql(asUser(A, `delete from public.follows where follower_id='${A}' and followed_id='${C}';`));
    const ownRow = await psql(`select count(*) from public.follows where follower_id='${A}' and followed_id='${C}';`);
    assert.equal(ownRow.stdout.trim(), '0', 'the follower must still be able to unfollow');
  });

  await t.test('concurrent follow and block cannot leave a follow relationship after the block commits', async () => {
    await seed();
    await psql(`
      create or replace function public.test_delay_follow_insert()
      returns trigger language plpgsql as $$
      begin perform pg_sleep(1.2); return new; end;
      $$;
      create trigger test_delay_follow_insert before insert on public.follows
      for each row execute function public.test_delay_follow_insert();
    `);

    const followPromise = psql(asUser(A, `select public.request_profile_follow('${B}');`));
    let followIsInsideDelay = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const activity = await psql(`
        select count(*) from pg_stat_activity
        where datname = current_database()
          and state = 'active'
          and wait_event = 'PgSleep'
          and query ilike '%request_profile_follow%';
      `);
      if (Number(activity.stdout.trim()) > 0) {
        followIsInsideDelay = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(followIsInsideDelay, true, 'the follow transaction must hold its pair lock before the competing block starts');
    const blockPromise = psql(asUser(B, `select public.block_user('${A}');`));
    const [followResult, blockResult] = await Promise.allSettled([followPromise, blockPromise]);
    assert.equal(followResult.status, 'fulfilled', 'the serialized follow RPC should complete before the competing block');
    assert.equal(blockResult.status, 'fulfilled', 'the competing block RPC should complete after acquiring the pair lock');
    assert.equal(blockResult.value.stdout.trim().split(/\r?\n/).at(-1), 't');

    await psql('drop trigger if exists test_delay_follow_insert on public.follows; drop function if exists public.test_delay_follow_insert();');
    const state = await psql(`
      select
        (select count(*) from public.user_blocks where blocker_id='${B}' and blocked_id='${A}') || ':' ||
        (select count(*) from public.follows where (follower_id='${A}' and followed_id='${B}') or (follower_id='${B}' and followed_id='${A}'));
    `);
    assert.equal(state.stdout.trim(), '1:0');
  });

  await t.test('a block racing with follow-request approval wins and approval rechecks the block after locking', async () => {
    await seed();
    await psql(`insert into public.follows(follower_id, followed_id, status) values ('${A}', '${B}', 'pending');`);
    // Hold the blocking RPC inside its DELETE after it has acquired the shared pair lock.
    await psql(`
      create or replace function public.test_delay_follow_delete()
      returns trigger language plpgsql as $$
      begin perform pg_sleep(1.2); return old; end;
      $$;
      create trigger test_delay_follow_delete before delete on public.follows
      for each row execute function public.test_delay_follow_delete();
    `);
    const blockPromise = psql(asUser(A, `select public.block_user('${B}');`));
    let blockIsInsideDelay = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const activity = await psql(`
        select count(*) from pg_stat_activity
        where datname = current_database()
          and state = 'active'
          and wait_event = 'PgSleep'
          and query ilike '%block_user%';
      `);
      if (Number(activity.stdout.trim()) > 0) {
        blockIsInsideDelay = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(blockIsInsideDelay, true, 'the block transaction must hold the pair lock before approval starts');
    const approvalPromise = psql(asUser(B, `select public.respond_to_follow_request('${A}', true);`));
    const [blockResult, approvalResult] = await Promise.allSettled([blockPromise, approvalPromise]);
    assert.equal(blockResult.status, 'fulfilled', 'the blocking transaction should commit');
    assert.equal(blockResult.value.stdout.trim().split(/\r?\n/).at(-1), 't');
    assert.equal(approvalResult.status, 'rejected', 'approval must fail after the block transaction wins the pair lock');
    assert.match(String(approvalResult.reason?.stderr || approvalResult.reason), /Cannot accept a follow request/i);
    await psql('drop trigger if exists test_delay_follow_delete on public.follows; drop function if exists public.test_delay_follow_delete();');
    const state = await psql(`
      select
        (select count(*) from public.user_blocks where blocker_id='${A}' and blocked_id='${B}') || ':' ||
        (select count(*) from public.follows where follower_id='${A}' and followed_id='${B}');
    `);
    assert.equal(state.stdout.trim(), '1:0');
  });

  await t.test('all four RPCs use the same transaction-scoped advisory lock', async () => {
    const result = await psql(`
      select count(*) from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in ('request_profile_follow','respond_to_follow_request','block_user','unblock_user')
        and pg_get_functiondef(p.oid) ilike '%pg_advisory_xact_lock%'
        and pg_get_functiondef(p.oid) ilike '%hashtextextended%';
    `);
    assert.equal(result.stdout.trim(), '4');
  });
});
