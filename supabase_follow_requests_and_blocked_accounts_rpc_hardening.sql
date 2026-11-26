-- MEEi follow-request and blocked-account RPC hardening.
-- All functions require an authenticated actor; follow requests respect symmetric global blocks.

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
