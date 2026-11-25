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
      from unnest(coalesce(f.proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
      limit 1;
    if current_path is null then
      current_path := 'public';
    end if;
    if not ('pg_temp' = any(string_to_array(replace(current_path, ' ', ''), ','))) then
      current_path := current_path || ', pg_temp';
    end if;
    execute format('alter function %I.%I(%s) set search_path = %s',
                   f.nspname, f.proname, f.args, current_path);
  end loop;
end $$;
