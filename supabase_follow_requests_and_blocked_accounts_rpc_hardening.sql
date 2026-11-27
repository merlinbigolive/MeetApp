-- MEEi follow-request and blocked-account RPC hardening.
-- All functions require an authenticated actor; follow requests respect symmetric global blocks.

-- Serialize follow/block changes for the same account pair. SECURITY DEFINER
-- functions bypass table RLS, so the block check must live inside this RPC too.
-- The shared transaction lock prevents a concurrent block from being followed by
-- a stale follow insert (and serializes unblock with new follow requests).
create or replace function public.request_profile_follow(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
  target_private boolean;
  result_status text;
  pair_lock_key text;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Invalid account to follow.';
  end if;

  pair_lock_key := case
    when actor_id::text < target_user_id::text
      then actor_id::text || ':' || target_user_id::text
    else target_user_id::text || ':' || actor_id::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pair_lock_key, 0));

  if public.is_blocked_for_current_user(target_user_id) then
    raise exception 'Cannot follow an account when either account has blocked the other.';
  end if;

  select p.is_private into target_private
  from public.profiles p
  where p.id = target_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;

  result_status := case when target_private then 'pending' else 'accepted' end;

  insert into public.follows (follower_id, followed_id, status)
  values (actor_id, target_user_id, result_status)
  on conflict (follower_id, followed_id)
  do update set status = excluded.status, created_at = now();

  return result_status;
end;
$function$;

revoke all on function public.request_profile_follow(uuid) from public, anon;
grant execute on function public.request_profile_follow(uuid) to authenticated;

-- Keep the same account-pair lock around block creation and follow removal.
create or replace function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
  pair_lock_key text;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Invalid account to block.';
  end if;

  pair_lock_key := case
    when actor_id::text < target_user_id::text
      then actor_id::text || ':' || target_user_id::text
    else target_user_id::text || ':' || actor_id::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pair_lock_key, 0));

  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'Account not found.';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor_id, target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.follows
  where (follower_id = actor_id and followed_id = target_user_id)
     or (follower_id = target_user_id and followed_id = actor_id);

  return true;
end;
$function$;

revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- Serialize unblock with a concurrent follow request for the same pair.
create or replace function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
  pair_lock_key text;
  changed integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Invalid account to unblock.';
  end if;

  pair_lock_key := case
    when actor_id::text < target_user_id::text
      then actor_id::text || ':' || target_user_id::text
    else target_user_id::text || ':' || actor_id::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pair_lock_key, 0));

  delete from public.user_blocks
  where blocker_id = actor_id and blocked_id = target_user_id;

  get diagnostics changed = row_count;
  return changed > 0;
end;
$function$;

revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.get_my_follow_requests()
returns table(
  follower_id uuid,
  username text,
  display_name text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  return query
  select f.follower_id, p.username, p.display_name, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followed_id = actor_id
    and f.status = 'pending'
    and not public.is_blocked_for_current_user(f.follower_id)
  order by f.created_at desc;
end;
$function$;

revoke all on function public.get_my_follow_requests() from public, anon;
grant execute on function public.get_my_follow_requests() to authenticated;

create or replace function public.get_my_blocked_users()
returns table(
  user_id uuid,
  username text,
  display_name text,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  return query
  select b.blocked_id, p.username, p.display_name, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = actor_id
  order by b.created_at desc;
end;
$function$;

revoke all on function public.get_my_blocked_users() from public, anon;
grant execute on function public.get_my_blocked_users() to authenticated;

create or replace function public.respond_to_follow_request(
  target_follower_id uuid,
  approve boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id uuid := auth.uid();
  changed integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_follower_id is null or target_follower_id = actor_id or approve is null then
    raise exception 'Invalid follow request.';
  end if;

  if approve and public.is_blocked_for_current_user(target_follower_id) then
    raise exception 'Cannot accept a follow request when either account has blocked the other.';
  end if;

  if approve then
    update public.follows
    set status = 'accepted'
    where follower_id = target_follower_id
      and followed_id = actor_id
      and status = 'pending';
  else
    delete from public.follows
    where follower_id = target_follower_id
      and followed_id = actor_id
      and status = 'pending';
  end if;

  get diagnostics changed = row_count;
  return changed > 0;
end;
$function$;

revoke all on function public.respond_to_follow_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_follow_request(uuid, boolean) to authenticated;
