const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sql = readFileSync(
  join(__dirname, '..', 'supabase_security_definer_search_path_hardening.sql'),
  'utf8'
);

test('SECURITY DEFINER hardening removes existing pg_temp entries before appending it last', () => {
  assert.match(sql, /string_agg\(trim\(schema_name\), ', ' order by ordinality\)/i);
  assert.match(sql, /where lower\(trim\(schema_name\)\) <> 'pg_temp'/i);
  assert.match(sql, /current_path := current_path \|\| ', pg_temp';/i);
  assert.doesNotMatch(sql, /if not \('pg_temp' = any\(/i);
});

test('SECURITY DEFINER hardening preserves trusted schema order and defaults an empty path safely', () => {
  assert.match(sql, /unnest\(string_to_array\(current_path, ','\)\) with ordinality/i);
  assert.match(sql, /unnest\(coalesce\(f\.proconfig, array\[\]::text\[\]\)\) as config\(setting\)/i);
  assert.match(sql, /order by ordinality/i);
  assert.match(sql, /if current_path is null then\s+current_path := 'public';\s+end if;/i);
});
