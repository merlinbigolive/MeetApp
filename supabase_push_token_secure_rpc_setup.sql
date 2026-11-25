-- MEEi secure push-token registration without exposing token rows to clients.
-- Clients use these authenticated RPCs; direct SELECT on user_push_tokens stays revoked.

create or replace function public.register_my_push_token(
  p_expo_push_token text,
  p_device_platform text,
  p_sound_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_expo_push_token is null
     or length(btrim(p_expo_push_token)) < 20
     or length(btrim(p_expo_push_token)) > 512 then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;

  if p_device_platform not in ('android', 'ios') then
    raise exception 'Unsupported device platform' using errcode = '22023';
  end if;

  insert into public.user_push_tokens (
    user_id, expo_push_token, device_platform, sound_enabled, updated_at
  )
  values (
    current_user_id, btrim(p_expo_push_token), p_device_platform,
    coalesce(p_sound_enabled, true), now()
  )
  on conflict (expo_push_token) do update
    set device_platform = excluded.device_platform,
        sound_enabled = excluded.sound_enabled,
        updated_at = now()
    where public.user_push_tokens.user_id = current_user_id;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'Push token is already registered to another account'
      using errcode = '23505';
  end if;
end;
$$;

create or replace function public.set_my_push_sound_preference(p_sound_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.user_push_tokens
     set sound_enabled = coalesce(p_sound_enabled, true),
         updated_at = now()
   where user_id = auth.uid();
end;
$$;

revoke all on function public.register_my_push_token(text, text, boolean) from public, anon;
revoke all on function public.set_my_push_sound_preference(boolean) from public, anon;
grant execute on function public.register_my_push_token(text, text, boolean) to authenticated;
grant execute on function public.set_my_push_sound_preference(boolean) to authenticated;
