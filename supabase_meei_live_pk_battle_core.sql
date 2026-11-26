-- MEEi Live PK 1v1 battle schema, RPCs, moderation, locks and security.
-- Current source snapshot of deployed Supabase definitions.

create table if not exists public.live_pk_battles (
  id uuid primary key default gen_random_uuid(),
  session_a_id uuid not null references public.live_sessions(id) on delete cascade,
  session_b_id uuid not null references public.live_sessions(id) on delete cascade,
  creator_a_id uuid not null references public.profiles(id) on delete cascade,
  creator_b_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes in (5,10,15)),
  status text not null default 'invited' check (status in ('invited','active','declined','ended','expired','cancelled')),
  created_at timestamptz not null default now(),
  invite_expires_at timestamptz not null default (now()+interval '45 seconds'),
  started_at timestamptz, ends_at timestamptz, ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  check (session_a_id < session_b_id),
  check (creator_a_id <> creator_b_id),
  check ((status='active' and started_at is not null and ends_at is not null) or status<>'active')
);
create unique index if not exists live_pk_active_session_a_uq on public.live_pk_battles(session_a_id) where status in ('invited','active');
create unique index if not exists live_pk_active_session_b_uq on public.live_pk_battles(session_b_id) where status in ('invited','active');
create index if not exists live_pk_invited_creator_idx on public.live_pk_battles(creator_a_id,creator_b_id,invite_expires_at) where status='invited';
create index if not exists live_pk_active_ends_idx on public.live_pk_battles(ends_at) where status='active';

create table if not exists public.live_pk_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.live_pk_battles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_viewer_id uuid not null references public.profiles(id) on delete cascade,
  moderation_action text not null check (moderation_action in ('mute','kickout')),
  created_at timestamptz not null default now()
);
create table if not exists public.live_pk_session_locks (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  battle_id uuid not null references public.live_pk_battles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.live_pk_battles enable row level security;
alter table public.live_pk_moderation_audit enable row level security;
alter table public.live_pk_session_locks enable row level security;
revoke all on public.live_pk_battles from anon,authenticated;
revoke all on public.live_pk_moderation_audit from anon,authenticated;
revoke all on public.live_pk_session_locks from anon,authenticated;
grant all on public.live_pk_battles to service_role;
grant all on public.live_pk_moderation_audit to service_role;
grant all on public.live_pk_session_locks to service_role;

CREATE OR REPLACE FUNCTION public.consume_my_meei_rate_limit(p_action_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_limit integer; v_window integer;
begin
  case p_action_key
    when 'livekit_start' then v_limit:=2; v_window:=3600;
    when 'livekit_join' then v_limit:=30; v_window:=60;
    when 'livekit_activate' then v_limit:=4; v_window:=60;
    when 'livekit_moderate' then v_limit:=20; v_window:=60;
    when 'livekit_heartbeat' then v_limit:=12; v_window:=60;
    when 'livekit_end' then v_limit:=4; v_window:=60;
    when 'livekit_cancel' then v_limit:=4; v_window:=60;
    when 'livekit_pk_invite' then v_limit:=5; v_window:=3600;
    when 'livekit_pk_respond' then v_limit:=20; v_window:=60;
    when 'livekit_pk_join' then v_limit:=30; v_window:=60;
    when 'livekit_pk_moderate' then v_limit:=20; v_window:=60;
    when 'livekit_pk_end' then v_limit:=5; v_window:=60;
    when 'livekit_pk_inbox' then v_limit:=30; v_window:=60;
    when 'livekit_chat_join' then v_limit:=30; v_window:=60;
    when 'contact_sync' then v_limit:=6; v_window:=3600;
    else raise exception 'Unsupported rate-limit action' using errcode='22023';
  end case;
  return private.consume_user_rate_limit(p_action_key,v_limit,v_window);
end;
$function$


CREATE OR REPLACE FUNCTION public.create_live_pk_invite_server(actor_id uuid, target_opponent_session_id uuid, selected_duration_minutes integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := actor_id;
  own_session public.live_sessions%rowtype;
  opponent_session public.live_sessions%rowtype;
  battle_id uuid;
begin
  if actor is null then raise exception 'Sign in required.'; end if;
  if selected_duration_minutes not in (5,10,15) then raise exception 'Choose 5, 10 or 15 minutes.'; end if;
  select * into own_session from public.live_sessions
  where user_id=actor and status='live' and last_heartbeat_at>now()-interval '90 seconds'
  order by started_at desc nulls last limit 1;
  if own_session.id is null then raise exception 'You must be Live to invite an opponent.'; end if;
  perform 1 from public.live_sessions where id in (own_session.id,target_opponent_session_id) order by id for update;
  select * into opponent_session from public.live_sessions
  where id=target_opponent_session_id and status='live'
    and last_heartbeat_at>now()-interval '90 seconds';
  if opponent_session.id is null then raise exception 'This creator is no longer Live.'; end if;
  if opponent_session.user_id=actor then raise exception 'You cannot PK with yourself.'; end if;
  update public.live_pk_battles
  set status=case when status='invited' and invite_expires_at<=now() then 'expired'
                  when status='active' and ends_at<=now() then 'ended' else status end,
      ended_at=case when (status='invited' and invite_expires_at<=now())
                     or (status='active' and ends_at<=now()) then now() else ended_at end
  where status in ('invited','active')
    and (session_a_id in (own_session.id,opponent_session.id)
      or session_b_id in (own_session.id,opponent_session.id));
  if exists (
    select 1 from public.live_pk_battles where status in ('invited','active')
      and (session_a_id in (own_session.id,opponent_session.id)
        or session_b_id in (own_session.id,opponent_session.id))
  ) then raise exception 'One of these creators is already in a PK or has a pending invite.'; end if;
  if own_session.id<opponent_session.id then
    insert into public.live_pk_battles(session_a_id,session_b_id,creator_a_id,creator_b_id,invited_by,duration_minutes)
    values(own_session.id,opponent_session.id,own_session.user_id,opponent_session.user_id,actor,selected_duration_minutes)
    returning id into battle_id;
  else
    insert into public.live_pk_battles(session_a_id,session_b_id,creator_a_id,creator_b_id,invited_by,duration_minutes)
    values(opponent_session.id,own_session.id,opponent_session.user_id,own_session.user_id,actor,selected_duration_minutes)
    returning id into battle_id;
  end if;
  return battle_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.end_live_pk_battle(target_battle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  update public.live_pk_battles
  set status='ended', ended_at=now(), ended_by=auth.uid()
  where id=target_battle_id
    and status in ('invited','active')
    and auth.uid() in (creator_a_id,creator_b_id);
  if not found then raise exception 'You cannot end this PK or it has already ended.'; end if;
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.end_live_pk_when_session_ends()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.status is distinct from new.status and new.status='ended' then
    update public.live_pk_battles
    set status='ended', ended_at=coalesce(ended_at,now())
    where status in ('invited','active')
      and (session_a_id=new.id or session_b_id=new.id);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_live_pk_chat_messages(target_session_id uuid, target_membership_id uuid, message_limit integer DEFAULT 80)
 RETURNS TABLE(id uuid, user_id uuid, username text, body text, created_at timestamp with time zone, avatar_path text, origin_session_id uuid, side_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid();
  battle public.live_pk_battles%rowtype;
  host_id uuid;
  joined_at timestamptz;
  opponent_session_id uuid;
  opponent_allowed boolean;
begin
  if actor is null then raise exception 'Sign in required.'; end if;
  select * into battle from public.live_pk_battles b
  where (b.session_a_id=target_session_id or b.session_b_id=target_session_id)
    and b.status='active' and b.ends_at > now()
  order by b.created_at desc limit 1;
  if battle.id is null then raise exception 'No active PK for this Live.'; end if;

  select ls.user_id into host_id from public.live_sessions ls where ls.id=target_session_id;
  opponent_session_id := case when battle.session_a_id=target_session_id then battle.session_b_id else battle.session_a_id end;

  if actor=host_id then
    joined_at := battle.started_at;
  else
    if not coalesce((select ce.allowed from public.check_live_entry(target_session_id) ce),false) then
      raise exception 'You are not allowed to view this PK.';
    end if;
    select cm.joined_at into joined_at from public.live_chat_memberships cm
    where cm.id=target_membership_id and cm.session_id=target_session_id
      and cm.viewer_id=actor and cm.left_at is null;
    if joined_at is null then raise exception 'Invalid or ended Live chat membership.'; end if;
    select ce.allowed into opponent_allowed from public.check_live_entry(opponent_session_id) ce;
    if not coalesce(opponent_allowed,false) then
      raise exception 'You are not allowed to view the opponent side of this PK.';
    end if;
    joined_at := greatest(joined_at,battle.started_at);
  end if;

  return query
  select m.id,m.sender_id,p.username,m.body,m.created_at,avatar.storage_path,m.session_id,
    case when m.session_id=target_session_id then 'Your side' else 'Opponent side' end
  from public.live_chat_messages m
  join public.live_sessions message_session on message_session.id=m.session_id
  join public.profiles p on p.id=m.sender_id
  left join lateral (
    select pm.storage_path from public.profile_media pm
    where pm.user_id=m.sender_id and pm.kind='avatar' order by pm.position limit 1
  ) avatar on true
  where m.session_id in (battle.session_a_id,battle.session_b_id)
    and m.created_at>=joined_at
    and not exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id=message_session.user_id and a.viewer_id=m.sender_id
        and a.revoked_at is null and (a.expires_at is null or a.expires_at>now())
        and (a.action='block' or (a.session_id=m.session_id and a.action in ('mute','kickout')))
    )
  order by m.created_at desc
  limit greatest(1,least(coalesce(message_limit,80),150));
end;
$function$


CREATE OR REPLACE FUNCTION public.get_live_pk_state(target_session_id uuid)
 RETURNS TABLE(battle_id uuid, status text, duration_minutes integer, started_at timestamp with time zone, ends_at timestamp with time zone, opponent_session_id uuid, opponent_user_id uuid, opponent_username text, opponent_display_name text, invite_is_outgoing boolean, server_now timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid();
  battle public.live_pk_battles%rowtype;
  host_id uuid;
  opponent_session_id uuid;
  opponent_allowed boolean;
begin
  if actor is null then raise exception 'Sign in required.'; end if;
  update public.live_pk_battles b set status='expired', ended_at=now()
  where b.status='invited' and b.invite_expires_at<=now()
    and (b.session_a_id=target_session_id or b.session_b_id=target_session_id);
  update public.live_pk_battles b set status='ended', ended_at=now()
  where b.status='active' and b.ends_at<=now()
    and (b.session_a_id=target_session_id or b.session_b_id=target_session_id);
  update public.live_pk_battles b set status='cancelled', ended_at=now()
  where b.status in ('invited','active')
    and (b.session_a_id=target_session_id or b.session_b_id=target_session_id)
    and not exists (
      select 1 from public.live_sessions ls
      where ls.id in (b.session_a_id,b.session_b_id)
        and ls.status='live' and ls.last_heartbeat_at>now()-interval '90 seconds'
      group by b.id having count(*)=2
    );
  select * into battle from public.live_pk_battles b
  where (b.session_a_id=target_session_id or b.session_b_id=target_session_id)
    and b.status in ('invited','active')
  order by b.created_at desc limit 1;
  if battle.id is null then return; end if;
  select ls.user_id into host_id from public.live_sessions ls where ls.id=target_session_id;
  opponent_session_id := case when battle.session_a_id=target_session_id then battle.session_b_id else battle.session_a_id end;
  if actor<>host_id then
    if not coalesce((select ce.allowed from public.check_live_entry(target_session_id) ce),false) then
      raise exception 'You are not allowed to view this PK.';
    end if;
    select ce.allowed into opponent_allowed from public.check_live_entry(opponent_session_id) ce;
    if not coalesce(opponent_allowed,false) then
      raise exception 'You are not allowed to view the opponent side of this PK.';
    end if;
  end if;
  return query
  select battle.id,battle.status,battle.duration_minutes,battle.started_at,battle.ends_at,
    opponent_session_id,
    case when battle.session_a_id=target_session_id then battle.creator_b_id else battle.creator_a_id end,
    p.username,p.display_name,(battle.invited_by=actor),now()
  from public.profiles p
  where p.id=case when battle.session_a_id=target_session_id then battle.creator_b_id else battle.creator_a_id end;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_my_live_pk_invites()
 RETURNS TABLE(battle_id uuid, opponent_session_id uuid, opponent_user_id uuid, opponent_username text, opponent_display_name text, duration_minutes integer, invite_expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select b.id,
    case when b.creator_a_id = auth.uid() then b.session_b_id else b.session_a_id end,
    b.invited_by,
    p.username, p.display_name, b.duration_minutes, b.invite_expires_at
  from public.live_pk_battles b
  join public.profiles p on p.id = b.invited_by
  where b.status='invited'
    and b.invited_by <> auth.uid()
    and auth.uid() in (b.creator_a_id,b.creator_b_id)
    and b.invite_expires_at > now()
  order by b.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.moderate_live_pk_viewer_server(actor_id uuid, target_battle_id uuid, target_viewer_id uuid, moderation_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := actor_id;
  battle public.live_pk_battles%rowtype;
  actor_allowed boolean;
begin
  if actor is null then raise exception 'Sign in required.'; end if;
  if moderation_action not in ('mute','kickout') then raise exception 'Unsupported PK moderation action.'; end if;
  if target_viewer_id in (
    select creator_a_id from public.live_pk_battles where id=target_battle_id
    union select creator_b_id from public.live_pk_battles where id=target_battle_id
  ) then raise exception 'A PK creator cannot be moderated as a viewer.'; end if;
  select * into battle from public.live_pk_battles
  where id=target_battle_id and status='active' and ends_at>now();
  if battle.id is null then raise exception 'This PK is no longer active.'; end if;
  select (
    actor in (battle.creator_a_id,battle.creator_b_id)
    or exists(select 1 from public.live_moderators lm where lm.creator_id=battle.creator_a_id and lm.moderator_id=actor and lm.revoked_at is null)
    or exists(select 1 from public.live_moderators lm where lm.creator_id=battle.creator_b_id and lm.moderator_id=actor and lm.revoked_at is null)
  ) into actor_allowed;
  if not actor_allowed then raise exception 'Only a PK creator or authorized room admin can moderate.'; end if;
  insert into public.live_moderation_actions(creator_id,viewer_id,session_id,action,expires_at)
  values
    (battle.creator_a_id,target_viewer_id,battle.session_a_id,moderation_action,
      case when moderation_action='mute' then now()+interval '15 minutes' else null end),
    (battle.creator_b_id,target_viewer_id,battle.session_b_id,moderation_action,
      case when moderation_action='mute' then now()+interval '15 minutes' else null end);
  insert into public.live_pk_moderation_audit(battle_id,actor_id,target_viewer_id,moderation_action)
  values(battle.id,actor,target_viewer_id,moderation_action);
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.respond_live_pk_invite_server(actor_id uuid, target_battle_id uuid, accept_invite boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := actor_id;
  battle public.live_pk_battles%rowtype;
  session_count integer;
begin
  if actor is null then raise exception 'Sign in required.'; end if;
  select * into battle from public.live_pk_battles where id=target_battle_id for update;
  if battle.id is null or battle.status<>'invited' then return false; end if;
  if battle.invited_by=actor or actor not in (battle.creator_a_id,battle.creator_b_id) then
    raise exception 'Only the invited creator can respond.';
  end if;
  if battle.invite_expires_at<=now() then
    update public.live_pk_battles set status='expired',ended_at=now() where id=battle.id;
    return false;
  end if;
  select count(*) into session_count from public.live_sessions
  where id in (battle.session_a_id,battle.session_b_id)
    and status='live' and last_heartbeat_at>now()-interval '90 seconds';
  if session_count<>2 then
    update public.live_pk_battles set status='cancelled',ended_at=now() where id=battle.id;
    return false;
  end if;
  if accept_invite then
    update public.live_pk_battles set status='active',started_at=now(),
      ends_at=now()+make_interval(mins=>duration_minutes) where id=battle.id;
  else
    update public.live_pk_battles set status='declined',ended_at=now() where id=battle.id;
  end if;
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_live_pk_session_locks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  inserted_count integer;
begin
  if tg_op='INSERT' then
    if new.status in ('invited','active') then
      insert into public.live_pk_session_locks(session_id,battle_id)
      values (new.session_a_id,new.id),(new.session_b_id,new.id)
      on conflict (session_id) do nothing;
      get diagnostics inserted_count = row_count;
      if inserted_count <> 2 then
        raise exception 'One of these creators is already in another PK.';
      end if;
    end if;
    return new;
  end if;

  if old.status in ('invited','active') and new.status not in ('invited','active') then
    delete from public.live_pk_session_locks where battle_id=old.id;
  elsif old.status not in ('invited','active') and new.status in ('invited','active') then
    insert into public.live_pk_session_locks(session_id,battle_id)
    values (new.session_a_id,new.id),(new.session_b_id,new.id)
    on conflict (session_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count <> 2 then
      raise exception 'One of these creators is already in another PK.';
    end if;
  end if;
  return new;
end;
$function$


revoke all on function public.create_live_pk_invite_server(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.respond_live_pk_invite_server(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.moderate_live_pk_viewer_server(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_live_pk_invite_server(uuid,uuid,integer) to service_role;
grant execute on function public.respond_live_pk_invite_server(uuid,uuid,boolean) to service_role;
grant execute on function public.moderate_live_pk_viewer_server(uuid,uuid,uuid,text) to service_role;

revoke all on function public.list_my_live_pk_invites() from public,anon;
revoke all on function public.get_live_pk_state(uuid) from public,anon;
revoke all on function public.end_live_pk_battle(uuid) from public,anon;
revoke all on function public.get_live_pk_chat_messages(uuid,uuid,integer) from public,anon;
grant execute on function public.list_my_live_pk_invites() to authenticated;
grant execute on function public.get_live_pk_state(uuid) to authenticated;
grant execute on function public.end_live_pk_battle(uuid) to authenticated;
grant execute on function public.get_live_pk_chat_messages(uuid,uuid,integer) to authenticated;

create or replace function public.sync_live_pk_session_locks()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare inserted_count integer;
begin
  if tg_op='INSERT' then
    if new.status in ('invited','active') then
      insert into public.live_pk_session_locks(session_id,battle_id)
      values (new.session_a_id,new.id),(new.session_b_id,new.id)
      on conflict (session_id) do nothing;
      get diagnostics inserted_count = row_count;
      if inserted_count <> 2 then raise exception 'One of these creators is already in another PK.'; end if;
    end if;
    return new;
  end if;
  if old.status in ('invited','active') and new.status not in ('invited','active') then
    delete from public.live_pk_session_locks where battle_id=old.id;
  elsif old.status not in ('invited','active') and new.status in ('invited','active') then
    insert into public.live_pk_session_locks(session_id,battle_id)
    values (new.session_a_id,new.id),(new.session_b_id,new.id)
    on conflict (session_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count <> 2 then raise exception 'One of these creators is already in another PK.'; end if;
  end if;
  return new;
end; $$;

create or replace function public.end_live_pk_when_session_ends()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status is distinct from new.status and new.status='ended' then
    update public.live_pk_battles set status='ended',ended_at=coalesce(ended_at,now())
    where status in ('invited','active') and (session_a_id=new.id or session_b_id=new.id);
  end if;
  return new;
end; $$;

drop trigger if exists live_pk_session_locks_sync on public.live_pk_battles;
create trigger live_pk_session_locks_sync after insert or update of status on public.live_pk_battles
for each row execute function public.sync_live_pk_session_locks();
drop trigger if exists live_session_end_pk_cleanup on public.live_sessions;
create trigger live_session_end_pk_cleanup after update of status on public.live_sessions
for each row execute function public.end_live_pk_when_session_ends();

insert into public.live_pk_session_locks(session_id,battle_id)
select session_a_id,id from public.live_pk_battles where status in ('invited','active')
union all
select session_b_id,id from public.live_pk_battles where status in ('invited','active')
on conflict (session_id) do nothing;
