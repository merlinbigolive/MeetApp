-- MEEi public-feed emoji reactions.
-- Run once in Supabase SQL Editor. Safe to re-run.

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in (
    '❤️','😂','😍','🔥','👏','😮','😢','👍',
    '🎉','🤔','🥰','🙏','💯','🤩','😡','🫶'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists post_reactions_post_idx
  on public.post_reactions (post_id, created_at desc);

create index if not exists post_reactions_user_idx
  on public.post_reactions (user_id, post_id);

alter table public.post_reactions enable row level security;

drop policy if exists "post_reactions_select_visible_posts" on public.post_reactions;
create policy "post_reactions_select_visible_posts" on public.post_reactions
for select to authenticated
using (
  exists (
    select 1
    from public.posts p
    join public.profiles owner_profile on owner_profile.id = p.user_id
    where p.id = post_reactions.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and coalesce(owner_profile.is_private, false) = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        ))
      )
  )
);

drop policy if exists "post_reactions_insert_visible_posts" on public.post_reactions;
create policy "post_reactions_insert_visible_posts" on public.post_reactions
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    join public.profiles owner_profile on owner_profile.id = p.user_id
    where p.id = post_reactions.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and coalesce(owner_profile.is_private, false) = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        ))
      )
  )
);

drop policy if exists "post_reactions_update_own" on public.post_reactions;
create policy "post_reactions_update_own" on public.post_reactions
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.posts p
    join public.profiles owner_profile on owner_profile.id = p.user_id
    where p.id = post_reactions.post_id
      and (
        p.user_id = auth.uid()
        or (p.visibility = 'public' and coalesce(owner_profile.is_private, false) = false)
        or (p.visibility = 'followers' and exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = p.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        ))
      )
  )
);

drop policy if exists "post_reactions_delete_own" on public.post_reactions;
create policy "post_reactions_delete_own" on public.post_reactions
for delete to authenticated
using (user_id = auth.uid());

revoke all on public.post_reactions from anon;
grant select, insert, update, delete on public.post_reactions to authenticated;
