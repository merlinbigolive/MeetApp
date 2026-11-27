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

test('block and unblock RPCs share the same transaction lock as follow requests', () => {
  for (const name of ['block_user', 'unblock_user']) {
    const fn = getFunction(name);
    assert.match(fn, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(pair_lock_key, 0\)\)/i);
    assert.match(fn, /set search_path = public, pg_temp/i);
    assertAuthenticatedOnly(name);
  }
  const lockCount = (sql.match(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(pair_lock_key, 0\)\)/gi) || []).length;
  assert.equal(lockCount, 3, 'follow, block, and unblock must all use the same pair lock');
});
