-- MEEi username policy and official-name reservation.
-- Run once in Supabase SQL Editor after the base schema is installed.
-- Usernames are stored lowercase, without @ or #, and are protected by a
-- database trigger so direct API writes cannot bypass these rules.

create table if not exists public.reserved_usernames (
  normalized_name text primary key,
  reservation_group text not null check (reservation_group in ('brand','moderation')),
  note text not null default ''
);

insert into public.reserved_usernames(normalized_name, reservation_group, note) values
  ('meei', 'brand', 'Official MEEi brand'),
  ('meeiapp', 'brand', 'Official MEEi app identity'),
  ('meeiofficial', 'brand', 'Official MEEi identity'),
  ('meeimoderation', 'moderation', 'MEEi Moderation Team'),
  ('meeimoderationteam', 'moderation', 'MEEi Moderation Team'),
  ('moderation', 'moderation', 'Moderation Team'),
  ('moderationteam', 'moderation', 'Moderation Team')
on conflict (normalized_name) do update
set reservation_group = excluded.reservation_group,
    note = excluded.note;

revoke all on public.reserved_usernames from anon, authenticated;
grant all on public.reserved_usernames to service_role;

create or replace function public.enforce_meei_username_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  request_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if new.username is null then
    raise exception 'Username is required.';
  end if;

  new.username := lower(btrim(new.username));

  if char_length(new.username) not between 3 and 25
     or new.username !~ '^[a-z0-9_]+$' then
    raise exception 'Username must be 3–25 characters and contain only letters, numbers, or underscores. Do not use @ or #.';
  end if;

  normalized := regexp_replace(new.username, '[^a-z0-9]', '', 'g');

  -- MEEI followed by digits is reserved for official country-code identities.
  -- This covers every international calling-code variant (for example 91, 1,
  -- 44, 971) and prevents separator/case tricks such as MEEI_91.
  if request_role <> 'service_role' then
    if normalized ~ '^meei[0-9]+$'
       or exists (
         select 1 from public.reserved_usernames r
         where r.normalized_name = normalized
       ) then
      raise exception 'This username is reserved for the official MEEi or Moderation Team account.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_meei_username_policy on public.profiles;
create trigger profiles_enforce_meei_username_policy
before insert or update of username on public.profiles
for each row execute function public.enforce_meei_username_policy();

-- Username lookups must be case-insensitively unique as well.
do $$
begin
  if exists (
    select lower(username)
    from public.profiles
    group by lower(username)
    having count(*) > 1
  ) then
    raise exception 'Cannot add case-insensitive username uniqueness: duplicate usernames differing only by letter case already exist. Resolve those duplicates, then rerun this SQL.';
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

comment on table public.reserved_usernames is
  'Private reservation registry for official MEEi brand and Moderation Team usernames. Do not grant client read access.';
comment on function public.enforce_meei_username_policy() is
  'Normalizes usernames to lowercase and blocks @/#, invalid characters, and reserved MEEi identities on every profile insert/update.';
