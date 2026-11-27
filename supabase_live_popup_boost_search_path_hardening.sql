-- MEEi: repair search_path on privileged Live popup and creator boost RPCs.
-- Keep pg_temp explicitly last so temporary objects cannot shadow trusted relations.
-- Safe to re-run; this changes function configuration only and does not execute app logic.

alter function private.enqueue_live_room_popup_event(uuid, uuid, text, text, text, integer)
  set search_path = pg_catalog, public, private, pg_temp;

alter function public.get_my_live_room_popup_event(uuid)
  set search_path = pg_catalog, public, private, pg_temp;

alter function public.dismiss_my_live_room_popup_event(uuid)
  set search_path = pg_catalog, private, pg_temp;

alter function public.activate_first_creator_global_live_boost(uuid, uuid)
  set search_path = pg_catalog, public, private, pg_temp;
