-- MEEi privacy-first contact discovery.
-- Raw contact phone numbers are transient input only; only keyed HMACs of opted-in,
-- verified MEEi account phone numbers are retained.

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'meei_contact_match_hmac_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'meei_contact_match_hmac_key',
      'Server-only HMAC key for privacy-preserving MEEi contact discovery',
      null
    );
  end if;
end $$;

create table if not exists private.meei_contact_discovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_hmac bytea not null unique,
  phone_confirmed_at timestamptz not null,
  enabled_at timestamptz not null default now()
);
alter table private.meei_contact_discovery enable row level security;
revoke all on private.meei_contact_discovery from public, anon, authenticated;

alter table private.meei_user_rate_limits
  drop constraint if exists meei_user_rate_limits_action_key_check;
alter table private.meei_user_rate_limits
  add constraint meei_user_rate_limits_action_key_check
  check (action_key = any (array[
    'live_chat_send','profile_search','video_search',
    'livekit_start','livekit_join','livekit_activate','livekit_moderate',
    'livekit_heartbeat','livekit_end','livekit_cancel','message_send',
    'conversation_create','contact_sync'
  ]::text[]));

create or replace function private.consume_user_rate_limit(p_action_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action_key not in (
    'live_chat_send','profile_search','video_search',
    'livekit_start','livekit_join','livekit_activate','livekit_moderate',
    'livekit_heartbeat','livekit_end','livekit_cancel','message_send',
    'conversation_create','contact_sync'
  ) or p_limit is null or p_limit < 1 or p_limit > 120
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit configuration' using errcode = '22023';
  end if;
  insert into private.meei_user_rate_limits as limits
    (user_id, action_key, window_started_at, request_count)
  values (v_user_id, p_action_key, v_now, 1)
  on conflict (user_id, action_key) do update
    set window_started_at = case when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now else limits.window_started_at end,
        request_count = case when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1 else limits.request_count + 1 end
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$function$;

create or replace function public.consume_my_meei_rate_limit(p_action_key text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_limit integer;
  v_window integer;
begin
  case p_action_key
    when 'livekit_start' then v_limit := 2; v_window := 3600;
    when 'livekit_join' then v_limit := 30; v_window := 60;
    when 'livekit_activate' then v_limit := 4; v_window := 60;
    when 'livekit_moderate' then v_limit := 20; v_window := 60;
    when 'livekit_heartbeat' then v_limit := 12; v_window := 60;
    when 'livekit_end' then v_limit := 4; v_window := 60;
    when 'livekit_cancel' then v_limit := 4; v_window := 60;
    when 'contact_sync' then v_limit := 6; v_window := 3600;
    else raise exception 'Unsupported rate-limit action' using errcode = '22023';
  end case;
  return private.consume_user_rate_limit(p_action_key, v_limit, v_window);
end;
$function$;
revoke all on function public.consume_my_meei_rate_limit(text) from public, anon;
grant execute on function public.consume_my_meei_rate_limit(text) to authenticated;

create or replace function public.set_my_contact_discoverability(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, auth, private, vault, extensions, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_confirmed_at timestamptz;
  v_secret text;
  v_hash bytea;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_enabled is null then raise exception 'A discoverability choice is required' using errcode = '22023'; end if;

  if not p_enabled then
    delete from private.meei_contact_discovery where user_id = v_user_id;
    return false;
  end if;

  select u.phone, u.phone_confirmed_at
    into v_phone, v_confirmed_at
  from auth.users u where u.id = v_user_id;

  if v_phone is null or v_confirmed_at is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A verified phone number in international format is required' using errcode = '22023';
  end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'meei_contact_match_hmac_key';

  if v_secret is null then raise exception 'Contact discovery is temporarily unavailable' using errcode = '55000'; end if;

  v_hash := extensions.hmac(convert_to(v_phone, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256');
  insert into private.meei_contact_discovery(user_id, phone_hmac, phone_confirmed_at, enabled_at)
  values (v_user_id, v_hash, v_confirmed_at, clock_timestamp())
  on conflict (user_id) do update
    set phone_hmac = excluded.phone_hmac,
        phone_confirmed_at = excluded.phone_confirmed_at,
        enabled_at = excluded.enabled_at;
  return true;
end;
$function$;
revoke all on function public.set_my_contact_discoverability(boolean) from public, anon;
grant execute on function public.set_my_contact_discoverability(boolean) to authenticated;

create or replace function private.invalidate_meei_contact_lookup_on_phone_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $function$
begin
  if new.phone is distinct from old.phone
     or new.phone_confirmed_at is distinct from old.phone_confirmed_at then
    delete from private.meei_contact_discovery where user_id = new.id;
  end if;
  return new;
end;
$function$;
revoke all on function private.invalidate_meei_contact_lookup_on_phone_change() from public, anon, authenticated;
drop trigger if exists meei_invalidate_contact_lookup_on_phone_change on auth.users;
create trigger meei_invalidate_contact_lookup_on_phone_change
after update of phone, phone_confirmed_at on auth.users
for each row execute function private.invalidate_meei_contact_lookup_on_phone_change();

create or replace function public.match_meei_contact_numbers(p_phone_numbers text[], p_requester_id uuid)
returns table(user_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, private, vault, extensions, pg_temp
as $function$
declare
  v_secret text;
  v_hashes bytea[];
  v_phone text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service access required' using errcode = '42501';
  end if;
  if p_requester_id is null or p_phone_numbers is null or cardinality(p_phone_numbers) > 500 then
    raise exception 'Invalid contact lookup request' using errcode = '22023';
  end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'meei_contact_match_hmac_key';
  if v_secret is null then raise exception 'Contact discovery is temporarily unavailable' using errcode = '55000'; end if;

  v_hashes := array[]::bytea[];
  foreach v_phone in array p_phone_numbers loop
    if v_phone ~ '^\+[1-9][0-9]{7,14}$' then
      v_hashes := array_append(v_hashes,
        extensions.hmac(convert_to(v_phone, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'));
    end if;
  end loop;

  return query
    select d.user_id
    from private.meei_contact_discovery d
    where d.phone_hmac = any(v_hashes)
      and d.user_id <> p_requester_id;
end;
$function$;
revoke all on function public.match_meei_contact_numbers(text[], uuid) from public, anon, authenticated;
grant execute on function public.match_meei_contact_numbers(text[], uuid) to service_role;

comment on table private.meei_contact_discovery is
  'Stores only keyed HMACs of verified phone numbers for accounts that explicitly enable contact discoverability. Never stores raw phone numbers.';
