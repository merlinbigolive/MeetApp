-- MEEi push webhook secret migration.
-- Safe rollout: copies the existing Vault secret without returning its value,
-- keeps the legacy Vault secret, and updates the message trigger to send the
-- MEEi header. The Edge Function accepts both headers during transition.

do $$
declare
  old_value text;
begin
  select decrypted_secret into old_value
  from vault.decrypted_secrets
  where name = 'cuckoo_push_webhook_secret'
  limit 1;

  if old_value is null then
    raise exception 'Existing push webhook secret is missing; migration stopped safely';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'meei_push_webhook_secret'
  ) then
    perform vault.create_secret(
      old_value,
      'meei_push_webhook_secret',
      'MEEi message push webhook authentication'
    );
  end if;
end $$;

create or replace function public.notify_cuckoo_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $function$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'meei_push_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise warning 'MEEi push webhook secret is not configured; message push skipped.';
    return new;
  end if;

  perform net.http_post(
    url := 'https://sbzqxacibcfyyxoysseu.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-meei-webhook-secret', webhook_secret,
      'x-cuckoo-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );

  return new;
end;
$function$;

-- Rename legacy internal trigger/function identifiers after the MEEi secret is active.
alter function public.notify_cuckoo_message_push()
rename to notify_meei_message_push;

drop trigger if exists send_cuckoo_push_after_message_insert on public.messages;
create trigger send_meei_push_after_message_insert
after insert on public.messages
for each row execute function public.notify_meei_message_push();
