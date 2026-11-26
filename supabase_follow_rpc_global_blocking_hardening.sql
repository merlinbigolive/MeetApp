-- MEEi follow RPC: enforce symmetric global blocking inside SECURITY DEFINER.
-- Prevents this privileged RPC from bypassing the global block rules.

create or replace function public.request_profile_follow(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  requester uuid := auth.uid();
  target_private boolean;
  result_status text;
begin
  if requester is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or target_user_id = requester then
    raise exception 'Invalid profile to follow.';
  end if;

  if public.is_blocked_for_current_user(target_user_id) then
    raise exception 'You cannot follow an account when either person has blocked the other.';
  end if;

  select p.is_private
    into target_private
  from public.profiles p
  where p.id = target_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;

  result_status := case when target_private then 'pending' else 'accepted' end;

  insert into public.follows (follower_id, followed_id, status)
  values (requester, target_user_id, result_status)
  on conflict (follower_id, followed_id)
  do update set status = excluded.status, created_at = now();

  return result_status;
end;
$function$;

revoke all on function public.request_profile_follow(uuid) from public, anon;
grant execute on function public.request_profile_follow(uuid) to authenticated;
