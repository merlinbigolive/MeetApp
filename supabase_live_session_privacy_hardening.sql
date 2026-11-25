-- MEEi live-session privacy hardening.
-- Realtime subscribers may read only sessions they are allowed to discover.
-- This prevents private creators' playback URLs and session metadata from leaking
-- through direct table reads or Postgres Changes payloads.
-- Safe to re-run.

drop policy if exists "live_sessions_read_active" on public.live_sessions;
create policy "live_sessions_read_active" on public.live_sessions
for select to authenticated
using (
  status = 'live'
  and last_heartbeat_at > now() - interval '90 seconds'
  and exists (
    select 1
    from public.profiles p
    where p.id = live_sessions.user_id
      and (
        p.id = auth.uid()
        or p.is_private = false
        or exists (
          select 1
          from public.follows f
          where f.follower_id = auth.uid()
            and f.followed_id = live_sessions.user_id
            and coalesce(to_jsonb(f)->>'status', 'accepted') = 'accepted'
        )
      )
  )
);

grant select on public.live_sessions to authenticated;
