-- MEEi LiveKit room mapping.
-- Run after supabase_live_discovery_setup.sql.
-- Room names are server-generated and never contain personal information.

alter table public.live_sessions
  add column if not exists provider_room_name text;

create unique index if not exists live_sessions_provider_room_name_uidx
  on public.live_sessions(provider_room_name)
  where provider_room_name is not null;

comment on column public.live_sessions.provider_room_name is
  'Server-generated LiveKit room name. Never accept arbitrary room names from clients.';
