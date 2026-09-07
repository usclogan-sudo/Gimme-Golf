-- Break the recursive RLS cycle that made events unjoinable.
--
-- SYMPTOM
--
-- Creating an event appeared to succeed -- share screen, code, QR -- while two
-- writes failed silently underneath:
--
--   [safeWrite] link event to round:              42P17
--   [safeWrite] insert event manager participant: 42P17
--
-- "infinite recursion detected in policy for relation event_participants".
--
-- Downstream, rounds.event_id was never set, so the join screen followed a null
-- link and rendered "Unknown Course - 0 players" with an empty "Which player are
-- you?" list. No names to claim means no way to join. That is the September 6
-- field test failure, and it is why exactly one event row exists in a database
-- with thirty-three rounds.
--
-- THE CYCLE, WHICH HAS THREE ENTRY POINTS RATHER THAN THE OBVIOUS ONE
--
--   1. event_participants_read (SELECT on event_participants) contains
--      EXISTS (SELECT 1 FROM event_participants ep2 ...) -- a self-reference.
--      Postgres applies RLS to that subquery, which re-enters the same policy.
--
--   2. events_participant_read (SELECT on events) reads event_participants,
--      whose policy is (1).
--
--   3. event_participants_owner is FOR ALL with a USING clause that reads
--      events. Postgres reuses USING as WITH CHECK when WITH CHECK is omitted,
--      so an INSERT evaluates it, reads events, and lands in (2) -> (1).
--
-- Point 3 is why the manager insert failed even though event_participants_self_insert
-- would have allowed it on its own: PERMISSIVE policies are OR'd for the result, but
-- every one of them is still evaluated, and an exception in any of them fails the
-- statement.
--
-- This shape is in the 30 June baseline (line 2818); the July rewrite in
-- 20260703050000 preserved it rather than introducing it.
--
-- THE FIX
--
-- Membership and ownership tests move into SECURITY DEFINER helpers, which run as
-- the function owner and therefore do not re-enter RLS. Both answer a question
-- strictly about the CALLER (auth.uid()), so neither can be used to read another
-- user's rows -- they widen no data access, they only stop the policy eating itself.

create or replace function public.is_event_member(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.user_id = auth.uid()
      and ep.status = 'accepted'
  );
$$;

comment on function public.is_event_member(text) is
  'True when the CALLER is an accepted participant of the event. SECURITY DEFINER so that event RLS policies can test membership without re-entering event_participants RLS (42P17).';

create or replace function public.is_event_owner(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.user_id = auth.uid()
  );
$$;

comment on function public.is_event_owner(text) is
  'True when the CALLER owns the event. SECURITY DEFINER so that event_participants policies can test ownership without reading events and re-entering the cycle.';

revoke all on function public.is_event_member(text) from public, anon;
revoke all on function public.is_event_owner(text) from public, anon;
grant execute on function public.is_event_member(text) to authenticated;
grant execute on function public.is_event_owner(text) to authenticated;

-- ─── event_participants ──────────────────────────────────────────────────────

drop policy if exists event_participants_read on public.event_participants;
create policy event_participants_read on public.event_participants for select using (
  user_id = auth.uid()
  or public.is_event_member(event_id)
  or public.is_event_owner(event_id)
);

-- Rewritten to use the helper for the same reason: as FOR ALL, its USING doubles
-- as the INSERT check, so reading events here is what blocked the manager row.
drop policy if exists event_participants_owner on public.event_participants;
create policy event_participants_owner on public.event_participants for all
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

-- ─── events ──────────────────────────────────────────────────────────────────
--
-- The added user_id clause matters more than it looks. Without it an organiser
-- holding no participant row cannot read the event they just created -- which is
-- the state every event in production is currently in, because the row that would
-- have granted them access is the one the recursion prevented from being written.
drop policy if exists events_participant_read on public.events;
create policy events_participant_read on public.events for select using (
  user_id = auth.uid()
  or public.is_event_member(id)
);
