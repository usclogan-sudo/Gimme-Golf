-- clear_hole_score: remove one player's score on one hole (usability Finding 4).
--
-- The score sheet gains a "Clear score" control so a mistaken tap can be removed
-- rather than edited into a different wrong number. hole_scores rows carry the
-- user_id of whoever inserted them and RLS only lets that user delete ("own
-- delete scores"), which is the wrong rule for a shared scorecard: the organiser
-- or the acting scorekeeper fixes mistakes for the group. This SECURITY DEFINER
-- function performs the delete after its own authority check:
--
--   * the round's creator (rounds.user_id), or
--   * the round's game master (rounds.game_master_id), or
--   * the user who inserted the row (hole_scores.user_id), or
--   * the user who last submitted it (hole_scores.submitted_by).
--
-- Returns true when a row was removed, false when there was nothing to remove.
-- Raises a plain sentence when the caller is not allowed.
--
-- The client falls back to a direct DELETE (own rows only) if this function is
-- not deployed yet, so the control degrades rather than breaks.

begin;

create or replace function public.clear_hole_score(
  p_round_id text,
  p_player_id text,
  p_hole_number integer
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_round record;
  v_row public.hole_scores%rowtype;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found';
  end if;

  select * into v_row from public.hole_scores
   where round_id = p_round_id and player_id = p_player_id and hole_number = p_hole_number;
  if not found then
    return false;
  end if;

  if v_round.user_id <> v_caller
     and coalesce(v_round.game_master_id, '') <> v_caller::text
     and v_row.user_id <> v_caller
     and coalesce(v_row.submitted_by, '') <> v_caller::text then
    raise exception 'Only the organiser or the scorekeeper can clear a score.';
  end if;

  delete from public.hole_scores where id = v_row.id;
  return true;
end;
$$;

revoke all on function public.clear_hole_score(text, text, integer) from public;
grant execute on function public.clear_hole_score(text, text, integer) to authenticated;

commit;
