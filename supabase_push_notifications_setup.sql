-- CUCKOO background message push notifications.
-- Safe to re-run. Run this in Supabase SQL Editor after deploying
-- the send-message-push Edge Function and creating its webhook secret.

create extension if not exists pg_net with schema extensions;

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  device_platform text not null check (device_platform in ('android', 'ios')),
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_push_tokens_user_id_idx
  on public.user_push_tokens(user_id);

alter table public.user_push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.user_push_tokens;
create policy "users read own push tokens" on public.user_push_tokens
for select to authenticated using (user_id = auth.uid());

drop policy if exists "users register own push tokens" on public.user_push_tokens;
create policy "users register own push tokens" on public.user_push_tokens
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users update own push tokens" on public.user_push_tokens;
create policy "users update own push tokens" on public.user_push_tokens
for update to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users delete own push tokens" on public.user_push_tokens;
create policy "users delete own push tokens" on public.user_push_tokens
for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.user_push_tokens to authenticated;
grant all on public.user_push_tokens to service_role;

-- Create one random webhook secret in Supabase Vault. Re-running this script
-- keeps the existing secret. Copy the SELECT result into the Edge Function
-- secret named CUCKOO_PUSH_WEBHOOK_SECRET.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'cuckoo_push_webhook_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'cuckoo_push_webhook_secret',
      'Authenticates the CUCKOO message-push database trigger'
    );
  end if;
end;
$$;

create or replace function public.notify_cuckoo_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'cuckoo_push_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise warning 'CUCKOO push webhook secret is not configured; message push skipped.';
    return new;
  end if;

  perform net.http_post(
    url := 'https://sbzqxacibcfyyxoysseu.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cuckoo-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );

  return new;
end;
$$;

drop trigger if exists send_cuckoo_push_after_message_insert on public.messages;
create trigger send_cuckoo_push_after_message_insert
after insert on public.messages
for each row execute function public.notify_cuckoo_message_push();

