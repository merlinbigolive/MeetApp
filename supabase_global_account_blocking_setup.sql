-- MEEi global account blocking: secure database foundation.
-- Run after schema.sql, private-follow setup, messaging setup, and Live setup.
-- Safe to re-run. App UI integration is a separate follow-up.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id, blocker_id);

alter table public.user_blocks enable row level security;

-- A SECURITY DEFINER helper avoids exposing the block graph and avoids RLS recursion.
create or replace function public.is_blocked_for_current_user(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and other_user_id is not null and other_user_id <> auth.uid()
    and exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = other_user_id)
         or (b.blocker_id = other_user_id and b.blocked_id = auth.uid())
    );
$$;

revoke all on function public.is_blocked_for_current_user(uuid) from public;
grant execute on function public.is_blocked_for_current_user(uuid) to authenticated;

drop policy if exists "user_blocks_read_own" on public.user_blocks;
create policy "user_blocks_read_own" on public.user_blocks
for select to authenticated using (blocker_id = auth.uid());

-- All mutations go through authenticated RPCs; clients cannot spoof blocker_id.
revoke insert, update, delete on public.user_blocks from anon, authenticated;

create or replace function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = actor then
    raise exception 'Invalid account to block';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'Account not found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor, target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Blocking severs follow relationships in both directions, including pending requests.
  delete from public.follows
  where (follower_id = actor and followed_id = target_user_id)
     or (follower_id = target_user_id and followed_id = actor);

  return true;
end;
$$;

create or replace function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.user_blocks
  where blocker_id = auth.uid() and blocked_id = target_user_id;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.get_my_blocked_users()
returns table (user_id uuid, username text, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.blocked_id, p.username, p.display_name, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.block_user(uuid) from public;
revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.get_my_blocked_users() from public;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_my_blocked_users() to authenticated;

-- Restrictive policies enforce blocking even when older permissive policies allow access.
drop policy if exists "global_block_profiles_select" on public.profiles;
create policy "global_block_profiles_select" on public.profiles
as restrictive for select to authenticated
using (id = auth.uid() or not public.is_blocked_for_current_user(id));

drop policy if exists "global_block_follows_insert" on public.follows;
create policy "global_block_follows_insert" on public.follows
as restrictive for insert to authenticated
with check (not public.is_blocked_for_current_user(followed_id));

drop policy if exists "global_block_posts_select" on public.posts;
create policy "global_block_posts_select" on public.posts
as restrictive for select to authenticated
using (user_id = auth.uid() or not public.is_blocked_for_current_user(user_id));

drop policy if exists "global_block_posts_insert" on public.posts;
create policy "global_block_posts_insert" on public.posts
as restrictive for insert to authenticated
with check (not public.is_blocked_for_current_user(user_id));

drop policy if exists "global_block_comments_select" on public.post_comments;
create policy "global_block_comments_select" on public.post_comments
as restrictive for select to authenticated
using (
  user_id = auth.uid()
  or (
    not public.is_blocked_for_current_user(user_id)
    and not exists (
      select 1 from public.posts p
      where p.id = post_comments.post_id
        and public.is_blocked_for_current_user(p.user_id)
    )
  )
);

drop policy if exists "global_block_comments_insert" on public.post_comments;
create policy "global_block_comments_insert" on public.post_comments
as restrictive for insert to authenticated
with check (
  user_id = auth.uid()
  and not exists (
    select 1 from public.posts p
    where p.id = post_comments.post_id
      and public.is_blocked_for_current_user(p.user_id)
  )
);

drop policy if exists "global_block_profile_media_select" on public.profile_media;
create policy "global_block_profile_media_select" on public.profile_media
as restrictive for select to authenticated
using (user_id = auth.uid() or not public.is_blocked_for_current_user(user_id));

drop policy if exists "global_block_conversations_select" on public.conversations;
create policy "global_block_conversations_select" on public.conversations
as restrictive for select to authenticated
using (
  not public.is_blocked_for_current_user(
    case when user_one_id = auth.uid() then user_two_id else user_one_id end)
);

drop policy if exists "global_block_conversations_insert" on public.conversations;
create policy "global_block_conversations_insert" on public.conversations
as restrictive for insert to authenticated
with check (
  not public.is_blocked_for_current_user(
    case when user_one_id = auth.uid() then user_two_id else user_one_id end)
);

drop policy if exists "global_block_messages_select" on public.messages;
create policy "global_block_messages_select" on public.messages
as restrictive for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and not public.is_blocked_for_current_user(
        case when c.user_one_id = auth.uid() then c.user_two_id else c.user_one_id end)
  )
);

drop policy if exists "global_block_messages_insert" on public.messages;
create policy "global_block_messages_insert" on public.messages
as restrictive for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and not public.is_blocked_for_current_user(
        case when c.user_one_id = auth.uid() then c.user_two_id else c.user_one_id end)
  )
);

-- Discovery RPCs must also omit accounts blocked in either direction.
create or replace function public.get_discover_profiles()
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  profession_category text,
  website_url text,
  activity_status text,
  is_private boolean,
  account_type text,
  business_name text,
  business_category text,
  business_description text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    case when p.is_private = false then p.bio else null end,
    case when p.is_private = false then p.profession_category else null end,
    case when p.is_private = false then p.website_url else null end,
    case when p.is_private = false then p.activity_status else null end,
    p.is_private,
    case when p.is_private = false then p.account_type else 'personal' end,
    case when p.is_private = false then p.business_name else null end,
    case when p.is_private = false then p.business_category else null end,
    case when p.is_private = false then p.business_description else null end
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and not public.is_blocked_for_current_user(p.id)
  order by p.created_at desc
  limit 100;
$$;
revoke all on function public.get_discover_profiles() from public;
grant execute on function public.get_discover_profiles() to authenticated;

create or replace function public.get_live_creators(country_filter text default null)
returns table (
  session_id uuid, user_id uuid, username text, display_name text,
  profession_category text, country_code text, country_name text,
  title text, thumbnail_path text, avatar_path text, playback_url text,
  started_at timestamptz
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    ls.id, ls.user_id, pr.username, pr.display_name, pr.profession_category,
    ls.country_code, ls.country_name, ls.title, ls.thumbnail_path,
    avatar.storage_path, ls.playback_url, ls.started_at
  from public.live_sessions ls
  join public.profiles pr on pr.id = ls.user_id
  left join lateral (
    select pm.storage_path from public.profile_media pm
    where pm.user_id = ls.user_id and pm.kind = 'avatar'
    order by pm.position limit 1
  ) avatar on true
  where auth.uid() is not null
    and ls.status = 'live'
    and ls.last_heartbeat_at > now() - interval '90 seconds'
    and (country_filter is null or upper(ls.country_code) = upper(country_filter))
    and (
      pr.is_private = false
      or exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.followed_id = ls.user_id
          and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
      )
      or ls.user_id = auth.uid()
    )
    and not public.is_blocked_for_current_user(ls.user_id)
    and not exists (
      select 1 from public.live_moderation_actions a
      where a.creator_id = ls.user_id and a.viewer_id = auth.uid()
        and a.action = 'block' and a.revoked_at is null
        and (a.expires_at is null or a.expires_at > now())
    )
  order by random()
  limit 100;
$$;
revoke all on function public.get_live_creators(text) from public;
grant execute on function public.get_live_creators(text) to authenticated;

comment on table public.user_blocks is
  'Global account blocks. Either direction hides profiles/content and prevents follow, messaging, and Live discovery between the two accounts.';


create or replace function public.search_discover_profiles(search_text text)
returns table (
  id uuid, username text, display_name text, bio text,
  profession_category text, website_url text, activity_status text,
  is_private boolean, account_type text, business_name text,
  business_category text, business_description text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  search_term text := regexp_replace(lower(btrim(coalesce(search_text, ''))), '^[@#]+', '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if search_term = '' then return; end if;

  return query
  select
    p.id, p.username, p.display_name,
    case when p.is_private = false then p.bio else null end,
    case when p.is_private = false then p.profession_category else null end,
    case when p.is_private = false then p.website_url else null end,
    case when p.is_private = false then p.activity_status else null end,
    p.is_private,
    case when p.is_private = false then p.account_type else 'personal' end,
    case when p.is_private = false then p.business_name else null end,
    case when p.is_private = false then p.business_category else null end,
    case when p.is_private = false then p.business_description else null end
  from public.profiles p
  where p.id <> auth.uid()
    and not public.is_blocked_for_current_user(p.id)
    and (
      position(search_term in regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '')) > 0
      or position(search_term in lower(coalesce(p.display_name, ''))) > 0
      or (p.is_private = false and position(search_term in lower(coalesce(p.profession_category, ''))) > 0)
    )
  order by
    case
      when regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '') = search_term then 0
      when regexp_replace(lower(coalesce(p.username, '')), '^[@#]+', '') like search_term || '%' then 1
      else 2
    end,
    p.created_at desc
  limit 50;
end;
$$;
revoke all on function public.search_discover_profiles(text) from public;
grant execute on function public.search_discover_profiles(text) to authenticated;
