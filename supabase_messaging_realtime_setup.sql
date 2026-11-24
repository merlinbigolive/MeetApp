-- Realtime messaging, unread counts, read receipts and conversation integrity.
-- Safe to re-run in Supabase SQL Editor.

-- Prevent a participant from changing the members of an existing conversation.
create or replace function public.prevent_conversation_member_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_one_id is distinct from old.user_one_id
     or new.user_two_id is distinct from old.user_two_id then
    raise exception 'Conversation participants cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_members_immutable on public.conversations;
create trigger conversations_members_immutable
before update on public.conversations
for each row execute function public.prevent_conversation_member_change();

-- Every new message updates its conversation ordering timestamp on the server.
create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_after_message();

-- Recipients can mark unread messages as read without receiving broad UPDATE rights.
create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
  ) then
    raise exception 'Conversation not found';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = target_conversation_id
    and sender_id <> auth.uid()
    and read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Supabase Realtime publishes inserts and read-receipt updates to participants.
alter table public.messages replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication was not found; enable Realtime for public.messages in Supabase Dashboard.';
end $$;

-- Live follow-request updates on the profile screen.
alter table public.follows replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.follows;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication was not found; enable Realtime for public.follows in Supabase Dashboard.';
end $$;
