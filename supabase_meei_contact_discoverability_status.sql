create or replace function public.get_my_contact_discoverability()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
  select exists (
    select 1 from private.meei_contact_discovery d
    where d.user_id = auth.uid()
  );
$function$;
revoke all on function public.get_my_contact_discoverability() from public, anon;
grant execute on function public.get_my_contact_discoverability() to authenticated;
