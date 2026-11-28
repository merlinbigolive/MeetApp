const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('AuthGate invokes profile bootstrap when an authenticated session is available', () => {
  const source = readFileSync(join(__dirname, '..', 'AuthGate.tsx'), 'utf8');
  assert.match(
    source,
    /const createProfileIfMissing = async \(\) => \{[\s\S]*?\n    \};\n\s*void createProfileIfMissing\(\);/,
    'the profile bootstrap effect must execute its async bootstrap function'
  );
});
