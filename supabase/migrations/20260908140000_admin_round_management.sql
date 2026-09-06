-- Admin round management — repairing a round in flight without SQL.
--
-- On 6 September a live round needed: participants created so players could score at
-- all, event membership backfilled, three roles changed, groups checked, and a
-- dangling event reference cleared. Every one of those was a hand-written statement
-- against production while thirteen people stood on tees, and each carried the risk
-- of a typo landing on the wrong round.
--
-- None of it is exotic. It is the set of things that go wrong when a round is set up
-- by one person and played by thirteen, and it belongs behind an admin screen.
--
-- All functions are SECURITY DEFINER and gated on is_admin. That gate is why they
-- exist: RLS scopes round_participants and event_participants to the round's OWNER,
-- so an admin who is not the organiser cannot repair someone else's round from the
-- client at all. The is_admin check is aliased (up.user_id) — see 20260908130000 for
-- what an unaliased one costs.

-- ─── Read: everything the panel needs, in one call ───────────────────────────
create or replace function public.admin_round_overview(p_round_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round record;
  v_event record;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found';
  end if;

  select * into v_event from public.events where id = v_round.event_id;

  select jsonb_build_object(
    'round_id', v_round.id,
    'status', v_round.status,
    'course_name', v_round.course_snapshot->>'courseName',
    'current_hole', v_round.current_hole,
    'owner_id', v_round.user_id,
    'game_master_id', v_round.game_master_id,
    'event_id', v_round.event_id,
    -- Distinguishes "no event" from "event id pointing at nothing". The second is
    -- the state that made the app behave as an event round with no event.
    'event_missing', (v_round.event_id is not null and v_event.id is null),
    'event_name', v_event.name,
    'game_type', v_round.game->>'type',
    -- Surfaced in whole tokens; stored in cents (1 token = 100).
    'buy_in_tokens', (coalesce((v_round.game->>'buyInCents')::int, 0) / 100),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'player_id',  p->>'id',
        'name',       p->>'name',
        'handicap',   (p->>'handicapIndex')::numeric,
        'group',      nullif(v_round.groups->>(p->>'id'), '')::int,
        -- A roster name with no participant row is a player who cannot score, and
        -- has no way of knowing why. This is the column that would have answered
        -- the whole afternoon in one glance.
        'claimed_by', (select rp.user_id from public.round_participants rp
                       where rp.round_id = v_round.id and rp.player_id = p->>'id'
                       limit 1),
        'claim_status', (select rp.status from public.round_participants rp
                         where rp.round_id = v_round.id and rp.player_id = p->>'id'
                         limit 1),
        'event_role', (select ep.role from public.event_participants ep
                       where ep.event_id = v_round.event_id and ep.player_id = p->>'id'
                       limit 1),
        'email', (select u.email from auth.users u
                  where u.id = (select rp.user_id from public.round_participants rp
                                where rp.round_id = v_round.id and rp.player_id = p->>'id'
                                limit 1))
      ) order by p->>'name')
      from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) p)
  ) into v_result;

  return v_result;
end;
$$;

-- ─── Grant scoring access ────────────────────────────────────────────────────
--
-- Links an account to a roster name and marks it accepted, which is exactly what a
-- player tapping their own name in the join flow does. The admin equivalent exists
-- because on the day eleven people could not do it themselves and nobody could do it
-- for them.
create or replace function public.admin_round_grant_access(
  p_round_id text, p_player_id text, p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  -- One slot per person, one person per slot: releasing both sides first makes
  -- reassigning a mis-claimed name a single action rather than a puzzle.
  delete from public.round_participants
  where round_id = p_round_id and (player_id = p_player_id or user_id = p_user_id);

  insert into public.round_participants (id, round_id, user_id, player_id, status)
  values (gen_random_uuid()::text, p_round_id, p_user_id, p_player_id, 'accepted');

  select event_id into v_event_id from public.rounds where id = p_round_id;
  if v_event_id is not null
     and exists (select 1 from public.events e where e.id = v_event_id) then
    insert into public.event_participants
      (id, event_id, user_id, player_id, role, group_number, status)
    select gen_random_uuid()::text, v_event_id, p_user_id, p_player_id, 'player',
           nullif(r.groups->>p_player_id, '')::int, 'accepted'
    from public.rounds r where r.id = p_round_id
    on conflict (event_id, user_id)
      do update set player_id = excluded.player_id, status = 'accepted';
  end if;
end;
$$;

-- ─── Role and group ──────────────────────────────────────────────────────────
--
-- Roles were previously fixed at setup and stamped at join time, so they could not
-- be changed once the day rearranged itself. Group lives on the round rather than
-- the event because scorekeeper permission compares group numbers, and a null there
-- silently locks a scorekeeper out of everyone including themselves.
create or replace function public.admin_round_set_role(
  p_round_id text, p_player_id text, p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('player', 'scorekeeper', 'manager') then
    raise exception 'Role must be player, scorekeeper or manager';
  end if;

  select event_id into v_event_id from public.rounds where id = p_round_id;
  if v_event_id is null then
    raise exception 'Roles apply to event rounds only';
  end if;

  update public.event_participants
  set role = p_role
  where event_id = v_event_id and player_id = p_player_id;

  if not found then
    raise exception 'That player has not joined the event yet — grant access first';
  end if;
end;
$$;

create or replace function public.admin_round_set_group(
  p_round_id text, p_player_id text, p_group integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  update public.rounds
  set groups = case
        when p_group is null then (coalesce(groups, '{}'::jsonb) - p_player_id)
        else coalesce(groups, '{}'::jsonb) || jsonb_build_object(p_player_id, p_group)
      end
  where id = p_round_id;

  -- Keep the event copy in step, or a scorekeeper's group check compares against a
  -- stale number and quietly stops matching.
  select event_id into v_event_id from public.rounds where id = p_round_id;
  if v_event_id is not null then
    update public.event_participants
    set group_number = p_group
    where event_id = v_event_id and player_id = p_player_id;
  end if;
end;
$$;

-- ─── Handicap ────────────────────────────────────────────────────────────────
--
-- Edits the round's frozen snapshot, not the player's profile. Settlement reads the
-- snapshot by design (§2.1) so a GHIN sync cannot move a played round — which also
-- means a wrong handicap can only be corrected here, and previously only in SQL.
create or replace function public.admin_round_set_handicap(
  p_round_id text, p_player_id text, p_handicap numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  update public.rounds r
  set players = (
    select jsonb_agg(
      case when p->>'id' = p_player_id
           then jsonb_set(p, '{handicapIndex}', to_jsonb(p_handicap))
           else p end)
    from jsonb_array_elements(r.players) p)
  where r.id = p_round_id;

  -- round_players carries the frozen course handicap; clearing it makes the next
  -- read fall back to recomputing from the corrected index rather than serving the
  -- old frozen value.
  update public.round_players
  set course_handicap = null
  where round_id = p_round_id and player_id = p_player_id;
end;
$$;

-- ─── Repair a broken event link ──────────────────────────────────────────────
--
-- Clears an event_id pointing at an event that no longer exists. The FK added in
-- 20260908120000 prevents this arising; this clears rounds that already carry one,
-- and gives an admin a button for the state that made eleven players read-only.
create or replace function public.admin_round_repair(p_round_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer := 0;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  update public.rounds r
  set event_id = null
  where r.id = p_round_id
    and r.event_id is not null
    and not exists (select 1 from public.events e where e.id = r.event_id);

  -- ROW_COUNT is an integer; the caller wants a boolean.
  get diagnostics v_rows = row_count;
  return jsonb_build_object('event_link_cleared', v_rows > 0);
end;
$$;

revoke all on function public.admin_round_overview(text) from public, anon;
revoke all on function public.admin_round_grant_access(text, text, uuid) from public, anon;
revoke all on function public.admin_round_set_role(text, text, text) from public, anon;
revoke all on function public.admin_round_set_group(text, text, integer) from public, anon;
revoke all on function public.admin_round_set_handicap(text, text, numeric) from public, anon;
revoke all on function public.admin_round_repair(text) from public, anon;

grant execute on function public.admin_round_overview(text) to authenticated;
grant execute on function public.admin_round_grant_access(text, text, uuid) to authenticated;
grant execute on function public.admin_round_set_role(text, text, text) to authenticated;
grant execute on function public.admin_round_set_group(text, text, integer) to authenticated;
grant execute on function public.admin_round_set_handicap(text, text, numeric) to authenticated;
grant execute on function public.admin_round_repair(text) to authenticated;

-- ─── Stake ───────────────────────────────────────────────────────────────────
--
-- buyInCents is the entry under a pot game and the per-unit value under a unit game
-- (wolf, banker, dots, hammer) or per-skin Skins. One field, meaning set by the game
-- — so this changes what a token is worth without touching anything else.
create or replace function public.admin_round_set_stake(
  p_round_id text, p_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;
  if p_tokens < 0 then
    raise exception 'Stake cannot be negative';
  end if;

  -- Stored in cents; the UI works in whole tokens (1 token = 100).
  update public.rounds
  set game = jsonb_set(game, '{buyInCents}', to_jsonb(p_tokens * 100))
  where id = p_round_id and game is not null;

  update public.buy_ins
  set amount_cents = p_tokens * 100
  where round_id = p_round_id and status = 'unpaid';
end;
$$;

-- ─── Game type ───────────────────────────────────────────────────────────────
--
-- Changing the type without changing the config would settle the round against a
-- config for a different game — Wolf with no wolfOrder scores nobody, Best Ball with
-- no teams has no sides. So this rebuilds a valid minimal config for the target game
-- from the current roster, in the same shape NewRound would have produced.
--
-- Scores are untouched: every Class A game is a pure function of the card, so
-- switching type re-settles the holes already played rather than discarding them.
-- That is the point — it is how you correct a round set up as the wrong game.
create or replace function public.admin_round_set_game_type(
  p_round_id text, p_game_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round record;
  v_ids text[];
  v_config jsonb;
  v_teams jsonb := '{}'::jsonb;
  v_quotas jsonb := '{}'::jsonb;
  v_id text;
  v_i int := 0;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;
  if p_game_type not in ('skins','best_ball','nassau','wolf','bingo_bango_bongo',
                         'hammer','vegas','stableford','dots','banker','quota') then
    raise exception 'Unknown game type: %', p_game_type;
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'Round not found'; end if;

  select array_agg(p->>'id' order by p->>'name')
  into v_ids
  from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) p;

  -- Alternating sides for the team games, and a quota per player from their frozen
  -- handicap — the same derivation setup uses.
  foreach v_id in array coalesce(v_ids, array[]::text[]) loop
    v_teams := v_teams || jsonb_build_object(v_id, case when v_i % 2 = 0 then 'A' else 'B' end);
    v_quotas := v_quotas || jsonb_build_object(v_id, greatest(0, least(36, round(36 - coalesce((
      select (p->>'handicapIndex')::numeric
      from jsonb_array_elements(v_round.players) p where p->>'id' = v_id), 0)))));
    v_i := v_i + 1;
  end loop;

  v_config := case p_game_type
    when 'skins'      then jsonb_build_object('mode','net','carryovers',true,'payModel','pot')
    when 'best_ball'  then jsonb_build_object('scoring','match','mode','net','teams',v_teams)
    when 'nassau'     then jsonb_build_object('mode','net')
    when 'wolf'       then jsonb_build_object('mode','net','wolfOrder',to_jsonb(v_ids))
    when 'banker'     then jsonb_build_object('mode','net','bankerOrder',to_jsonb(v_ids))
    when 'vegas'      then jsonb_build_object('mode','net','teams',v_teams)
    when 'stableford' then jsonb_build_object('mode','net')
    when 'quota'      then jsonb_build_object('mode','net','quotas',v_quotas)
    when 'hammer'     then jsonb_build_object('baseValueCents',
                            coalesce((v_round.game->>'buyInCents')::int, 100))
    when 'dots'       then jsonb_build_object('activeDots',
                            jsonb_build_array('sandy','greenie','birdie'),
                            'valueCentsPerDot', coalesce((v_round.game->>'buyInCents')::int, 100))
    else jsonb_build_object('mode','net')
  end;

  update public.rounds
  set game = jsonb_build_object(
        'id', coalesce(game->>'id', gen_random_uuid()::text),
        'type', p_game_type,
        'buyInCents', coalesce((game->>'buyInCents')::int, 0),
        'stakesMode', game->>'stakesMode',
        'config', v_config)
  where id = p_round_id;
end;
$$;

-- ─── Add and drop players ────────────────────────────────────────────────────
--
-- Add takes either an existing account or a name for a guest. A registered user's
-- player id IS their auth uuid, which is what lets them claim the slot and score;
-- a guest gets a generated id and is scored for by someone else.
create or replace function public.admin_round_add_player(
  p_round_id text,
  p_user_id uuid default null,
  p_name text default null,
  p_group integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round record;
  v_player_id text;
  v_name text;
  v_hcp numeric := 0;
  v_tee text := 'White';
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'Round not found'; end if;

  if p_user_id is not null then
    select p_user_id::text, coalesce(up.display_name, 'Player'),
           coalesce(up.handicap_index, 0), coalesce(up.tee, 'White')
    into v_player_id, v_name, v_hcp, v_tee
    from public.user_profiles up where up.user_id = p_user_id;
    if v_player_id is null then raise exception 'No profile for that user'; end if;
    if exists (select 1 from jsonb_array_elements(v_round.players) p
               where p->>'id' = v_player_id) then
      raise exception 'That player is already on this round';
    end if;
  else
    if coalesce(trim(p_name), '') = '' then
      raise exception 'Give a name or pick an account';
    end if;
    v_player_id := gen_random_uuid()::text;
    v_name := trim(p_name);
  end if;

  update public.rounds
  set players = coalesce(players, '[]'::jsonb) || jsonb_build_object(
        'id', v_player_id, 'name', v_name,
        'handicapIndex', v_hcp, 'tee', v_tee, 'ghinNumber', ''),
      groups = case when p_group is null then groups
                    else coalesce(groups, '{}'::jsonb) || jsonb_build_object(v_player_id, p_group) end
  where id = p_round_id;

  insert into public.round_players (id, user_id, round_id, player_id, tee_played, start_hole)
  values (gen_random_uuid()::text, v_round.user_id, p_round_id, v_player_id, v_tee,
          -- Joining mid-round means only paying for holes from here on (Option A).
          case when v_round.current_hole > 1 then v_round.current_hole else null end)
  on conflict do nothing;

  if p_user_id is not null then
    perform public.admin_round_grant_access(p_round_id, v_player_id, p_user_id);
  end if;

  return v_player_id;
end;
$$;

-- Drop takes the player's scores with them. There is no version of this that keeps
-- them: a score belongs to a player on the card, and leaving orphans would put a
-- name back on every leaderboard that reads from hole_scores.
create or replace function public.admin_round_remove_player(
  p_round_id text, p_player_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  select event_id into v_event_id from public.rounds where id = p_round_id;

  delete from public.hole_scores        where round_id = p_round_id and player_id = p_player_id;
  delete from public.buy_ins            where round_id = p_round_id and player_id = p_player_id;
  delete from public.junk_records       where round_id = p_round_id and player_id = p_player_id;
  delete from public.round_players      where round_id = p_round_id and player_id = p_player_id;
  delete from public.round_participants where round_id = p_round_id and player_id = p_player_id;
  delete from public.settlements
    where round_id = p_round_id and (from_player_id = p_player_id or to_player_id = p_player_id);
  if v_event_id is not null then
    delete from public.event_participants
    where event_id = v_event_id and player_id = p_player_id;
  end if;

  update public.rounds
  set players = (select coalesce(jsonb_agg(p), '[]'::jsonb)
                 from jsonb_array_elements(players) p where p->>'id' <> p_player_id),
      groups = coalesce(groups, '{}'::jsonb) - p_player_id
  where id = p_round_id;
end;
$$;

-- ─── End (or reopen) a round ─────────────────────────────────────────────────
--
-- A round abandoned on the course stays 'active' forever, sitting on every player's
-- home screen. Reopening is offered too: ending one by mistake previously had no
-- undo, and settlement recomputes from the card either way.
create or replace function public.admin_round_set_status(
  p_round_id text, p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('setup', 'active', 'complete') then
    raise exception 'Status must be setup, active or complete';
  end if;

  update public.rounds set status = p_status where id = p_round_id;
end;
$$;

revoke all on function public.admin_round_set_stake(text, integer) from public, anon;
revoke all on function public.admin_round_set_game_type(text, text) from public, anon;
revoke all on function public.admin_round_add_player(text, uuid, text, integer) from public, anon;
revoke all on function public.admin_round_remove_player(text, text) from public, anon;
revoke all on function public.admin_round_set_status(text, text) from public, anon;

grant execute on function public.admin_round_set_stake(text, integer) to authenticated;
grant execute on function public.admin_round_set_game_type(text, text) to authenticated;
grant execute on function public.admin_round_add_player(text, uuid, text, integer) to authenticated;
grant execute on function public.admin_round_remove_player(text, text) to authenticated;
grant execute on function public.admin_round_set_status(text, text) to authenticated;
