-- Per-hole wagering declarations, lifted out of `rounds.game.config`.
--
-- WHY THIS TABLE EXISTS
--
-- Presses, Wolf partner picks and Hammer states were stored inside the chosen
-- game's config blob. That works only while the game is chosen before the first tee
-- shot. Deferred game selection moves the Class A pick to AFTER the round, so on
-- hole 4 there is no game object to nest a press inside. A declaration has to be a
-- fact about a HOLE of a ROUND, standing on its own, readable by whichever game the
-- group eventually picks.
--
-- It also fixes a live defect. `rounds` has one UPDATE policy — "own update", owner
-- only — so a joined player could never persist their own Wolf pick: the write
-- matched zero rows and failed silently, leaving the pick visible locally and
-- nowhere else. Declarations are round-scoped rows with participant-write RLS
-- modelled on `hole_scores`, so the player who owns a decision can actually record
-- it.
--
-- `kind` is open text rather than an enum so the arm gate can add declaration types
-- without a migration. Known kinds today:
--   'wolf_partner'  player_id = the Wolf   payload {"partnerId": "<id>"|null}
--   'press'         player_id = presser    payload {}
--   'hammer'        player_id = holder     payload {"value":n,"presses":n,
--                                                   "declined":bool,"declinedBy":"<id>"}
-- A Lone Wolf declaration is `{"partnerId": null}` — PRESENT with a null partner.
-- Absence of the row is what "undeclared" means, and the two must not be conflated.

create table if not exists public.hole_declarations (
  id          text primary key,
  user_id     uuid not null,          -- who wrote it; drives RLS, as on hole_scores
  round_id    text not null references public.rounds(id) on delete cascade,
  hole_number integer not null,
  kind        text not null,
  player_id   text,                   -- the declaration's SUBJECT, not its author
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hole_declarations_round_idx
  on public.hole_declarations (round_id, hole_number);

-- One Wolf pick and one Hammer state per hole. Presses are per player, so several
-- can coexist on a hole — hence two partial indexes rather than one blanket
-- constraint. These are what make the client's upserts idempotent, which matters
-- when two devices race the same declaration.
create unique index if not exists hole_declarations_singleton_idx
  on public.hole_declarations (round_id, hole_number, kind)
  where kind in ('wolf_partner', 'hammer');

create unique index if not exists hole_declarations_press_idx
  on public.hole_declarations (round_id, hole_number, kind, player_id)
  where kind = 'press';

alter table public.hole_declarations enable row level security;

-- Read: anyone in the round. The owner is checked explicitly — creating a round does
-- NOT create a round_participants row (those come only from the invite/join RPCs),
-- so is_round_participant is false for the organiser of a solo round.
create policy "read declarations" on public.hole_declarations
  for select using (
    user_id = auth.uid()
    or public.is_round_participant(round_id)
    or exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
  );

-- Write: your own rows, and only into a round you are actually in. Without the
-- second clause any authenticated user could write declarations into any round.
create policy "insert own declarations" on public.hole_declarations
  for insert with check (
    user_id = auth.uid()
    and (
      public.is_round_participant(round_id)
      or exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
    )
  );

create policy "update own declarations" on public.hole_declarations
  for update using (user_id = auth.uid());

create policy "delete own declarations" on public.hole_declarations
  for delete using (user_id = auth.uid());

create trigger hole_declarations_updated_at
  before update on public.hole_declarations
  for each row execute function public.update_updated_at();

-- Teams move to the roster row. Best Ball and Vegas both read them, and §4 fixes
-- teams at setup, so they belong with the player rather than inside a game blob that
-- is not chosen until the round ends.
alter table public.round_players
  add column if not exists team text;
