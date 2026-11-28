const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LIGHT_C,
  DARK_C,
  isAppearanceMode,
  resolveBasePalette,
} = require('../meeiTheme');

test('preserves the approved white default palette', () => {
  assert.equal(LIGHT_C.bg, '#FFFFFF');
  assert.equal(LIGHT_C.panel, '#FFFFFF');
  assert.equal(LIGHT_C.text, '#172B3A');
  assert.equal(LIGHT_C.pink, '#258FEA');
});

test('preserves the existing dark appearance palette', () => {
  assert.equal(DARK_C.bg, '#0B1420');
  assert.equal(DARK_C.panel, '#121F2D');
  assert.equal(DARK_C.text, '#EAF3FA');
  assert.equal(DARK_C.pink, '#49A9F5');
});

test('system appearance follows the OS and defaults safely to light', () => {
  assert.equal(resolveBasePalette('system', 'dark'), DARK_C);
  assert.equal(resolveBasePalette('system', 'light'), LIGHT_C);
  assert.equal(resolveBasePalette('system', null), LIGHT_C);
  assert.equal(resolveBasePalette('system', undefined), LIGHT_C);
});

test('explicit light and dark choices override the OS appearance', () => {
  assert.equal(resolveBasePalette('light', 'dark'), LIGHT_C);
  assert.equal(resolveBasePalette('dark', 'light'), DARK_C);
});

test('accepts only supported persisted appearance values', () => {
  for (const value of ['system', 'light', 'dark']) assert.equal(isAppearanceMode(value), true);
  for (const value of [null, undefined, '', 'rainbow', 'premium', 'DARK', 1, {}]) {
    assert.equal(isAppearanceMode(value), false);
  }
});

test('base palettes are immutable to prevent accidental shared mutation', () => {
  assert.equal(Object.isFrozen(LIGHT_C), true);
  assert.equal(Object.isFrozen(DARK_C), true);
});
