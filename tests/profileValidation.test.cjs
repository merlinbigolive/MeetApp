const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile } = require('../profileValidation');

const validProfile = {
  name: 'MEEi Creator',
  username: 'meei_creator',
  bio: 'Hello from MEEi',
  accountType: 'personal',
  businessName: '',
  businessCategory: '',
  businessDescription: '',
  website: 'https://example.com',
};

const validate = (overrides = {}) => validateProfile({ ...validProfile, ...overrides });

test('accepts a valid personal profile', () => assert.equal(validate(), null));
test('accepts the minimum and maximum username lengths', () => {
  assert.equal(validate({ username: 'abc' }), null);
  assert.equal(validate({ username: 'a'.repeat(25) }), null);
});
test('rejects an empty or overlong display name', () => {
  assert.equal(validate({ name: '' }).title, 'Check display name');
  assert.equal(validate({ name: 'a'.repeat(41) }).title, 'Check display name');
});
test('rejects usernames outside the allowed format or length', () => {
  for (const username of ['ab', 'a'.repeat(26), 'bad-name', 'UPPERCASE']) {
    assert.equal(validate({ username }).title, 'Check username');
  }
});
test('blocks official and moderation usernames, including numbered MEEi names', () => {
  for (const username of ['meei', 'meeiofficial', 'meei2026', 'moderationteam', 'meeimoderation']) {
    assert.equal(validate({ username }).title, 'Username reserved');
  }
});
test('allows a bio of 300 characters and rejects 301', () => {
  assert.equal(validate({ bio: 'a'.repeat(300) }), null);
  assert.equal(validate({ bio: 'a'.repeat(301) }).title, 'Bio too long');
});
test('requires business name and category for business accounts', () => {
  assert.equal(validate({ accountType: 'business' }).title, 'Business details required');
  assert.equal(validate({ accountType: 'business', businessName: 'Cafe M', businessCategory: 'Food' }), null);
});
test('enforces business field length limits', () => {
  assert.equal(validate({ businessName: 'a'.repeat(81) }).title, 'Business details too long');
  assert.equal(validate({ businessCategory: 'a'.repeat(61) }).title, 'Business details too long');
  assert.equal(validate({ businessDescription: 'a'.repeat(501) }).title, 'Business details too long');
});
test('accepts bare domains and HTTP(S) website URLs', () => {
  assert.equal(validate({ website: 'example.com' }), null);
  assert.equal(validate({ website: 'http://example.com/about' }), null);
  assert.equal(validate({ website: 'https://example.co/path?x=1' }), null);
});
test('rejects malformed website addresses', () => {
  for (const website of ['not a url', 'https://', 'ftp://example.com']) {
    assert.equal(validate({ website }).title, 'Check website');
  }
});
