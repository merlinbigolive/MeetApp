const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sql = readFileSync(
  join(__dirname, '..', 'supabase_follow_requests_and_blocked_accounts_rpc_hardening.sql'),
  'utf8'
);

function getFunction(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(
    'create or replace function public\\.' + escaped + '[\\s\\S]*?\\$function\\$;',
    'i'
  ));
  assert.ok(match, 'function public.' + name + ' must be defined in the hardening migration');
  return match[0];
}

function assertAuthenticatedOnly(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(sql, new RegExp(
    'revoke all on function public\\.' + escaped + '\\(uuid\\) from public, anon',
    'i'
  ));
  assert.match(sql, new RegExp(
    'grant execute on function public\\.' + escaped + '\\(uuid\\) to authenticated',
    'i'
  ));
}

test('follow creation cannot bypass the guarded RPC through direct table inserts', () => {
  assert.match(sql, /drop policy if exists "follows_insert_self" on public\.follows/i);
  assert.match(sql, /drop policy if exists "follows_insert_public_only" on public\.follows/i);
});

test('follow request RPC checks symmetric global blocks before inserting a follow', () => {
  const fn = getFunction('request_profile_follow');
  assert.match(fn, /security definer/i);
  assert.match(fn, /set search_path = public, pg_temp/i);
  assert.match(fn, /actor_id uuid := auth\.uid\(\)/i);
  assert.match(fn, /if public\.is_blocked_for_current_user\(target_user_id\) then/i);
  assert.ok(
    fn.indexOf('is_blocked_for_current_user') < fn.indexOf('insert into public.follows'),
    'the block check must happen before the follow row is written'
  );
  assert.match(fn, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(pair_lock_key, 0\)\)/i);
  assertAuthenticatedOnly('request_profile_follow');
});

test('follow approval serializes with blocking and rechecks the symmetric block state', () => {
  const fn = getFunction('respond_to_follow_request');
  assert.match(fn, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(pair_lock_key, 0\)\)/i);
  assert.match(fn, /if approve and public\.is_blocked_for_current_user\(target_follower_id\) then/i);
  assert.ok(
    fn.indexOf('is_blocked_for_current_user') < fn.indexOf('update public.follows'),
    'approval must check blocking after taking the pair lock and before accepting'
  );
  assert.match(sql, /revoke all on function public\.respond_to_follow_request\(uuid, boolean\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.respond_to_follow_request\(uuid, boolean\) to authenticated/i);
});

test('block and unblock RPCs share the same transaction lock as follow requests', () => {
  for (const name of ['block_user', 'unblock_user']) {
    const fn = getFunction(name);
    assert.match(fn, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(pair_lock_key, 0\)\)/i);
    assert.match(fn, /set search_path = public, pg_temp/i);
    assertAuthenticatedOnly(name);
  }
  const lockCount = (sql.match(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(pair_lock_key, 0\)\)/gi) || []).length;
  assert.equal(lockCount, 4, 'follow, approval, block, and unblock must all use the same pair lock');
});


const globalBlockSql = readFileSync(
  join(__dirname, '..', 'supabase_global_account_blocking_setup.sql'),
  'utf8'
);
const commentVisibilityFixSql = readFileSync(
  join(__dirname, '..', 'supabase_global_block_comment_author_visibility_fix.sql'),
  'utf8'
);

test('global block visibility hides blocked comment authors and comments on blocked posts', () => {
  for (const source of [globalBlockSql, commentVisibilityFixSql]) {
    assert.match(source, /drop policy if exists "global_block_comments_select_v2"/i, "legacy v2 restrictive policy must be replaced to avoid duplicate filters");
    const policy = source.match(/create policy "global_block_comments_select"[\s\S]*?\);/i)?.[0];
    assert.ok(policy, 'restrictive comment visibility policy must exist');
    assert.match(policy, /as restrictive/i);
    assert.match(policy, /user_id = auth\.uid\(\)/i, 'users can retain access to their own comments');
    assert.match(policy, /not public\.is_blocked_for_current_user\(user_id\)/i, 'blocked comment authors must be hidden');
    assert.match(policy, /public\.is_blocked_for_current_user\(p\.user_id\)/i, 'comments on blocked users posts must be hidden');
  }
});
