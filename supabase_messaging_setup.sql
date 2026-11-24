-- USay direct messaging: private one-to-one conversations and messages.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references auth.users(id) on delete cascade,
  user_two_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_distinct_users check (user_one_id <> user_two_id),
  constraint conversations_pair_unique unique (user_one_id, user_two_id),
  constraint conversations_sorted_pair check (user_one_id < user_two_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists conversations_user_one_updated_idx on public.conversations(user_one_id, updated_at desc);
create index if not exists conversations_user_two_updated_idx on public.conversations(user_two_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversation participants can read" on public.conversations;
create policy "conversation participants can read" on public.conversations
for select to authenticated using (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "conversation participants can create" on public.conversations;
create policy "conversation participants can create" on public.conversations
for insert to authenticated with check (
  (auth.uid() = user_one_id or auth.uid() = user_two_id) and user_one_id < user_two_id
);

drop policy if exists "conversation participants can update" on public.conversations;
create policy "conversation participants can update" on public.conversations
for update to authenticated using (auth.uid() = user_one_id or auth.uid() = user_two_id)
with check (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "participants can read messages" on public.messages;
create policy "participants can read messages" on public.messages
for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id
    and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid()))
);

drop policy if exists "participants can send messages" on public.messages;
create policy "participants can send messages" on public.messages
for insert to authenticated with check (
  sender_id = auth.uid() and exists (
    select 1 from public.conversations c where c.id = conversation_id
      and (c.user_one_id = auth.uid() or c.user_two_id = auth.uid())
  )
);

drop policy if exists "senders can update own messages" on public.messages;
create policy "senders can update own messages" on public.messages
for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());

grant select, insert, update on public.conversations to authenticated;
grant select, insert, update on public.messages to authenticated;
