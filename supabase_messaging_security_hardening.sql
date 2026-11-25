-- MEEi messaging security hardening.
-- Safe to re-run. Run AFTER supabase_messaging_realtime_setup.sql.
-- Clients must not directly edit conversation membership/timestamps or message
-- sender, conversation, body, or read receipt fields. Read receipts are handled
-- by the SECURITY DEFINER mark_conversation_read(uuid) RPC.

-- The app creates conversations and reads them, but does not need client-side
-- UPDATE access. Server-side triggers maintain updated_at.
drop policy if exists "conversation participants can update" on public.conversations;
revoke update on public.conversations from public, anon, authenticated;

-- Do not allow senders (or other participants) to rewrite messages after insert.
-- The mark_conversation_read RPC updates recipient read_at values server-side.
drop policy if exists "senders can update own messages" on public.messages;
revoke update on public.messages from public, anon, authenticated;

-- Keep the intended client capabilities explicit.
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- Reassert that only authenticated users may invoke the read-receipt RPC.
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
