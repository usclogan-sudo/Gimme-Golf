-- Mid-round roster (Option A settlement): record the hole at which each player
-- joined the round. NULL ⇒ joined at the start (the common case; every existing row
-- stays NULL and settles exactly as before). A mid-round joiner gets their current
-- hole written here by the host client right after invite_to_round creates the row,
-- and the Skins settlement (calculateSkinsNet) prorates antes so earlier skins keep
-- their original value and the newcomer only funds holes from start_hole forward.
alter table public.round_players
  add column if not exists start_hole integer;
