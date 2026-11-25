-- MEEi admin-only post report review queue.
-- Run after supabase_post_saves_reports_setup.sql.
--
-- SECURITY MODEL:
-- Admin authorization comes ONLY from the verified JWT app_metadata claim:
-- auth.jwt()->'app_metadata'->>'meei_role' = 'admin'.
-- Never put this claim in user_metadata or allow clients to set it.
-- Assign/remove it only from a trusted server using the Supabase service-role
-- Admin API. No client-side admin promotion function is provided.

create or replace function public.is_meei_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'meei_role') = 'admin',
    false
  );
$$;

revoke all on function public.is_meei_admin() from public;
grant execute on function public.is_meei_admin() to authenticated;

alter table public.post_reports
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists moderation_note text;

-- Keep reporter visibility limited to their own reports; admins can see queue.
drop policy if exists "post_reports_admin_read" on public.post_reports;
create policy "post_reports_admin_read" on public.post_reports
for select to authenticated
using (public.is_meei_admin());

-- Do not grant direct client updates. All review state changes go through RPC.
revoke update, delete on public.post_reports from anon, authenticated;
grant select, insert on public.post_reports to authenticated;

create or replace function public.review_post_report(
  target_report_id uuid,
  next_status text,
  reviewer_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_claim text;
begin
  admin_claim := auth.jwt() -> 'app_metadata' ->> 'meei_role';
  if auth.uid() is null or coalesce(admin_claim, '') <> 'admin' then
    raise exception 'Only authorized MEEi administrators can review reports.';
  end if;

  if next_status not in ('reviewed','actioned','dismissed') then
    raise exception 'Invalid report review status.';
  end if;

  if reviewer_note is not null and char_length(reviewer_note) > 1000 then
    raise exception 'Review note must be 1000 characters or fewer.';
  end if;

  update public.post_reports
  set status = next_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      moderation_note = nullif(trim(reviewer_note), '')
  where id = target_report_id
    and status = 'pending';

  if not found then
    raise exception 'Report was not found or has already been reviewed.';
  end if;

  return true;
end;
$$;

revoke all on function public.review_post_report(uuid, text, text) from public;
grant execute on function public.review_post_report(uuid, text, text) to authenticated;

comment on function public.is_meei_admin() is
  'Checks the server-managed JWT app_metadata meei_role claim; client-editable user_metadata is never trusted.';
comment on function public.review_post_report(uuid, text, text) is
  'Admin-only report triage. Updates only pending reports and records reviewer and timestamp.';
