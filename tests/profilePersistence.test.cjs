const test = require('node:test');
const assert = require('node:assert/strict');
const { mapProfileRecord, buildProfileUpdate, buildProfileMediaUpdate, mapProfileMediaRecord, resolveProfileCountry } = require('../profilePersistence');

test('maps a complete personal profile record to editable fields', () => {
  const result = mapProfileRecord({
    display_name: 'Creator', username: 'creator_1', bio: 'Hello',
    website_url: 'https://example.com', profession_category: 'Artist',
    account_type: 'personal', is_private: true, activity_status: 'AVAILABLE',
    country_code: 'in', country_name: 'India',
  });
  assert.deepEqual(result, {
    name: 'Creator', username: 'creator_1', bio: 'Hello',
    website: 'https://example.com', occupation: 'Artist',
    accountType: 'personal', businessName: '', businessCategory: '',
    businessDescription: '', isPrivateAccount: true, activity: 'Available',
    countryCode: 'IN', countryName: 'India',
  });
});

test('maps missing profile fields to safe UI defaults', () => {
  const result = mapProfileRecord({});
  assert.equal(result.name, 'MEEi User');
  assert.equal(result.username, 'your_username');
  assert.equal(result.accountType, 'personal');
  assert.equal(result.isPrivateAccount, false);
  assert.equal(result.activity, '');
  assert.equal(result.countryCode, '');
});

test('maps business profile fields without leaking values into personal fields', () => {
  const result = mapProfileRecord({
    account_type: 'business', business_name: 'Cafe M',
    business_category: 'Food', business_description: 'Local cafe',
  });
  assert.equal(result.accountType, 'business');
  assert.equal(result.businessName, 'Cafe M');
  assert.equal(result.businessCategory, 'Food');
  assert.equal(result.businessDescription, 'Local cafe');
});

const base = {
  name: ' Creator ', username: ' @CREATOR_1 ', bio: ' Hello ',
  website: ' https://example.com ', occupation: ' Artist ',
  accountType: 'personal', businessName: 'Old business',
  businessCategory: 'Old category', businessDescription: 'Old description',
  isPrivateAccount: true, countryCode: 'IN', countryName: 'India',
  activity: 'Online',
};

test('builds a normalized personal profile update and clears business-only fields', () => {
  const payload = buildProfileUpdate(base, '2026-11-27T00:00:00.000Z');
  assert.deepEqual(payload, {
    display_name: 'Creator', username: 'creator_1', bio: 'Hello',
    website_url: 'https://example.com', profession_category: 'Artist',
    account_type: 'personal', business_name: null, business_category: null,
    business_description: null, is_private: true, country_code: 'IN',
    country_name: 'India', activity_status: 'available',
    updated_at: '2026-11-27T00:00:00.000Z',
  });
});

test('preserves business fields only for business accounts', () => {
  const payload = buildProfileUpdate({
    ...base, accountType: 'business', businessName: ' Cafe M ',
    businessCategory: ' Food ', businessDescription: ' Local cafe ',
  }, 'timestamp');
  assert.equal(payload.business_name, 'Cafe M');
  assert.equal(payload.business_category, 'Food');
  assert.equal(payload.business_description, 'Local cafe');
  assert.equal(payload.account_type, 'business');
});

test('stores empty optional profile fields as null', () => {
  const payload = buildProfileUpdate({
    ...base, website: ' ', occupation: '', businessDescription: '',
  }, 'timestamp');
  assert.equal(payload.website_url, null);
  assert.equal(payload.profession_category, null);
  assert.equal(payload.business_description, null);
});


test('accepts only activity statuses supported by the database constraint', () => {
  for (const activity of ['Available', 'Busy', 'Work', 'Drive', 'Gym', 'School', 'College']) {
    const payload = buildProfileUpdate({ ...base, activity }, 'timestamp');
    assert.equal(payload.activity_status, activity.toLowerCase());
  }
});

test('falls back to Available for an unsupported activity status', () => {
  const payload = buildProfileUpdate({ ...base, activity: 'Online' }, 'timestamp');
  assert.equal(payload.activity_status, 'available');
  assert.equal(mapProfileRecord({ activity_status: 'online' }).activity, '');
});


test('uses device country only when both saved country fields are missing', () => {
  const result = resolveProfileCountry({
    deviceCountryCode: 'in', deviceCountryName: 'India', getDisplayName: code => ({ IN: 'India' }[code] || code),
  });
  assert.deepEqual(result, {
    countryCode: 'IN', countryName: 'India',
    persistFields: { country_code: 'IN', country_name: 'India' },
  });
});

test('derives and persists a missing country name from the saved country code', () => {
  const result = resolveProfileCountry({
    savedCountryCode: 'us', deviceCountryCode: 'IN', deviceCountryName: 'India',
    getDisplayName: code => code === 'US' ? 'United States' : code,
  });
  assert.deepEqual(result, {
    countryCode: 'US', countryName: 'United States',
    persistFields: { country_name: 'United States' },
  });
});

test('preserves a saved country name when the country code is missing', () => {
  const result = resolveProfileCountry({
    savedCountryName: 'United Kingdom', deviceCountryCode: 'IN', deviceCountryName: 'India',
    getDisplayName: code => code,
  });
  assert.deepEqual(result, {
    countryCode: 'IN', countryName: 'United Kingdom', persistFields: {},
  });
});

test('preserves both saved country fields without writing fallbacks', () => {
  const result = resolveProfileCountry({
    savedCountryCode: 'ca', savedCountryName: 'Canada',
    deviceCountryCode: 'IN', deviceCountryName: 'India', getDisplayName: code => code,
  });
  assert.deepEqual(result, {
    countryCode: 'CA', countryName: 'Canada', persistFields: {},
  });
});

test('builds a least-privilege update payload for an existing profile media row', () => {
  const payload = buildProfileMediaUpdate({
    user_id: 'owner-id',
    kind: 'cover',
    position: 1,
    storage_path: 'owner-id/cover/new-file.jpg',
    media_type: 'image',
    original_name: 'new-file.jpg',
    updated_at: '2026-11-27T00:00:00.000Z',
  });
  assert.deepEqual(payload, {
    position: 1,
    storage_path: 'owner-id/cover/new-file.jpg',
    media_type: 'image',
    original_name: 'new-file.jpg',
    updated_at: '2026-11-27T00:00:00.000Z',
  });
  assert.equal(Object.hasOwn(payload, 'user_id'), false);
  assert.equal(Object.hasOwn(payload, 'kind'), false);
});


test('preserves a saved media row when its signed preview URL cannot be created', () => {
  const row = {
    media_type: 'video',
    original_name: 'cover.mp4',
    storage_path: 'owner-id/cover/cover.mp4',
  };
  assert.deepEqual(mapProfileMediaRecord(row, null), {
    uri: '',
    type: 'video',
    name: 'cover.mp4',
    storagePath: 'owner-id/cover/cover.mp4',
    unavailable: true,
  });
});

test('marks profile media as available when a signed preview URL exists', () => {
  const row = {
    media_type: 'image',
    original_name: null,
    storage_path: 'owner-id/avatar/avatar.jpg',
  };
  assert.deepEqual(mapProfileMediaRecord(row, 'https://signed.example/media'), {
    uri: 'https://signed.example/media',
    type: 'image',
    name: undefined,
    storagePath: 'owner-id/avatar/avatar.jpg',
    unavailable: false,
  });
});


test('keeps profile media metadata when signed URL creation returns an error', async () => {
  const row = { media_type: 'image', original_name: 'avatar.jpg', storage_path: 'owner/avatar.jpg' };
  const expectedError = new Error('storage unavailable');
  const result = await require('../profilePersistence').resolveProfileMediaPreview(row, async () => ({
    data: null, error: expectedError,
  }));
  assert.equal(result.media.unavailable, true);
  assert.equal(result.media.storagePath, row.storage_path);
  assert.equal(result.errorMessage, expectedError.message);
});

test('keeps profile media metadata when signed URL creation throws', async () => {
  const row = { media_type: 'video', original_name: 'cover.mp4', storage_path: 'owner/cover.mp4' };
  const expectedError = new Error('network failure');
  const result = await require('../profilePersistence').resolveProfileMediaPreview(row, async () => {
    throw expectedError;
  });
  assert.deepEqual(result.media, {
    uri: '', type: 'video', name: 'cover.mp4',
    storagePath: row.storage_path, unavailable: true,
  });
  assert.equal(result.errorMessage, expectedError.message);
});

test('returns a usable preview when signed URL creation succeeds', async () => {
  const row = { media_type: 'image', original_name: null, storage_path: 'owner/post.jpg' };
  const result = await require('../profilePersistence').resolveProfileMediaPreview(row, async path => ({
    data: { signedUrl: 'https://signed.example/' + path }, error: null,
  }));
  assert.equal(result.media.uri, 'https://signed.example/owner/post.jpg');
  assert.equal(result.media.unavailable, false);
  assert.equal(result.errorMessage, null);
});
