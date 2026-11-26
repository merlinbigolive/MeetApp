-- Apply global block visibility to public video search and view counting,
-- and hide viewers who have been kicked from the current Live session.
do $audit$
declare
  src text;
  old_fragment text;
  new_fragment text;
begin
  src := regexp_replace(pg_get_functiondef('public.get_public_search_posts(text,text)'::regprocedure), E'[\\n\\r\\t ]+', ' ', 'g');
  old_fragment := 'and pr.is_private = false and p.media_path is not null';
  new_fragment := 'and pr.is_private = false and p.media_path is not null and not public.is_blocked_for_current_user(p.user_id)';
  if position(old_fragment in src) = 0 then raise exception 'get_public_search_posts filter not found'; end if;
  execute replace(src, old_fragment, new_fragment);

  src := regexp_replace(pg_get_functiondef('public.record_public_post_view(uuid)'::regprocedure), E'[\\n\\r\\t ]+', ' ', 'g');
  old_fragment := 'and p.visibility = ''public'' and pr.is_private = false';
  new_fragment := 'and p.visibility = ''public'' and pr.is_private = false and not public.is_blocked_for_current_user(p.user_id)';
  if position(old_fragment in src) = 0 then raise exception 'record_public_post_view filter not found'; end if;
  execute replace(src, old_fragment, new_fragment);

  src := regexp_replace(pg_get_functiondef('public.get_live_creators(text)'::regprocedure), E'[\\n\\r\\t ]+', ' ', 'g');
  old_fragment := 'and a.action = ''block'' and a.revoked_at is null';
  new_fragment := 'and (a.action = ''block'' or (a.session_id = ls.id and a.action = ''kickout'')) and a.revoked_at is null';
  if position(old_fragment in src) = 0 then raise exception 'get_live_creators moderation filter not found'; end if;
  execute replace(src, old_fragment, new_fragment);
end;
$audit$;
