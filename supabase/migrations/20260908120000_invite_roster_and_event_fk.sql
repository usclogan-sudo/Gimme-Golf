-- Two fixes from the 6 September field test.
-- See docs/Gimme-Field-Test-Lessons-2026-09-06.md.

-- ─── 1. Invite the roster when a round is created ────────────────────────────
--
-- Selecting players at setup wrote their NAMES into rounds.players and nothing
-- else. No participant row, no notification, nothing on their home screen — so a
-- player opened the app, saw the round and their own name, and was read-only, with
-- no indication anything was missing. On the day six of thirteen were in this state
-- and it read as the app being broken.
--
-- Everything needed to fix it already existed: pending round_participants,
-- round_invite notifications, the PendingInvites card and respond_to_round_invite.
-- The only missing piece was something to CREATE the invite at setup, rather than
-- only when the organiser adds someone by hand afterwards.
--
-- This mirrors invite_to_round's shape (pending row + round_invite notification) but
-- covers the whole roster in one call. It is idempotent: a player who already has a
-- row of any status is skipped, so re-running never disturbs someone who has already
-- accepted or deliberately declined.
--
-- Only roster entries whose id is a real auth user are invited. A registered user's
-- player_id IS their auth uuid (see the self-player synthesis in NewRound), so that
-- match is exact. Guest entries have no account to notify and are left alone — the
-- organiser scores for them, which is the point of a guest.

create or replace function public.invite_roster_to_round(p_round_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_round record;
  v_creator_name text;
  v_course_name text;
  v_invited int := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found';
  end if;
  if v_round.user_id != v_caller then
    raise exception 'Only the round owner can invite the roster';
  end if;

  select display_name into v_creator_name
  from public.user_profiles where user_id = v_caller;
  v_course_name := coalesce(v_round.course_snapshot->>'courseName', 'a round');

  with candidates as (
    select (p->>'id') as player_id, (p->>'id')::uuid as user_id
    from jsonb_array_elements(coalesce(v_round.players, '[]'::jsonb)) p
    where (p->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (select 1 from auth.users u where u.id = (p->>'id')::uuid)
      -- The organiser is already the owner; inviting them to their own round would
      -- put a pointless card on their own home screen.
      and (p->>'id')::uuid <> v_caller
      and not exists (
        select 1 from public.round_participants rp
        where rp.round_id = p_round_id and rp.user_id = (p->>'id')::uuid)
  ),
  inserted as (
    insert into public.round_participants
      (id, round_id, user_id, player_id, status, invited_by, invited_at)
    select gen_random_uuid()::text, p_round_id, c.user_id, c.player_id,
           'pending', v_caller, now()
    from candidates c
    returning user_id
  )
  insert into public.notifications
    (id, user_id, type, title, body, round_id, invite_code, read, created_at)
  select gen_random_uuid()::text, i.user_id, 'round_invite',
         coalesce(v_creator_name, 'Someone') || ' added you to a round at ' || v_course_name,
         'Tap to accept and start scoring',
         p_round_id, v_round.invite_code, false, now()
  from inserted i;

  get diagnostics v_invited = row_count;
  return v_invited;
end;
$$;

comment on function public.invite_roster_to_round(text) is
  'Creates pending round_participants + round_invite notifications for every registered player already on the round roster. Idempotent; skips guests, the owner, and anyone who already has a row.';

revoke all on function public.invite_roster_to_round(text) from public;
revoke all on function public.invite_roster_to_round(text) from anon;
grant execute on function public.invite_roster_to_round(text) to authenticated;

-- ─── 2. A deleted event must not strand its round ────────────────────────────
--
-- rounds.event_id had no foreign key, so deleting an event left the column pointing
-- at nothing. isEventRound is `!!round.eventId` — it trusts the column rather than
-- whether the event loaded — so the round stayed in event mode with no event, while
-- event_participants cascaded away and took every player's membership with it.
-- Eleven of thirteen players went read-only mid-round and the only route back was
-- recreating the event by hand.
--
-- SET NULL rather than CASCADE, deliberately: losing the event should demote a round
-- to an ordinary round, which still scores and settles perfectly well. Cascading
-- would delete the round and every score in it, turning a recoverable mistake into
-- an unrecoverable one.
update public.rounds r
set event_id = null
where r.event_id is not null
  and not exists (select 1 from public.events e where e.id = r.event_id);

alter table public.rounds
  drop constraint if exists rounds_event_id_fkey;

alter table public.rounds
  add constraint rounds_event_id_fkey
  foreign key (event_id) references public.events(id) on delete set null;
