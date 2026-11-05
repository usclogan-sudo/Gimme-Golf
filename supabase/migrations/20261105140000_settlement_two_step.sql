-- Settlement two-step for guest payees, with actors recorded (usability Finding 10).
--
-- Before: a guest payee (roster-added, no device) could be cleared in one tap by the
-- organiser ("Confirm for Guest"), with nothing recording who tapped. Now every
-- settlement is two steps and both are attributed:
--
--   1. Mark sent     — the payer. If the payer is themselves a guest with no device,
--                      the organiser marks sent on their behalf. Recorded in
--                      reported_by.
--   2. Confirm received — the payee, on their own device. For a guest payee the
--                      organiser confirms on their behalf, but only once step 1 has
--                      happened, and the row records confirmed_for_guest = true.
--                      Recorded in confirmed_by.
--
-- Organiser = the round's creator (rounds.user_id) or its treasurer
-- (rounds.treasurer_player_id, which for a registered player is their uid).
-- "Device-bound" matches the client's participantMap: an accepted
-- round_participants row for that seat, or a seat id that is itself an auth uid.
--
-- Also fixes a pre-existing gap: player_report_settlement required an accepted
-- participant row for the payer, which the round creator never has (the roster
-- invite skips the owner), so a creator could not mark their own debt as sent.
--
-- The client falls back to the old direct UPDATE (row owner only) if
-- confirm_settlement_received is not deployed yet.

begin;

alter table public.settlements
  add column if not exists reported_by uuid,
  add column if not exists confirmed_by uuid,
  add column if not exists confirmed_for_guest boolean not null default false;

-- ─── helper: is this seat on a device in this round? ─────────────────────────

create or replace function public.is_seat_device_bound(p_round_id text, p_player_id text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.round_participants
     where round_id = p_round_id and player_id = p_player_id and status = 'accepted'
  ) or public.is_registered_player_id(p_player_id);
$$;

revoke all on function public.is_seat_device_bound(text, text) from public;
grant execute on function public.is_seat_device_bound(text, text) to authenticated;

-- ─── Mark sent ───────────────────────────────────────────────────────────────

create or replace function public.player_report_settlement(p_settlement_id text, p_method text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_s public.settlements%rowtype;
  v_round public.rounds%rowtype;
  v_is_payer boolean;
  v_is_organiser boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_s from public.settlements where id = p_settlement_id;
  if not found then
    raise exception 'Settlement not found';
  end if;
  select * into v_round from public.rounds where id = v_s.round_id;

  -- The payer: an accepted participant on that seat, or the registered player whose
  -- seat id is their own uid (the creator's seat, among others).
  v_is_payer := v_s.from_player_id = v_caller::text or exists (
    select 1 from public.round_participants
     where round_id = v_s.round_id and player_id = v_s.from_player_id
       and user_id = v_caller and status = 'accepted');
  v_is_organiser := v_round.user_id = v_caller
    or coalesce(v_round.treasurer_player_id, '') = v_caller::text;

  -- The organiser may mark sent for a payer who has no device in this round.
  if not v_is_payer
     and not (v_is_organiser and not public.is_seat_device_bound(v_s.round_id, v_s.from_player_id)) then
    raise exception 'Only the payer can mark this as sent.';
  end if;

  update public.settlements
     set reported_method = p_method,
         player_reported_at = now(),
         reported_by = v_caller
   where id = p_settlement_id;
end;
$$;

-- ─── Confirm received ────────────────────────────────────────────────────────

create or replace function public.confirm_settlement_received(p_settlement_id text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_s public.settlements%rowtype;
  v_round public.rounds%rowtype;
  v_payee_bound boolean;
  v_is_payee boolean;
  v_is_organiser boolean;
  v_for_guest boolean := false;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_s from public.settlements where id = p_settlement_id;
  if not found then
    raise exception 'Settlement not found';
  end if;
  select * into v_round from public.rounds where id = v_s.round_id;

  v_payee_bound := public.is_seat_device_bound(v_s.round_id, v_s.to_player_id);
  v_is_payee := v_s.to_player_id = v_caller::text or exists (
    select 1 from public.round_participants
     where round_id = v_s.round_id and player_id = v_s.to_player_id
       and user_id = v_caller and status = 'accepted');
  v_is_organiser := v_round.user_id = v_caller
    or coalesce(v_round.treasurer_player_id, '') = v_caller::text;

  if v_payee_bound then
    -- A payee on their own device is the only one who can clear what they are owed.
    if not v_is_payee then
      raise exception 'Only the player who is owed can confirm this was received.';
    end if;
  else
    -- A guest payee: the organiser confirms on their behalf, after the payer has
    -- marked it sent. Never in one tap.
    if not v_is_organiser then
      raise exception 'Only the organiser can confirm for a guest.';
    end if;
    if v_s.player_reported_at is null then
      raise exception 'Wait for the payer to mark this as sent first.';
    end if;
    v_for_guest := true;
  end if;

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         confirmed_by = v_caller,
         confirmed_for_guest = v_for_guest
   where id = p_settlement_id;

  return jsonb_build_object('id', p_settlement_id, 'confirmed_for_guest', v_for_guest);
end;
$$;

revoke all on function public.confirm_settlement_received(text) from public;
grant execute on function public.confirm_settlement_received(text) to authenticated;

commit;
