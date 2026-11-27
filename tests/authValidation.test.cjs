const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, isValidEmail, normalizeOtp, isValidOtp } = require('../authValidation');

test('normalizes email by trimming whitespace and lowercasing', () => {
  assert.equal(normalizeEmail('  Creator@Example.COM  '), 'creator@example.com');
});

test('accepts valid email addresses after normalization', () => {
  for (const email of ['creator@example.com', 'first.last+meei@example.co.in', 'user_123@sub.example.org']) {
    assert.equal(isValidEmail(normalizeEmail(email)), true, email);
  }
});

test('rejects malformed email addresses', () => {
  for (const email of ['', '   ', 'missing-at.example.com', '@example.com', 'user@', 'user@example', 'two@@example.com', 'user name@example.com']) {
    assert.equal(isValidEmail(normalizeEmail(email)), false, email);
  }
});

test('normalizes OTP by trimming surrounding whitespace', () => {
  assert.equal(normalizeOtp('  123456  '), '123456');
});

test('accepts exactly six numeric OTP digits', () => {
  for (const token of ['000000', '123456', '999999']) {
    assert.equal(isValidOtp(token), true, token);
  }
});

test('rejects OTP values that are not exactly six digits', () => {
  for (const token of ['', '12345', '1234567', '12 456', 'abcdef', '１２３４５６', '12345a']) {
    assert.equal(isValidOtp(token), false, token);
  }
});
