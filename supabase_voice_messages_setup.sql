-- Voice messages: private audio storage and transcript metadata.
-- Safe to re-run in Supabase SQL Editor.

alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_path text,
  add column if not exists transcript text;

alter table public.messages
  drop constraint if exists messages_message_type_check;
alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'voice'));

alter table public.messages
  drop constraint if exists messages_voice_audio_required_check;
alter table public.messages
  add constraint messages_voice_audio_required_check
  check (
    (message_type = 'text' and audio_path is null)
    or (message_type = 'voice' and audio_path is not null)
  );

create index if not exists messages_voice_audio_path_idx
  on public.messages(audio_path) where audio_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('usay-chat-audio', 'usay-chat-audio', false, 26214400, array['audio/wav', 'audio/x-wav'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat audio participants can read" on storage.objects;
create policy "chat audio participants can read"
on storage.objects for select to authenticated
using (
  bucket_id = 'usay-chat-audio'
  and exists (
    select 1 from public.conversations c
    where c.id::text = split_part(name, '/', 2)
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
  )
);

drop policy if exists "chat audio sender can upload" on storage.objects;
create policy "chat audio sender can upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'usay-chat-audio'
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1 from public.conversations c
    where c.id::text = split_part(name, '/', 2)
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
  )
);

drop policy if exists "chat audio sender can delete" on storage.objects;
create policy "chat audio sender can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'usay-chat-audio'
  and split_part(name, '/', 1) = auth.uid()::text
);
