-- MEEi profile/video search API rate limits.
-- Profile search: 20 calls per authenticated user per 60 seconds.
-- Public video search: 30 calls per authenticated user per 60 seconds.
-- Uses private.consume_user_rate_limit created in supabase_meei_live_chat_rate_limit_hardening.sql.

create or replace function public.search_discover_profiles(search_text text)
returns table(
  id uuid, username text, display_name text, bio text, profession_category text,
  website_url text, activity_status text, is_private boolean, account_type text,
  business_name text, business_category text, business_description text
)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $function$
declare
  search_term text := regexp_replace(lower(btrim(coalesce(search_text, ''))), '^[@#]+', '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.consume_user_rate_limit('profile_search', 20, 60) then
    raise exception 'Search limit reached. Please wait before searching again.';
  end if;
  if search_term = '' then return; end if;
  return query
  select p.id, p.username, p.display_name,
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
    and not public.is_blocked_for_current_user(p.id)
    and (
      position(search_term in regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '')) > 0
      or position(search_term in lower(coalesce(p.display_name, ''))) > 0
      or (p.is_private = false and position(search_term in lower(coalesce(p.profession_category, ''))) > 0)
    )
  order by case
    when regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '') = search_term then 0
    when regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '') like search_term || '%' then 1
    else 2 end, p.created_at desc
  limit 50;
end;
$function$;
revoke all on function public.search_discover_profiles(text) from public, anon;
grant execute on function public.search_discover_profiles(text) to authenticated;

create or replace function public.get_public_search_posts(category_filter text default 'videos', search_text text default null)
returns table(id uuid, user_id uuid, caption text, media_path text, content_category text, created_at timestamptz, like_count bigint, view_count bigint)
language sql volatile security definer
set search_path = public, pg_temp
as $function$
  with rate_guard as materialized (
    select auth.uid() as actor_id,
      private.consume_user_rate_limit('video_search', 30, 60) as allowed
    where auth.uid() is not null
  )
  select p.id, p.user_id, p.caption, p.media_path, p.content_category, p.created_at,
    (select count(*) from public.post_likes pl where pl.post_id = p.id),
    (select count(*) from public.post_views pv where pv.post_id = p.id)
  from public.posts p join public.profiles pr on pr.id = p.user_id
  cross join rate_guard rg
  where rg.allowed and p.post_type = 'video' and p.visibility = 'public'
    and pr.is_private = false and p.media_path is not null
    and not public.is_blocked_for_current_user(p.user_id)
    and (category_filter in ('trending', 'all') or p.content_category = category_filter)
    and (nullif(trim(search_text), '') is null
      or coalesce(p.caption, '') ilike '%' || trim(search_text) || '%'
      or coalesce(p.content_category, '') ilike '%' || trim(search_text) || '%'
      or coalesce(pr.profession_category, '') ilike '%' || trim(search_text) || '%'
      or coalesce(pr.business_category, '') ilike '%' || trim(search_text) || '%')
  order by case when category_filter = 'trending'
    then (select count(*) from public.post_likes pl where pl.post_id = p.id)
       + (select count(*) from public.post_views pv where pv.post_id = p.id)
    else 0 end desc, p.created_at desc
  limit 50;
$function$;
revoke all on function public.get_public_search_posts(text,text) from public, anon;
grant execute on function public.get_public_search_posts(text,text) to authenticated;
