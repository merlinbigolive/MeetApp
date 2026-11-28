const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const runbook = readFileSync(join(__dirname, '..', 'docs', 'SUPABASE_MIGRATION_ORDER.md'), 'utf8');

function assertOrdered(source, files, label) {
  let previousIndex = -1;
  for (const file of files) {
    const occurrence = source.indexOf(file);
    assert.ok(occurrence > previousIndex, label + ': ' + file + ' must appear in the documented order');
    previousIndex = occurrence;
  }
}

test('follow/block hardening runbook preserves the final shared-lock RPC migration order', () => {
  assertOrdered(runbook, [
    'supabase_private_follow_requests_setup.sql',
    'supabase_global_account_blocking_setup.sql',
    'supabase_follow_rpc_global_blocking_hardening.sql',
    'supabase_private_follow_approval_hardening.sql',
    'supabase_follow_requests_and_blocked_accounts_rpc_hardening.sql'
  ], 'Follow/block order');
  assert.match(runbook, /final definition of .*request_profile_follow/s);
});

test('rate-limit runbook keeps the allowlist synchronization migration last', () => {
  assertOrdered(runbook, [
    'supabase_meei_live_chat_rate_limit_hardening.sql',
    'supabase_meei_livekit_action_rate_limits.sql',
    'supabase_meei_profile_video_search_rate_limits.sql',
    'supabase_meei_messaging_send_guard.sql',
    'supabase_meei_conversation_creation_guard.sql',
    'supabase_meei_live_pk_battle_core.sql',
    'supabase_meei_live_pk_rate_limits.sql',
    'supabase_meei_rate_limit_action_allowlist_fix.sql'
  ], 'Rate-limit order');
  assert.match(runbook, /\*\*must be last\*\*/i);
  assert.match(runbook, /Never apply one of those older definitions after step 8/i);
  assert.match(runbook, /do not apply it twice unnecessarily/i);
});

test('runbook requires staging validation and explicit owner approval before production', () => {
  assert.match(runbook, /two distinct real test accounts/i);
  assert.match(runbook, /explicit owner approval/i);
  assert.match(runbook, /does not apply SQL to any Supabase project/i);
});
