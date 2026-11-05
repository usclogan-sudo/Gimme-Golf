-- ONE-TIME DATA REPAIR — stray seat bindings (usability Finding 1).
--
-- Before 20261105120100_join_seat_binding, join_round / join_event let a user who
-- was already on a round's roster under their own uid claim a *different* seat
-- (typically a guest's), and the upsert on (round_id, user_id) silently moved
-- their one participant row onto it. The visible symptom was the organiser's
-- Settle Up reading "You owe" for a guest's loss while their own seat had won.
--
-- A registered user's player id IS their auth uid (self-player convention in
-- NewRound / EventSetup), so the correct binding for any such row is
-- player_id = user_id. This repair re-points every row where:
--   * player_id differs from user_id, and
--   * the user's own uid is on the round roster (rounds.players).
--
-- The read-only check on 2026-11-05 found exactly one such row, in round
-- 93bb7756-e11b-4c2f-bb5b-6bab747496a0. The UPDATE is written generally so it is
-- safe to re-run and will also catch any row created between that check and the
-- deploy. It does NOT touch hole_scores or settlements for the affected round;
-- those were written against the seat ids and remain as they were.
--
-- This must run BEFORE 20261105120100_join_seat_binding, which adds a unique
-- index on (round_id, player_id) where status = 'accepted'. The timestamps
-- enforce that order.

begin;

-- Report what will change, so the deploy log shows the affected rows.
do $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select rp.id, rp.round_id, rp.user_id, rp.player_id, rp.status
      from public.round_participants rp
      join public.rounds r on r.id = rp.round_id
     where rp.player_id <> rp.user_id::text
       and exists (
         select 1 from jsonb_array_elements(coalesce(r.players, '[]'::jsonb)) e
          where e->>'id' = rp.user_id::text)
  loop
    v_count := v_count + 1;
    raise notice 'cleanup_stray_seat_rows: round % user % was bound to seat % (%); re-pointing to own seat',
      v_row.round_id, v_row.user_id, v_row.player_id, v_row.status;
  end loop;
  raise notice 'cleanup_stray_seat_rows: % row(s) to repair', v_count;
end $$;

update public.round_participants rp
   set player_id = rp.user_id::text
  from public.rounds r
 where r.id = rp.round_id
   and rp.player_id <> rp.user_id::text
   and exists (
     select 1 from jsonb_array_elements(coalesce(r.players, '[]'::jsonb)) e
      where e->>'id' = rp.user_id::text);

commit;
