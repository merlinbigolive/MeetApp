const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const migration = readFileSync(join(root, 'supabase_meei_rate_limit_action_allowlist_fix.sql'), 'utf8');
const wrapper = readFileSync(join(root, 'supabase_meei_live_pk_rate_limits.sql'), 'utf8');

function extractKeys(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, label + ' allowlist must exist');
  return new Set([...match[1].matchAll(/'([a-z][a-z0-9_]*)'/g)].map(item => item[1]));
}

test('private rate-limit table constraint and function accept every wrapped action', () => {
  const constraintKeys = extractKeys(
    migration,
    /add constraint meei_user_rate_limits_action_key_check\s+check\s*\(action_key in\s*\(([\s\S]*?)\)\)/i,
    'Table constraint'
  );
  const functionKeys = extractKeys(
    migration,
    /if p_action_key not in\s*\(([\s\S]*?)\)\s*or p_limit/i,
    'Private function'
  );
  const wrapperKeys = new Set([...wrapper.matchAll(/when '([a-z][a-z0-9_]*)'/g)].map(item => item[1]));

  for (const key of wrapperKeys) {
    assert.ok(constraintKeys.has(key), 'Table constraint is missing ' + key);
    assert.ok(functionKeys.has(key), 'Private function is missing ' + key);
  }
});

test('private rate-limit function keeps the complete supported action set aligned', () => {
  const constraintKeys = extractKeys(
    migration,
    /add constraint meei_user_rate_limits_action_key_check\s+check\s*\(action_key in\s*\(([\s\S]*?)\)\)/i,
    'Table constraint'
  );
  const functionKeys = extractKeys(
    migration,
    /if p_action_key not in\s*\(([\s\S]*?)\)\s*or p_limit/i,
    'Private function'
  );
  assert.deepEqual([...functionKeys].sort(), [...constraintKeys].sort());
});


test('private rate-limit RPC fails closed and is not directly callable by client roles', () => {
  assert.match(migration, /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(migration, /if v_user_id is null[\s\S]*?Authentication required/i);
  assert.match(migration, /set search_path\s*=\s*pg_catalog\s*,\s*private\s*,\s*pg_temp/i);
  assert.match(
    migration,
    /revoke all on function private\.consume_user_rate_limit\(text, integer, integer\)\s+from public, anon, authenticated/i
  );
});


test('rate-limit allowlist synchronization documents its required final migration order', () => {
  const prerequisites = [
    'supabase_meei_live_chat_rate_limit_hardening.sql',
    'supabase_meei_livekit_action_rate_limits.sql',
    'supabase_meei_profile_video_search_rate_limits.sql',
    'supabase_meei_messaging_send_guard.sql',
    'supabase_meei_conversation_creation_guard.sql',
    'supabase_meei_live_pk_rate_limits.sql'
  ];
  let previousIndex = -1;
  for (const file of prerequisites) {
    const occurrence = migration.indexOf(file);
    assert.ok(occurrence > previousIndex, file + ' must appear in the documented prerequisite order');
    previousIndex = occurrence;
  }
  assert.match(migration, /MUST be the final migration that changes private\.consume_user_rate_limit/i);
  assert.match(migration, /or private\.meei_user_rate_limits_action_key_check/i);
});
