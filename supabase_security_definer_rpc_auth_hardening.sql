-- MEEi: SECURITY DEFINER RPCs are for signed-in app sessions only.
-- Public/anonymous execution is unnecessary because MEEi gates app features behind sign-in.
-- Trigger-only helpers remain non-executable by clients (see trigger_function_execute_hardening).

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.check_live_entry(uuid) from public, anon;
revoke all on function public.get_discover_profiles() from public, anon;
revoke all on function public.get_live_chat_messages(uuid, integer, uuid) from public, anon;
revoke all on function public.get_live_creators(text) from public, anon;
revoke all on function public.get_live_moderation_role(uuid) from public, anon;
revoke all on function public.get_live_viewer_profile(uuid, uuid) from public, anon;
revoke all on function public.get_my_blocked_users() from public, anon;
revoke all on function public.get_my_follow_requests() from public, anon;
revoke all on function public.get_profile_follow_counts(uuid) from public, anon;
revoke all on function public.get_profile_likes_count(uuid) from public, anon;
revoke all on function public.get_profile_post_engagement(uuid[]) from public, anon;
revoke all on function public.get_public_search_posts(text, text) from public, anon;
revoke all on function public.is_blocked_for_current_user(uuid) from public, anon;
revoke all on function public.is_live_moderator(uuid, uuid) from public, anon;
revoke all on function public.moderate_live_viewer(uuid, uuid, text) from public, anon;
revoke all on function public.record_public_post_view(uuid) from public, anon;
revoke all on function public.request_profile_follow(uuid) from public, anon;
revoke all on function public.respond_to_follow_request(uuid, boolean) from public, anon;
revoke all on function public.review_post_report(uuid, text, text) from public, anon;
revoke all on function public.search_discover_profiles(text) from public, anon;
revoke all on function public.send_live_chat_message(uuid, text) from public, anon;
revoke all on function public.set_live_moderator(uuid, uuid, boolean) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.check_live_entry(uuid) to authenticated;
grant execute on function public.get_discover_profiles() to authenticated;
grant execute on function public.get_live_chat_messages(uuid, integer, uuid) to authenticated;
grant execute on function public.get_live_creators(text) to authenticated;
grant execute on function public.get_live_moderation_role(uuid) to authenticated;
grant execute on function public.get_live_viewer_profile(uuid, uuid) to authenticated;
grant execute on function public.get_my_blocked_users() to authenticated;
grant execute on function public.get_my_follow_requests() to authenticated;
grant execute on function public.get_profile_follow_counts(uuid) to authenticated;
grant execute on function public.get_profile_likes_count(uuid) to authenticated;
grant execute on function public.get_profile_post_engagement(uuid[]) to authenticated;
grant execute on function public.get_public_search_posts(text, text) to authenticated;
grant execute on function public.is_blocked_for_current_user(uuid) to authenticated;
grant execute on function public.is_live_moderator(uuid, uuid) to authenticated;
grant execute on function public.moderate_live_viewer(uuid, uuid, text) to authenticated;
grant execute on function public.record_public_post_view(uuid) to authenticated;
grant execute on function public.request_profile_follow(uuid) to authenticated;
grant execute on function public.respond_to_follow_request(uuid, boolean) to authenticated;
grant execute on function public.review_post_report(uuid, text, text) to authenticated;
grant execute on function public.search_discover_profiles(text) to authenticated;
grant execute on function public.send_live_chat_message(uuid, text) to authenticated;
grant execute on function public.set_live_moderator(uuid, uuid, boolean) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
