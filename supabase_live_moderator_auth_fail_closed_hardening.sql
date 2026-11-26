-- MEEi Live moderator RPC authentication fail-closed hardening.
-- Applied directly to Supabase project sbzqxacibcfyyxoysseu.
-- Prevents a NULL auth.uid() from bypassing the creator comparison through SQL three-valued logic.

create or replace function public.is_live_moderator(target_session_id uuid, target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  host_id uuid;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  select user_id
    into host_id
  from public.live_sessions
  where id = target_session_id
    and status = 'live'
    and last_heartbeat_at > now() - interval '90 seconds';

  if host_id is null or actor_id <> host_id then
    raise exception 'Only the Live creator can manage moderator assignments.';
  end if;

  return exists (
    select 1
    from public.live_moderators
    where creator_id = host_id
      and moderator_id = target_user_id
      and revoked_at is null
  );
end;
$function$;

-- Preserve least-privilege RPC access.
revoke all on function public.is_live_moderator(uuid, uuid) from public, anon;
grant execute on function public.is_live_moderator(uuid, uuid) to authenticated;
