const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { buildProfileUpdate, buildProfileMediaUpdate } = require('../profilePersistence');
const { buildProfileBootstrapPayloads } = require('../profileBootstrap');

const sql = readFileSync(join(__dirname, '..', 'supabase_profile_access_privilege_hardening.sql'), 'utf8');

function grantedColumns(privilege, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp('grant ' + privilege + ' \\(([\\s\\S]*?)\\) on table public\\.' + escaped, 'i'));
  assert.ok(match, privilege.toUpperCase() + ' column grant exists for ' + tableName);
  const columns = match[1].split(',').map(column => column.trim()).filter(Boolean);
  assert.equal(new Set(columns).size, columns.length, 'column grants must not contain duplicates for ' + tableName);
  return new Set(columns);
}

function grantedUpdateColumns(tableName) { return grantedColumns('update', tableName); }
function grantedInsertColumns(tableName) { return grantedColumns('insert', tableName); }

test('profile bootstrap insert payload only uses columns granted by profile hardening migration', () => {
  const payloads = buildProfileBootstrapPayloads({
    id: '12345678-90ab-cdef-1234-567890abcdef',
    email: 'creator@example.com',
    user_metadata: { display_name: 'Creator' },
  });
  const granted = grantedInsertColumns('profiles');
  for (const payload of [payloads.primary, payloads.fallback]) {
    for (const column of Object.keys(payload)) {
      assert.ok(granted.has(column), 'profiles.' + column + ' must be granted for profile bootstrap');
    }
  }
});

test('profile update payload only uses columns granted by profile hardening migration', () => {
  const payload = buildProfileUpdate({
    name: 'MEEi User', username: 'meei_user', bio: 'Hello', website: '',
    occupation: '', accountType: 'personal', businessName: '', businessCategory: '',
    businessDescription: '', isPrivateAccount: false, countryCode: 'IN',
    countryName: 'India', activity: 'Available',
  }, '2026-11-27T00:00:00.000Z');
  const granted = grantedUpdateColumns('profiles');
  for (const column of Object.keys(payload)) {
    assert.ok(granted.has(column), 'profiles.' + column + ' must be granted for profile save');
  }
});

test('profile media replacement payload only uses columns granted by profile hardening migration', () => {
  const payload = buildProfileMediaUpdate({
    user_id: 'user-id', kind: 'cover', position: 0, storage_path: 'user-id/cover/file.jpg',
    media_type: 'image', original_name: 'cover.jpg', updated_at: '2026-11-27T00:00:00.000Z',
  });
  const granted = grantedUpdateColumns('profile_media');
  for (const column of Object.keys(payload)) {
    assert.ok(granted.has(column), 'profile_media.' + column + ' must be granted for replacement');
  }
});


test('profile hardening revokes broad client grants and preserves only intended operations', () => {
  assert.ok(sql.includes('revoke all privileges on table public.profiles from anon, authenticated;'));
  assert.ok(sql.includes('revoke all privileges on table public.profile_media from anon, authenticated;'));
  assert.ok(sql.includes('grant select on table public.profiles to authenticated;'));
  assert.ok(sql.includes('grant select on table public.profile_media to authenticated;'));
  assert.doesNotMatch(sql, /grant delete on table public\.profiles\b/i);
  assert.ok(sql.includes('grant delete on table public.profile_media to authenticated;'));
});

test('profile media insert and update grants exclude immutable ownership fields on update', () => {
  const mediaInsertMatch = sql.match(/grant insert\s*\(([\s\S]*?)\)\s*on\s+table\s+public\.profile_media/i);
  assert.ok(mediaInsertMatch, 'INSERT column grant exists for profile_media');
  const insert = new Set(mediaInsertMatch[1].split(',').map(column => column.trim()).filter(Boolean));
  assert.equal(insert.size, mediaInsertMatch[1].split(',').map(column => column.trim()).filter(Boolean).length, 'profile_media INSERT grant must not contain duplicate columns');
  for (const column of ['user_id', 'kind', 'position', 'storage_path', 'media_type', 'original_name', 'updated_at']) {
    assert.ok(insert.has(column), 'profile_media.' + column + ' must be allowed for media creation');
  }
  const update = grantedUpdateColumns('profile_media');
  for (const immutable of ['id', 'user_id', 'kind', 'created_at']) {
    assert.ok(!update.has(immutable), 'profile_media.' + immutable + ' must remain immutable');
  }
});
