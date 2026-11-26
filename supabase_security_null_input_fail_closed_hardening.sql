-- Fail-closed NULL validation for privileged Live, moderation, and push RPCs.
-- Applied directly to Supabase project sbzqxacibcfyyxoysseu and verified.
do $audit$
declare
  fn regprocedure;
  src text;
  updated text;
  old_fragment text;
  new_fragment text;
begin
  fn := 'public.moderate_live_viewer(uuid,uuid,text)'::regprocedure;
  src := pg_get_functiondef(fn);
  old_fragment := 'if moderation_action not in (''mute'',''kickout'',''block'',''unmute'',''unblock'',''allow'') then';
  new_fragment := 'if moderation_action is null or moderation_action not in (''mute'',''kickout'',''block'',''unmute'',''unblock'',''allow'') then';
  if position(old_fragment in src) = 0 then raise exception 'moderate_live_viewer guard pattern not found'; end if;
  execute replace(src, old_fragment, new_fragment);

  fn := 'public.set_live_moderator(uuid,uuid,boolean)'::regprocedure;
  src := pg_get_functiondef(fn);
  old_fragment := 'if target_user_id is null or target_user_id = host_id then';
  new_fragment := 'if make_moderator is null or target_user_id is null or target_user_id = host_id then';
  if position(old_fragment in src) = 0 then raise exception 'set_live_moderator guard pattern not found'; end if;
  execute replace(src, old_fragment, new_fragment);

  fn := 'public.review_post_report(uuid,text,text)'::regprocedure;
  src := pg_get_functiondef(fn);
  old_fragment := 'if next_status not in (''reviewed'',''actioned'',''dismissed'') then';
  new_fragment := 'if next_status is null or next_status not in (''reviewed'',''actioned'',''dismissed'') then';
  if position(old_fragment in src) = 0 then raise exception 'review_post_report guard pattern not found'; end if;
  execute replace(src, old_fragment, new_fragment);

  fn := 'public.register_my_push_token(text,text,boolean)'::regprocedure;
  src := pg_get_functiondef(fn);
  old_fragment := 'if p_device_platform not in (''android'', ''ios'') then';
  new_fragment := 'if p_device_platform is null or p_device_platform not in (''android'', ''ios'') then';
  if position(old_fragment in src) = 0 then raise exception 'register_my_push_token guard pattern not found'; end if;
  execute replace(src, old_fragment, new_fragment);
end;
$audit$;
