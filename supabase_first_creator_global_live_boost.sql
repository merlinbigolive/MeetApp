create table if not exists private.creator_global_live_boosts (
  creator_id uuid primary key references public.profiles(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint creator_global_live_boost_duration check (ends_at = starts_at + interval '5 minutes')
);

create index if not exists creator_global_live_boosts_active_idx
  on private.creator_global_live_boosts (ends_at desc, session_id);

alter table private.creator_global_live_boosts enable row level security;
revoke all on table private.creator_global_live_boosts from public, anon, authenticated, service_role;

create or replace function public.activate_first_creator_global_live_boost(
  p_creator_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_role text;
  v_private boolean;
  v_existing private.creator_global_live_boosts%rowtype;
  v_created private.creator_global_live_boosts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  if v_role <> 'service_role' then
    raise exception 'Only trusted server workflows can activate creator boosts' using errcode = '42501';
  end if;

  if p_creator_id is null or p_session_id is null then
    raise exception 'Creator and Live session are required' using errcode = '22023';
  end if;

  select pr.is_private into v_private
  from public.profiles pr
  where pr.id = p_creator_id;

  if not found or coalesce(v_private, true) then
    return jsonb_build_object('activated', false, 'reason', 'creator_not_public');
  end if;

  if not exists (
    select 1 from public.live_sessions ls
    where ls.id = p_session_id
      and ls.user_id = p_creator_id
      and ls.status = 'live'
      and ls.last_heartbeat_at > v_now - interval '90 seconds'
  ) then
    return jsonb_build_object('activated', false, 'reason', 'live_session_not_active');
  end if;

  if exists (
    select 1 from public.live_pk_battles b
    where b.status = 'active'
      and (b.creator_a_id = p_creator_id or b.creator_b_id = p_creator_id)
      and b.ends_at > v_now
  ) then
    return jsonb_build_object('activated', false, 'reason', 'creator_in_pk');
  end if;

  select * into v_existing
  from private.creator_global_live_boosts
  where creator_id = p_creator_id;

  if found then
    if v_existing.session_id = p_session_id then
      return jsonb_build_object(
        'activated', true,
        'already_activated_for_session', true,
        'boost_id', v_existing.creator_id,
        'starts_at', v_existing.starts_at,
        'ends_at', v_existing.ends_at
      );
    end if;
    return jsonb_build_object('activated', false, 'reason', 'free_boost_already_used');
  end if;

  insert into private.creator_global_live_boosts (creator_id, session_id, starts_at, ends_at)
  values (p_creator_id, p_session_id, v_now, v_now + interval '5 minutes')
  on conflict (creator_id) do nothing
  returning * into v_created;

  if not found then
    select * into v_existing
    from private.creator_global_live_boosts
    where creator_id = p_creator_id;
    if v_existing.session_id = p_session_id then
      return jsonb_build_object(
        'activated', true,
        'already_activated_for_session', true,
        'boost_id', v_existing.creator_id,
        'starts_at', v_existing.starts_at,
        'ends_at', v_existing.ends_at
      );
    end if;
    return jsonb_build_object('activated', false, 'reason', 'free_boost_already_used');
  end if;

  return jsonb_build_object(
    'activated', true,
    'already_activated_for_session', false,
    'boost_id', v_created.creator_id,
    'starts_at', v_created.starts_at,
    'ends_at', v_created.ends_at
  );
end;
$function$;

revoke all on function public.activate_first_creator_global_live_boost(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_first_creator_global_live_boost(uuid, uuid) to service_role;

create or replace function public.get_live_creators(country_filter text default null)
returns table(
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
security definer
set search_path = public, private, pg_temp
as $function$
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
    where pm.user_id = ls.user_id and pm.kind = 'avatar'
    order by pm.position
    limit 1
  ) avatar on true
  left join private.creator_global_live_boosts gb
    on gb.creator_id = ls.user_id
   and gb.session_id = ls.id
   and gb.ends_at > now()
  where auth.uid() is not null
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds'
    and (country_filter is null or upper(ls.country_code) = upper(country_filter))
    and (
      pr.is_private = false
      or exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid()
          and f.followed_id = ls.user_id
          and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
      )
      or ls.user_id = auth.uid()
    )
    and not public.is_blocked_for_current_user(ls.user_id)
    and not exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id = ls.user_id
        and a.viewer_id = auth.uid()
        and (
          a.action = 'block'
          or (a.session_id = ls.id and a.action = 'kickout')
        )
        and a.revoked_at is null
        and (a.expires_at is null or a.expires_at > now())
    )
  order by (gb.creator_id is not null) desc, random()
  limit 100;
$function$;

revoke all on function public.get_live_creators(text) from public, anon;
grant execute on function public.get_live_creators(text) to authenticated, service_role;
