-- MEEi home-country preference for Live discovery.
-- Safe to run more than once. Live page country filters never update these fields.

alter table public.profiles
  add column if not exists country_code text,
  add column if not exists country_name text;

alter table public.profiles
  drop constraint if exists profiles_country_code_format_check,
  add constraint profiles_country_code_format_check
    check (country_code is null or country_code ~ '^[A-Z]{2,3}$'),
  drop constraint if exists profiles_country_name_length_check,
  add constraint profiles_country_name_length_check
    check (country_name is null or char_length(trim(country_name)) between 2 and 80);

comment on column public.profiles.country_code is
  'User home country established during account setup; used as the default Live discovery filter.';
comment on column public.profiles.country_name is
  'Display name for the user home country; changing Live discovery filters does not change this value.';
