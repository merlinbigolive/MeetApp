-- Trigger-only Live PK maintenance functions must not be callable as RPCs.
-- PostgreSQL checks EXECUTE when a trigger is created; trigger firing does not
-- require callers to have direct EXECUTE permission on the trigger function.
revoke all on function public.end_live_pk_when_session_ends() from public, anon, authenticated;
revoke all on function public.sync_live_pk_session_locks() from public, anon, authenticated;
grant execute on function public.end_live_pk_when_session_ends() to service_role;
grant execute on function public.sync_live_pk_session_locks() to service_role;
