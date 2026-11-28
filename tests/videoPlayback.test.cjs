const test = require('node:test');
const assert = require('node:assert/strict');
const { selectActiveVideo } = require('../videoPlayback');

test('returns null when no video is visible', () => {
  assert.equal(selectActiveVideo({}), null);
  assert.equal(selectActiveVideo(null), null);
});

test('selects only the most visible video above the visibility threshold', () => {
  assert.equal(selectActiveVideo({ first: 0.31, second: 0.82, third: 0.64 }), 'second');
});

test('activates a video exactly at the default visibility threshold', () => {
  assert.equal(selectActiveVideo({ edge: 0.25 }), 'edge');
});

test('does not activate a video below the default threshold', () => {
  assert.equal(selectActiveVideo({ first: 0.24, second: 0.1 }), null);
});

test('supports a caller-defined visibility threshold', () => {
  assert.equal(selectActiveVideo({ first: 0.3 }, 0.2), 'first');
  assert.equal(selectActiveVideo({ first: 0.3 }, 0.4), null);
});

test('ignores invalid ratios and values outside the zero-to-one range', () => {
  assert.equal(selectActiveVideo({
    invalid: Number.NaN,
    negative: -0.1,
    over: 1.1,
    hidden: 0,
    visible: 0.7,
  }), 'visible');
});

test('keeps the first encountered video on an exact visibility tie', () => {
  assert.equal(selectActiveVideo({ first: 0.7, second: 0.7 }), 'first');
});
