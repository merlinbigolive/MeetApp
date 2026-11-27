-- Pin pg_temp last for every public SECURITY DEFINER function.
-- Preserve the existing trusted schemas (notably net and vault for push trigger).
do $$
declare
  f record;
  current_path text;
begin
  for f in
    select p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    select split_part(setting, '=', 2)
      into current_path
      from unnest(coalesce(f.proconfig, array[]::text[])) as config(setting)
      where setting like 'search_path=%'
      limit 1;
    if current_path is null then
      current_path := 'public';
    end if;
    -- Remove every existing pg_temp entry, then append it exactly once.
    -- Merely checking presence is insufficient: pg_temp must be last.
    select string_agg(trim(schema_name), ', ' order by ordinality)
      into current_path
      from unnest(string_to_array(current_path, ',')) with ordinality
           as path_item(schema_name, ordinality)
      where lower(trim(schema_name)) <> 'pg_temp'
        and trim(schema_name) <> '';
    if current_path is null then
      current_path := 'public';
    end if;
    current_path := current_path || ', pg_temp';
    execute format('alter function %I.%I(%s) set search_path = %s',
                   f.nspname, f.proname, f.args, current_path);
  end loop;
end $$;
