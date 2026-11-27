const test = require('node:test');
const assert = require('node:assert/strict');
const { mapProfileRecord, buildProfileUpdate } = require('../profilePersistence');

test('maps a complete personal profile record to editable fields', () => {
  const result = mapProfileRecord({
    display_name: 'Creator', username: 'creator_1', bio: 'Hello',
    website_url: 'https://example.com', profession_category: 'Artist',
    account_type: 'personal', is_private: true, activity_status: 'ONLINE',
    country_code: 'in', country_name: 'India',
  });
  assert.deepEqual(result, {
    name: 'Creator', username: 'creator_1', bio: 'Hello',
    website: 'https://example.com', occupation: 'Artist',
    accountType: 'personal', businessName: '', businessCategory: '',
    businessDescription: '', isPrivateAccount: true, activity: 'Online',
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
    country_name: 'India', activity_status: 'online',
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

