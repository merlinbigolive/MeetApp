-- CUCKOO / USay personal-to-professional-business account conversion.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.profiles
  add column if not exists account_type text not null default 'personal',
  add column if not exists business_name text,
  add column if not exists business_category text,
  add column if not exists business_description text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('personal', 'business'));
  end if;
end $$;

alter table public.profiles
  drop constraint if exists profiles_business_details_check;

alter table public.profiles
  add constraint profiles_business_details_check
  check (
    account_type = 'personal'
    or (
      nullif(trim(business_name), '') is not null
      and nullif(trim(business_category), '') is not null
    )
  );

create index if not exists profiles_account_type_created_idx
  on public.profiles (account_type, created_at desc);

-- Existing profiles_update_self RLS policy already restricts profile updates
-- to the authenticated owner, so users can change only their own account type.
