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
declare v_cleared boolean := false;
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

  get diagnostics v_cleared = row_count;
  return jsonb_build_object('event_link_cleared', v_cleared);
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
