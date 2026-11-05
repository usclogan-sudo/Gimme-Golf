-- Seat binding rules for the join flow (usability Finding 1).
--
-- Background. A registered user's player id IS their auth uid (self-player
-- convention in NewRound / EventSetup, #87). The join RPCs were never taught that
-- rule: they blocked only seats with an *accepted* row by someone else, and then
-- upserted on (round_id, user_id) — which silently moved the caller's one row onto
-- whatever seat they tapped. join_event was worse: an organiser always has a
-- manager row, and that branch rewrote player_id before any claimed check.
--
-- Four rules, enforced here and mirrored in JoinRound.tsx:
--   1. A seat whose id is a registered auth uid belongs to that user only.
--   2. A caller whose own uid is on the roster may only take that seat.
--   3. A caller who already holds an accepted seat cannot switch to another.
--   4. A pending OR accepted row by another user blocks the seat.
--
-- Error text is deliberately plain sentences; the client shows it verbatim.
-- The strings "already claimed", "belongs to a registered" and "already have a
-- seat" are matched client-side to keep expected refusals out of Sentry — keep
-- those phrases if you reword.
--
-- Also: get_round_by_invite / get_event_by_invite now return `status` per
-- participant row and `registered_player_ids` (roster ids that are auth uids), so
-- the join screen can render pending and account-bound seats correctly. Both are
-- additive; existing readers (LiveLeaderboard) ignore the new keys.
--
-- Finally, the constraint that was actually missing: one seat → at most one
-- accepted user. (One user → one seat per round already exists as
-- round_participants_round_id_user_id_key.) If the index creation fails, there
-- are two accepted rows on one seat; find them with
--   select round_id, player_id, count(*) from round_participants
--    where status = 'accepted' group by 1,2 having count(*) > 1;
-- and resolve by hand rather than weakening the index.

begin;

-- ─── helper: is this seat id a registered account? ───────────────────────────
-- CASE (not AND) so the uuid cast is never evaluated for a non-uuid id — SQL
-- does not promise left-to-right short-circuiting.

create or replace function public.is_registered_player_id(p_player_id text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case
    when p_player_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then exists (select 1 from auth.users u where u.id = p_player_id::uuid)
    else false
  end;
$$;

revoke all on function public.is_registered_player_id(text) from public;
grant execute on function public.is_registered_player_id(text) to authenticated;

-- ─── join_round ──────────────────────────────────────────────────────────────

create or replace function public.join_round(p_invite_code text, p_player_id text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_round record;
  v_caller uuid := auth.uid();
  v_existing public.round_participants%rowtype;
  v_participant_id text;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_round from public.rounds
   where invite_code = p_invite_code and status = 'active';
  if not found then
    raise exception 'Round not found or no longer active';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) e
     where e->>'id' = p_player_id
  ) then
    raise exception 'Player not found in this round';
  end if;

  -- Rule 1: a registered player's seat id is their auth uid. Reserved for them.
  if public.is_registered_player_id(p_player_id) and p_player_id <> v_caller::text then
    raise exception 'This seat belongs to a registered player.';
  end if;

  -- Rule 2: if the caller's own uid is on the roster, that is their only seat.
  if p_player_id <> v_caller::text and exists (
    select 1 from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) e
     where e->>'id' = v_caller::text
  ) then
    raise exception 'You already have a seat in this round.';
  end if;

  -- Rule 3: no silent seat switching once a seat is accepted.
  select * into v_existing from public.round_participants
   where round_id = v_round.id and user_id = v_caller;
  if found and v_existing.status = 'accepted' and v_existing.player_id <> p_player_id then
    raise exception 'You already have a seat in this round.';
  end if;

  -- Rule 4: pending or accepted rows by anyone else block the seat.
  if exists (
    select 1 from public.round_participants
     where round_id = v_round.id
       and player_id = p_player_id
       and user_id <> v_caller
       and status in ('pending', 'accepted')
  ) then
    raise exception 'This seat is already claimed by another player.';
  end if;

  v_participant_id := coalesce(v_existing.id, gen_random_uuid()::text);
  insert into public.round_participants (id, round_id, user_id, player_id, status)
  values (v_participant_id, v_round.id, v_caller, p_player_id, 'accepted')
  on conflict (round_id, user_id) do update
    set player_id = excluded.player_id, status = 'accepted';
  -- The conflict path is now only reachable for the caller's own pending invite
  -- (rule 3 raises for an accepted row on a different seat).

  return jsonb_build_object(
    'round_id', v_round.id,
    'participant_id', v_participant_id,
    'player_id', p_player_id
  );
end;
$$;

-- ─── join_event ──────────────────────────────────────────────────────────────

create or replace function public.join_event(p_invite_code text, p_player_id text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_event record;
  v_round record;
  v_existing public.event_participants%rowtype;
  v_has_existing boolean := false;
  v_group_number int;
  v_participant_id text;
  v_caller uuid := auth.uid();
  v_role text := 'player';
  v_sk_player_id text;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_event from public.events
   where invite_code = upper(trim(p_invite_code)) and status != 'complete';
  if not found then
    raise exception 'Event not found or no longer active';
  end if;

  select * into v_round from public.rounds where id = v_event.round_id;
  if not found then
    raise exception 'Event not found or no longer active';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) e
     where e->>'id' = p_player_id
  ) then
    raise exception 'Player not found in this round';
  end if;

  -- Rule 1: a registered player's seat id is their auth uid. Reserved for them.
  if public.is_registered_player_id(p_player_id) and p_player_id <> v_caller::text then
    raise exception 'This seat belongs to a registered player.';
  end if;

  -- Rule 2: if the caller's own uid is on the roster, that is their only seat.
  -- (An organiser who is not playing has no roster entry, so this does not
  -- stop them managing; it only stops them taking a player's seat.)
  if p_player_id <> v_caller::text and exists (
    select 1 from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) e
     where e->>'id' = v_caller::text
  ) then
    raise exception 'You already have a seat in this round.';
  end if;

  -- NOTE: use FOUND, not "v_existing IS NOT NULL" — group_number is nullable.
  -- Capture FOUND now: the SELECT INTO for the group number below resets it.
  select * into v_existing from public.event_participants
   where event_id = v_event.id and user_id = v_caller;
  v_has_existing := found;

  -- Rule 3: no silent seat switching once a seat is accepted. This is the check
  -- the old function skipped for anyone who already had a row (every organiser).
  if v_has_existing and v_existing.status = 'accepted' and v_existing.player_id <> p_player_id then
    raise exception 'You already have a seat in this round.';
  end if;

  -- Rule 4: pending or accepted rows by anyone else block the seat. Checked on
  -- both membership tables, since the round row is what scoring keys off.
  if exists (
    select 1 from public.event_participants
     where event_id = v_event.id
       and player_id = p_player_id
       and user_id <> v_caller
       and status in ('pending', 'accepted')
  ) or exists (
    select 1 from public.round_participants
     where round_id = v_event.round_id
       and player_id = p_player_id
       and user_id <> v_caller
       and status in ('pending', 'accepted')
  ) then
    raise exception 'This seat is already claimed by another player.';
  end if;

  select r.groups->p_player_id into v_group_number
    from public.rounds r where r.id = v_event.round_id;

  if v_event.group_scorekeepers is not null and v_group_number is not null then
    v_sk_player_id := v_event.group_scorekeepers->>v_group_number::text;
    if v_sk_player_id = p_player_id then
      v_role := 'scorekeeper';
    end if;
  end if;

  if v_has_existing then
    -- Caller's own row (pending invite, or re-tapping their own seat). Keep a
    -- manager's role; a plain player picks up scorekeeper if the seat carries it.
    if v_existing.role = 'manager' then
      v_role := 'manager';
    end if;
    v_participant_id := v_existing.id;
    update public.event_participants
       set player_id = p_player_id,
           status = 'accepted',
           role = v_role,
           group_number = coalesce(v_group_number, group_number)
     where id = v_existing.id;
  else
    v_participant_id := gen_random_uuid()::text;
    insert into public.event_participants
      (id, event_id, user_id, player_id, role, group_number, status)
    values
      (v_participant_id, v_event.id, v_caller, p_player_id, v_role, v_group_number, 'accepted');
  end if;

  insert into public.round_participants (id, user_id, round_id, player_id, status)
  values (gen_random_uuid()::text, v_caller, v_event.round_id, p_player_id, 'accepted')
  on conflict (round_id, user_id) do update
    set player_id = excluded.player_id, status = 'accepted';

  return jsonb_build_object(
    'event_id', v_event.id,
    'round_id', v_event.round_id,
    'participant_id', v_participant_id,
    'role', v_role
  );
end;
$$;

-- ─── get_round_by_invite: + status per row, + registered_player_ids ──────────

create or replace function public.get_round_by_invite(p_invite_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_round record;
  v_participants jsonb;
  v_registered jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.check_invite_rate_limit();

  select * into v_round from public.rounds
   where invite_code = p_invite_code and status = 'active';
  if not found then
    raise exception 'Round not found or no longer active';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rp.id,
    'round_id', rp.round_id,
    'user_id', rp.user_id,
    'player_id', rp.player_id,
    'status', rp.status,
    'joined_at', rp.joined_at
  )), '[]'::jsonb) into v_participants
  from public.round_participants rp where rp.round_id = v_round.id;

  select coalesce(jsonb_agg(e->>'id'), '[]'::jsonb) into v_registered
    from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) e
   where public.is_registered_player_id(e->>'id');

  return jsonb_build_object(
    'id', v_round.id,
    'course_id', v_round.course_id,
    'date', v_round.date,
    'status', v_round.status,
    'current_hole', v_round.current_hole,
    'course_snapshot', v_round.course_snapshot,
    'game', v_round.game,
    'players', v_round.players,
    'game_master_id', v_round.game_master_id,
    'user_id', v_round.user_id,
    'participants', v_participants,
    'registered_player_ids', v_registered
  );
end;
$$;

-- ─── get_event_by_invite: + status per row, + registered_player_ids ──────────

create or replace function public.get_event_by_invite(p_invite_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_event record;
  v_round jsonb;
  v_participants jsonb;
  v_registered jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.check_invite_rate_limit();

  select * into v_event from public.events
   where invite_code = upper(trim(p_invite_code)) and status != 'complete';
  if not found then
    raise exception 'Event not found or no longer active';
  end if;

  select jsonb_build_object(
    'id', r.id,
    'course_snapshot', r.course_snapshot,
    'game', r.game,
    'players', r.players,
    'current_hole', r.current_hole,
    'groups', r.groups
  ) into v_round
  from public.rounds r where r.id = v_event.round_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ep.id,
    'user_id', ep.user_id,
    'player_id', ep.player_id,
    'role', ep.role,
    'group_number', ep.group_number,
    'status', ep.status
  )), '[]'::jsonb) into v_participants
  from public.event_participants ep where ep.event_id = v_event.id;

  select coalesce(jsonb_agg(e->>'id'), '[]'::jsonb) into v_registered
    from public.rounds r,
         jsonb_array_elements(coalesce(r.players, '[]'::jsonb)) e
   where r.id = v_event.round_id
     and public.is_registered_player_id(e->>'id');

  return jsonb_build_object(
    'id', v_event.id,
    'name', v_event.name,
    'status', v_event.status,
    'round', v_round,
    'participants', v_participants,
    'group_scorekeepers', v_event.group_scorekeepers,
    'registered_player_ids', v_registered
  );
end;
$$;

-- ─── One seat → at most one accepted user ────────────────────────────────────
-- event_participants has the same (table_id, user_id, player_id, status) shape,
-- so it gets the equivalent index. Both fail loudly on bad data; see header.

create unique index if not exists round_participants_one_user_per_seat
  on public.round_participants (round_id, player_id)
  where status = 'accepted';

create unique index if not exists event_participants_one_user_per_seat
  on public.event_participants (event_id, player_id)
  where status = 'accepted';

commit;
