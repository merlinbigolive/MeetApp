-- MEEi searchable people directory.
-- Run in Supabase SQL Editor after supabase_private_follow_requests_setup.sql.
-- Search returns only public profile details; private profiles expose identity basics only.

create or replace function public.search_discover_profiles(search_text text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  profession_category text,
  website_url text,
  activity_status text,
  is_private boolean,
  account_type text,
  business_name text,
  business_category text,
  business_description text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  search_term text := regexp_replace(lower(btrim(coalesce(search_text, ''))), '^[@#]+', '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if search_term = '' then
    return;
  end if;

  return query
  select
    p.id,
    p.username,
    p.display_name,
    case when p.is_private = false then p.bio else null end,
    case when p.is_private = false then p.profession_category else null end,
    case when p.is_private = false then p.website_url else null end,
    case when p.is_private = false then p.activity_status else null end,
    p.is_private,
    case when p.is_private = false then p.account_type else 'personal' end,
    case when p.is_private = false then p.business_name else null end,
    case when p.is_private = false then p.business_category else null end,
    case when p.is_private = false then p.business_description else null end
  from public.profiles p
  where p.id <> auth.uid()
    and (
      position(search_term in regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '')) > 0
      or position(search_term in lower(coalesce(p.display_name, ''))) > 0
      or (
        p.is_private = false
        and position(search_term in lower(coalesce(p.profession_category, ''))) > 0
      )
    )
  order by
    case
      when regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '') = search_term then 0
      when regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '') like search_term || '%' then 1
      else 2
    end,
    p.created_at desc
  limit 50;
end;
$$;

revoke all on function public.search_discover_profiles(text) from public;
grant execute on function public.search_discover_profiles(text) to authenticated;

comment on function public.search_discover_profiles(text) is
  'Authenticated username/name discovery. Private profiles reveal identity basics only; public profile details remain visibility-filtered.';
