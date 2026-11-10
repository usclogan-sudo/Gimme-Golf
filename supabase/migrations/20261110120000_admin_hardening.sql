-- Admin hardening: server side audit on every mutating admin RPC, no self
-- binding through admin_round_grant_access, and kill switches.
--
-- Audit. Three RPCs wrote admin_audit_log themselves; the client logged five
-- more actions fire and forget; everything else in the round panel and the
-- user editor left no trace. Every mutating admin_* function now calls
-- log_admin_action inside its own transaction, so a row exists exactly when
-- the action committed. The client side calls for toggle_admin,
-- delete_user_profile and delete_round go in the same change, so nothing is
-- logged twice. Action names stay where the client already used them.
--
-- Impersonation. admin_round_grant_access could bind any seat to the admin's
-- own account, which let an admin score as a player with no record. It now
-- refuses the caller's own uid; an admin who plays joins the way players do.
--
-- Kill switches. feature_switches holds one row per capability, readable by
-- everyone and writable only through admin_set_switch. Enforcement is at the
-- database where the capability is a write: rounds insert (new_rounds), the
-- participant tables (joining), hole_scores (scoring). settle_up and notice
-- are client side only: the app holds no funds, so settle_up hides pay links,
-- and notice is a banner. Admins pass every switch so the panel keeps working
-- while a capability is off. A missing row counts as on, so the switches can
-- never fail closed.

begin;

-- ─── 1. Switch table, helpers, enforcement ───────────────────────────────────

create table if not exists public.feature_switches (
  key text primary key,
  enabled boolean not null default true,
  message text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.feature_switches enable row level security;

drop policy if exists feature_switches_read_all on public.feature_switches;
create policy feature_switches_read_all on public.feature_switches
  for select to anon, authenticated using (true);

grant select on public.feature_switches to anon, authenticated;

insert into public.feature_switches (key, enabled, message) values
  ('new_rounds', true, null),
  ('joining', true, null),
  ('scoring', true, null),
  ('settle_up', true, null),
  ('notice', false, null)
on conflict (key) do nothing;

-- Realtime so an open scorecard learns about a flip without a reload.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feature_switches'
     ) then
    alter publication supabase_realtime add table public.feature_switches;
  end if;
end
$$;

create or replace function public.is_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.switch_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select enabled from public.feature_switches where key = p_key),
    true
  );
$$;

-- Row trigger. The hint carries the key so the client can name the switch in
-- its error line instead of "try again".
create or replace function public.enforce_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := tg_argv[0];
  v_message text;
begin
  if public.switch_enabled(v_key) or public.is_admin_caller() then
    return coalesce(new, old);
  end if;
  select message into v_message from public.feature_switches where key = v_key;
  raise exception '%', coalesce(nullif(trim(v_message), ''), 'This is paused right now. Try again shortly.')
    using errcode = 'P0001', hint = 'feature_switch:' || v_key;
end;
$$;

drop trigger if exists joining_switch on public.round_participants;
create trigger joining_switch
  before insert on public.round_participants
  for each row execute function public.enforce_switch('joining');

drop trigger if exists joining_switch on public.event_participants;
create trigger joining_switch
  before insert on public.event_participants
  for each row execute function public.enforce_switch('joining');

drop trigger if exists scoring_switch on public.hole_scores;
create trigger scoring_switch
  before insert or update on public.hole_scores
  for each row execute function public.enforce_switch('scoring');

-- rounds insert: same owner rule as before, plus the switch. The policy had no
-- role list, so it stays that way.
drop policy if exists "own insert" on public.rounds;
create policy "own insert" on public.rounds
  for insert
  with check (
    user_id = auth.uid()
    and (public.switch_enabled('new_rounds') or public.is_admin_caller())
  );

create or replace function public.admin_set_switch(p_key text, p_enabled boolean, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if not public.is_admin_caller() then
    raise exception 'Not authorized';
  end if;

  update public.feature_switches
  set enabled = p_enabled,
      message = v_message,
      updated_by = auth.uid(),
      updated_at = now()
  where key = p_key;

  if not found then
    raise exception 'Unknown switch: %', p_key;
  end if;

  perform public.log_admin_action(
    'set_switch', 'switch', p_key, p_key,
    jsonb_build_object('enabled', p_enabled, 'message', v_message)
  );
end;
$$;

-- ─── 2. Audit inside every mutating admin RPC ────────────────────────────────

create or replace function public.admin_create_user(user_email text, user_password text, user_display_name text default null::text, user_handicap double precision default null::double precision)
returns uuid
language plpgsql
security definer
set search_path to 'extensions', 'public', 'auth'
as $function$
  DECLARE
    new_user_id uuid := gen_random_uuid();
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND is_admin = true
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(user_email)) THEN
      RAISE EXCEPTION 'Email already registered';
    END IF;

    -- The password is never logged. The row records that an admin made an
    -- account whose first password they chose.
    PERFORM public.log_admin_action(
      'create_user', 'user', new_user_id::text, lower(user_email),
      jsonb_build_object('display_name', user_display_name, 'handicap', user_handicap, 'admin_chose_password', true)
    );

    -- Insert auth user
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated',
      lower(user_email),
      crypt(user_password, gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false, now(), now()
    );

    -- Insert auth identity (required for login)
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', lower(user_email)),
      'email',
      new_user_id::text,
      now(), now(), now()
    );

    -- Create user profile
    INSERT INTO public.user_profiles (
      user_id, is_admin, admin_only, onboarding_complete, display_name, handicap_index, tee
    ) VALUES (
      new_user_id, false, false, false, user_display_name, user_handicap, 'White'
    );

    RETURN new_user_id;
  END;
  $function$;

create or replace function public.admin_delete_round(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  DECLARE
    v_label text;
    v_status text;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND is_admin = true
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT course_snapshot->>'courseName', status INTO v_label, v_status
    FROM rounds WHERE id = target_round_id::text;

    PERFORM public.log_admin_action(
      'delete_round', 'round', target_round_id::text, v_label,
      jsonb_build_object('status', v_status)
    );

    DELETE FROM hole_scores WHERE round_id = target_round_id;
    DELETE FROM round_players WHERE round_id = target_round_id;
    DELETE FROM buy_ins WHERE round_id = target_round_id;
    DELETE FROM bbb_points WHERE round_id = target_round_id;
    DELETE FROM settlements WHERE round_id = target_round_id;
    DELETE FROM junk_records WHERE round_id = target_round_id;
    DELETE FROM side_bets WHERE round_id = target_round_id;
    DELETE FROM round_participants WHERE round_id = target_round_id;
    DELETE FROM notifications WHERE round_id = target_round_id;
    DELETE FROM rounds WHERE id = target_round_id;
  END;
  $function$;

create or replace function public.admin_delete_user(p_user_id uuid, p_keep_courses boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_email text;
  v_label text;
  v_courses_kept int := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select is_admin into v_is_admin
  from public.user_profiles where user_id = v_caller;

  if v_is_admin is not true then
    raise exception 'Admin only';
  end if;

  -- Deleting yourself through the admin path would leave you signed in against an
  -- account that no longer exists. Settings → Danger Zone is the route for that.
  if p_user_id = v_caller then
    raise exception 'Use delete_own_account() to delete your own account';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'No such user';
  end if;

  select display_name into v_label from public.user_profiles where user_id = p_user_id;

  -- Promote before deleting: once the courses rows are gone there is nothing to copy.
  if p_keep_courses then
    insert into public.shared_courses (id, created_by, name, tees, holes)
    select c.id, v_caller, c.name, c.tees, c.holes
    from public.courses c
    where c.user_id = p_user_id
      and not exists (select 1 from public.shared_courses s where s.id = c.id);
    get diagnostics v_courses_kept = row_count;
  end if;

  perform public.log_admin_action(
    'delete_user_profile', 'user', p_user_id::text, coalesce(v_label, v_email),
    jsonb_build_object('email', v_email, 'courses_kept', v_courses_kept)
  );

  -- Same order as delete_own_account: rows in OTHER users' rounds first, since they
  -- reference auth.users directly and would block the final delete.
  delete from public.prop_wagers         where user_id = p_user_id;
  delete from public.prop_bets           where user_id = p_user_id;
  delete from public.settlements         where user_id = p_user_id;
  delete from public.side_bets           where user_id = p_user_id;
  delete from public.junk_records        where user_id = p_user_id;
  delete from public.bbb_points          where user_id = p_user_id;
  delete from public.buy_ins             where user_id = p_user_id;
  delete from public.hole_scores         where user_id = p_user_id;
  delete from public.round_players       where user_id = p_user_id;
  delete from public.round_participants  where user_id = p_user_id;
  delete from public.notifications       where user_id = p_user_id;
  delete from public.tournament_matchups where user_id = p_user_id;
  delete from public.tournament_rounds   where user_id = p_user_id;
  delete from public.event_participants  where user_id = p_user_id;

  -- Parents the user owns. These cascade to their children, including other
  -- players' rows inside rounds this user created.
  delete from public.rounds      where user_id = p_user_id;
  delete from public.tournaments where user_id = p_user_id;
  delete from public.events      where user_id = p_user_id;

  -- Prop rows in other users' rounds that point at this user's guest players
  -- (players back-refs are RESTRICT).
  delete from public.prop_wagers where player_id in
    (select id from public.players where user_id = p_user_id);
  delete from public.prop_bets where target_player_id in
    (select id from public.players where user_id = p_user_id)
     or creator_id in (select id from public.players where user_id = p_user_id);

  delete from public.courses        where user_id = p_user_id;
  delete from public.players        where user_id = p_user_id;
  delete from public.pinned_friends where user_id = p_user_id;
  delete from public.user_profiles  where user_id = p_user_id;

  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'deleted_user_id', p_user_id,
    'email', v_email,
    'courses_kept', v_courses_kept
  );
end;
$function$;

create or replace function public.admin_round_add_player(p_round_id text, p_user_id uuid default null::uuid, p_name text default null::text, p_group integer default null::integer)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform public.log_admin_action(
    'round_add_player', 'round', p_round_id, v_round.course_snapshot->>'courseName',
    jsonb_build_object('player_id', v_player_id, 'name', v_name, 'user_id', p_user_id, 'group', p_group)
  );

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
$function$;

create or replace function public.admin_round_grant_access(p_round_id text, p_player_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  -- Binding a seat to your own account is scoring as that player with no
  -- record. An admin who plays joins the round the way everyone does.
  if p_user_id = auth.uid() then
    raise exception 'An admin cannot bind a seat to their own account';
  end if;

  perform public.log_admin_action(
    'round_grant_access', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object('player_id', p_player_id, 'user_id', p_user_id)
  );

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
$function$;

create or replace function public.admin_round_remove_player(p_round_id text, p_player_id text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  select event_id into v_event_id from public.rounds where id = p_round_id;

  perform public.log_admin_action(
    'round_remove_player', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object(
      'player_id', p_player_id,
      'player_name', (select p->>'name' from public.rounds r, jsonb_array_elements(coalesce(r.players, '[]'::jsonb)) p
                      where r.id = p_round_id and p->>'id' = p_player_id limit 1),
      'settlements_removed', (select count(*) from public.settlements s
                              where s.round_id = p_round_id and (s.from_player_id = p_player_id or s.to_player_id = p_player_id))
    )
  );

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
$function$;

create or replace function public.admin_round_repair(p_round_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform public.log_admin_action(
    'round_repair', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object('event_link_cleared', v_rows > 0)
  );

  return jsonb_build_object('event_link_cleared', v_rows > 0);
end;
$function$;

create or replace function public.admin_round_set_game_type(p_round_id text, p_game_type text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform public.log_admin_action(
    'round_set_game_type', 'round', p_round_id, v_round.course_snapshot->>'courseName',
    jsonb_build_object('from', v_round.game->>'type', 'to', p_game_type, 'status', v_round.status)
  );

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
$function$;

create or replace function public.admin_round_set_group(p_round_id text, p_player_id text, p_group integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_event_id text;
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  perform public.log_admin_action(
    'round_set_group', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object(
      'player_id', p_player_id,
      'from', (select nullif(r.groups->>p_player_id, '')::int from public.rounds r where r.id = p_round_id),
      'to', p_group)
  );

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
$function$;

create or replace function public.admin_round_set_handicap(p_round_id text, p_player_id text, p_handicap numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  -- A handicap change moves money on an open round; the old value is the part
  -- nobody can recover afterwards.
  perform public.log_admin_action(
    'round_set_handicap', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object(
      'player_id', p_player_id,
      'from', (select (p->>'handicapIndex')::numeric from public.rounds r, jsonb_array_elements(coalesce(r.players, '[]'::jsonb)) p
               where r.id = p_round_id and p->>'id' = p_player_id limit 1),
      'to', p_handicap,
      'status', (select r.status from public.rounds r where r.id = p_round_id))
  );

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
$function$;

create or replace function public.admin_round_set_role(p_round_id text, p_player_id text, p_role text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform public.log_admin_action(
    'round_set_role', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object(
      'player_id', p_player_id,
      'event_id', v_event_id,
      'from', (select ep.role from public.event_participants ep where ep.event_id = v_event_id and ep.player_id = p_player_id limit 1),
      'to', p_role)
  );

  update public.event_participants
  set role = p_role
  where event_id = v_event_id and player_id = p_player_id;

  if not found then
    raise exception 'That player has not joined the event yet — grant access first';
  end if;
end;
$function$;

create or replace function public.admin_round_set_stake(p_round_id text, p_tokens integer)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform public.log_admin_action(
    'round_set_stake', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object(
      'from_tokens', (select coalesce((r.game->>'buyInCents')::int, 0) / 100 from public.rounds r where r.id = p_round_id),
      'to_tokens', p_tokens,
      'unpaid_buy_ins_rewritten', (select count(*) from public.buy_ins b where b.round_id = p_round_id and b.status = 'unpaid'))
  );

  -- Stored in cents; the UI works in whole tokens (1 token = 100).
  update public.rounds
  set game = jsonb_set(game, '{buyInCents}', to_jsonb(p_tokens * 100))
  where id = p_round_id and game is not null;

  update public.buy_ins
  set amount_cents = p_tokens * 100
  where round_id = p_round_id and status = 'unpaid';
end;
$function$;

create or replace function public.admin_round_set_status(p_round_id text, p_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform public.log_admin_action(
    'round_set_status', 'round', p_round_id,
    (select r.course_snapshot->>'courseName' from public.rounds r where r.id = p_round_id),
    jsonb_build_object(
      'from', (select r.status from public.rounds r where r.id = p_round_id),
      'to', p_status,
      'settlement_rows', (select count(*) from public.settlements s where s.round_id = p_round_id))
  );

  update public.rounds set status = p_status where id = p_round_id;
end;
$function$;

create or replace function public.admin_set_user_admin(target_user_id uuid, make_admin boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND is_admin = true
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    IF target_user_id = auth.uid() AND make_admin = false THEN
      RAISE EXCEPTION 'Cannot remove your own admin access';
    END IF;

    PERFORM public.log_admin_action(
      'toggle_admin', 'user', target_user_id::text,
      (SELECT display_name FROM user_profiles WHERE user_id = target_user_id),
      jsonb_build_object('granted', make_admin)
    );

    PERFORM set_config('app.admin_bypass', 'true', true);
    UPDATE user_profiles SET is_admin = make_admin WHERE user_id = target_user_id;
    PERFORM set_config('app.admin_bypass', 'false', true);
  END;
  $function$;

create or replace function public.admin_update_player(target_player_id text, new_name text default null::text, new_handicap double precision default null::double precision, new_tee text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  DECLARE
    v_before players%ROWTYPE;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND is_admin = true
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_before FROM players WHERE id = target_player_id;

    PERFORM public.log_admin_action(
      'update_player', 'player', target_player_id, v_before.name,
      jsonb_strip_nulls(jsonb_build_object(
        'name', CASE WHEN new_name IS NOT NULL THEN jsonb_build_object('from', v_before.name, 'to', new_name) END,
        'handicap', CASE WHEN new_handicap IS NOT NULL THEN jsonb_build_object('from', v_before.handicap_index, 'to', new_handicap) END,
        'tee', CASE WHEN new_tee IS NOT NULL THEN jsonb_build_object('from', v_before.tee, 'to', new_tee) END,
        'owner_user_id', v_before.user_id
      ))
    );

    UPDATE players SET
      name = COALESCE(new_name, name),
      handicap_index = COALESCE(new_handicap, handicap_index),
      tee = COALESCE(new_tee, tee)
    WHERE id = target_player_id;
  END;
  $function$;

create or replace function public.admin_update_user_profile(target_user_id uuid, new_display_name text default null::text, new_handicap double precision default null::double precision, new_venmo text default null::text, new_zelle text default null::text, new_cashapp text default null::text, new_paypal text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  DECLARE
    v_before user_profiles%ROWTYPE;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND is_admin = true
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT * INTO v_before FROM user_profiles WHERE user_id = target_user_id;

    -- Payment handles decide where a player gets paid, so before and after are
    -- both recorded. Only the fields the admin sent appear.
    PERFORM public.log_admin_action(
      'update_user_profile', 'user', target_user_id::text, v_before.display_name,
      jsonb_strip_nulls(jsonb_build_object(
        'display_name', CASE WHEN new_display_name IS NOT NULL THEN jsonb_build_object('from', v_before.display_name, 'to', new_display_name) END,
        'handicap',     CASE WHEN new_handicap IS NOT NULL THEN jsonb_build_object('from', v_before.handicap_index, 'to', new_handicap) END,
        'venmo',        CASE WHEN new_venmo IS NOT NULL THEN jsonb_build_object('from', v_before.venmo_username, 'to', new_venmo) END,
        'zelle',        CASE WHEN new_zelle IS NOT NULL THEN jsonb_build_object('from', v_before.zelle_identifier, 'to', new_zelle) END,
        'cashapp',      CASE WHEN new_cashapp IS NOT NULL THEN jsonb_build_object('from', v_before.cashapp_username, 'to', new_cashapp) END,
        'paypal',       CASE WHEN new_paypal IS NOT NULL THEN jsonb_build_object('from', v_before.paypal_email, 'to', new_paypal) END
      ))
    );

    UPDATE user_profiles SET
      display_name = COALESCE(new_display_name, display_name),
      handicap_index = COALESCE(new_handicap, handicap_index),
      venmo_username = COALESCE(new_venmo, venmo_username),
      zelle_identifier = COALESCE(new_zelle, zelle_identifier),
      cashapp_username = COALESCE(new_cashapp, cashapp_username),
      paypal_email = COALESCE(new_paypal, paypal_email)
    WHERE user_id = target_user_id;
  END;
  $function$;

commit;
