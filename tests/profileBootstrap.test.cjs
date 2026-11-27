const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProfileBootstrapPayloads,
  ensureProfileExists,
} = require('../profileBootstrap');

const user = {
  id: '12345678-90ab-cdef-1234-567890abcdef',
  email: '  Creator.Name+test@example.com',
  user_metadata: { display_name: '  Creator Name  ' },
};

test('builds primary and fallback usernames within the database length and character rules', () => {
  const payloads = buildProfileBootstrapPayloads(user);
  for (const payload of [payloads.primary, payloads.fallback]) {
    assert.match(payload.username, /^[a-z0-9_]{3,25}$/);
    assert.equal(payload.id, user.id);
    assert.equal(payload.display_name, 'Creator Name');
  }
  assert.equal(payloads.primary.username, 'creatornametest_123456');
  assert.equal(payloads.fallback.username, 'user_1234567890abcdef');
});

test('uses a safe fallback display name when metadata is absent or blank', () => {
  const payloads = buildProfileBootstrapPayloads({
    id: user.id, email: '  New.User@example.com', user_metadata: { display_name: '  ' },
  });
  assert.equal(payloads.primary.display_name, 'newuser');
});

test('rejects a missing signed-in user ID', () => {
  assert.throws(() => buildProfileBootstrapPayloads({ email: 'a@example.com' }), /user ID is required/);
});

test('does not insert when the profile already exists', async () => {
  let inserts = 0;
  const result = await ensureProfileExists({
    user,
    findProfile: async () => true,
    insertProfile: async () => { inserts += 1; },
  });
  assert.deepEqual(result, { created: false, username: null });
  assert.equal(inserts, 0);
});

test('creates the primary profile when the first insert succeeds', async () => {
  const inserted = [];
  const result = await ensureProfileExists({
    user,
    findProfile: async () => false,
    insertProfile: async payload => { inserted.push(payload); },
  });
  assert.deepEqual(result, { created: true, username: 'creatornametest_123456' });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].id, user.id);
});

test('accepts a profile created by a concurrent bootstrap after primary insert fails', async () => {
  let lookups = 0;
  let inserts = 0;
  const result = await ensureProfileExists({
    user,
    findProfile: async () => ++lookups > 1,
    insertProfile: async () => { inserts += 1; throw new Error('duplicate key'); },
  });
  assert.deepEqual(result, { created: false, username: null });
  assert.equal(inserts, 1);
});

test('retries with the deterministic fallback username after primary insert failure', async () => {
  const inserted = [];
  const result = await ensureProfileExists({
    user,
    findProfile: async () => false,
    insertProfile: async payload => {
      inserted.push(payload);
      if (inserted.length === 1) throw new Error('username already taken');
    },
  });
  assert.deepEqual(result, { created: true, username: 'user_1234567890abcdef' });
  assert.equal(inserted.length, 2);
  assert.equal(inserted[1].username, 'user_1234567890abcdef');
});

test('reports the fallback insert error when both username attempts fail', async () => {
  await assert.rejects(
    ensureProfileExists({
      user,
      findProfile: async () => false,
      insertProfile: async payload => {
        throw new Error(payload.username.startsWith('user_') ? 'fallback rejected' : 'primary rejected');
      },
    }),
    /Could not create your profile: fallback rejected/,
  );
});

test('does not hide lookup errors during profile bootstrap', async () => {
  await assert.rejects(
    ensureProfileExists({
      user,
      findProfile: async () => { throw new Error('permission denied'); },
      insertProfile: async () => {},
    }),
    /permission denied/,
  );
});
