-- MEEi Live discovery: shuffle creators on each discovery refresh.
-- Run after supabase_live_discovery_setup.sql and the live-session privacy patch.
-- Preserves private-profile approval checks and active-session freshness.

create or replace function public.get_live_creators(country_filter text default null)
returns table (
  session_id uuid,
  user_id uuid,
  username text,
  display_name text,
  profession_category text,
  country_code text,
  country_name text,
  title text,
  thumbnail_path text,
  avatar_path text,
  playback_url text,
  started_at timestamptz
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    ls.id,
    ls.user_id,
    pr.username,
    pr.display_name,
    pr.profession_category,
    ls.country_code,
    ls.country_name,
    ls.title,
    ls.thumbnail_path,
    avatar.storage_path,
    ls.playback_url,
    ls.started_at
  from public.live_sessions ls
  join public.profiles pr on pr.id = ls.user_id
  left join lateral (
    select pm.storage_path
    from public.profile_media pm
    where pm.user_id = ls.user_id
      and pm.kind = 'avatar'
    order by pm.position
    limit 1
  ) avatar on true
  where auth.uid() is not null
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds'
    and (country_filter is null or upper(ls.country_code) = upper(country_filter))
    and (
      pr.is_private = false
      or exists (
        select 1
        from public.follows f
        where f.follower_id = auth.uid()
          and f.followed_id = ls.user_id
          and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
      )
      or ls.user_id = auth.uid()
    )
    -- A creator's persistent Live-room block excludes the viewer from discovery.
    and not exists (
      select 1
      from public.live_moderation_actions a
      where a.creator_id = ls.user_id
        and a.viewer_id = auth.uid()
        and a.action = 'block'
        and a.revoked_at is null
        and (a.expires_at is null or a.expires_at > now())
    )
  order by random()
  limit 100;
$$;

revoke all on function public.get_live_creators(text) from public;
grant execute on function public.get_live_creators(text) to authenticated;

comment on function public.get_live_creators(text) is
  'Returns up to 100 fresh eligible Live creators in randomized order on each discovery refresh; respects private-profile approval and creator Live-room blocks.';
