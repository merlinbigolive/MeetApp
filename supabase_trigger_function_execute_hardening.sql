-- MEEi: prevent direct RPC execution of trigger-only SECURITY DEFINER helpers.
-- These functions are invoked by PostgreSQL triggers, not by app clients.

revoke all on function public.notify_cuckoo_message_push() from public, anon, authenticated;
revoke all on function public.touch_conversation_after_message() from public, anon, authenticated;
revoke all on function public.enforce_meei_username_policy() from public, anon, authenticated;
