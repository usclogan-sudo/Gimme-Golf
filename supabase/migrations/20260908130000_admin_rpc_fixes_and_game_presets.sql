-- Admin dashboard repairs found during the 6 September field test, plus the second
-- table that existed only outside the migration history.
--
-- These were applied by hand to production on the day. Recording them here so a
-- rebuilt environment gets them too — the drift this migration exists to close is
-- the same one that hid shared_courses for months.

-- ─── 1. "column reference user_id is ambiguous" (42702) ──────────────────────
--
-- Both functions declare user_id as an OUT column in RETURNS TABLE, then check
-- admin rights with a bare `where user_id = auth.uid()`. Postgres cannot tell the
-- OUT parameter from user_profiles.user_id and refuses the whole call, so both
-- admin tabs came back empty for a genuine admin.
--
-- The client reported this as "make sure the RPC is deployed", which sent the
-- investigation to deployment and then to permissions before the browser console
-- gave up the real error. The functions were deployed and the caller was an admin
-- the whole time.
--
-- Aliasing the table is the fix. Only these two were affected: admin_get_all_users
-- returns SETOF user_profiles and admin_get_user_details takes target_user_id, so
-- neither has an OUT column called user_id to collide with.

create or replace function public.admin_get_all_players()
returns table (
  id text, user_id uuid, name text, handicap_index double precision, tee text,
  ghin_number text, is_public boolean, venmo_username text, zelle_identifier text,
  cashapp_username text, paypal_email text, created_at timestamptz, owner_name text
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  return query
    select p.id, p.user_id, p.name, p.handicap_index, p.tee, p.ghin_number,
           p.is_public, p.venmo_username, p.zelle_identifier, p.cashapp_username,
           p.paypal_email, p.created_at,
           coalesce(up2.display_name, 'Unknown')
    from public.players p
    left join public.user_profiles up2 on up2.user_id = p.user_id
    order by p.name;
end;
$$;

grant execute on function public.admin_get_all_players() to authenticated;

-- admin_get_all_rounds additionally declared id and course_id as uuid where the
-- columns are text, and returned a created_by column that does not exist on rounds
-- (the owner is user_id). Those would have failed the moment the ambiguity was
-- fixed, so the signature is corrected here too — which needs a drop, since a
-- return type cannot be changed by CREATE OR REPLACE.
drop function if exists public.admin_get_all_rounds();

create function public.admin_get_all_rounds()
returns table (
  id text, course_id text, date timestamptz, status text, current_hole integer,
  players jsonb, game jsonb, course_snapshot jsonb, user_id uuid, created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin = true
  ) then
    raise exception 'Not authorized';
  end if;

  return query
    select r.id, r.course_id, r.date, r.status, r.current_hole,
           r.players, r.game, r.course_snapshot, r.user_id, r.created_at
    from public.rounds r
    order by r.date desc;
end;
$$;

grant execute on function public.admin_get_all_rounds() to authenticated;

-- ─── 2. game_presets ─────────────────────────────────────────────────────────
--
-- Queried by NewRound on every load and by the admin dashboard, defined only in
-- supabase/legacy-sql, and absent from production — the load 404s. Nothing surfaced
-- because the client does `if (data) setGamePresets(...)` and drops the error, so
-- saved game presets have silently never worked.
--
-- Created here in its final shape, so a database built from migrations has it and
-- production picks it up as a no-op if it was created by hand in the meantime.
create table if not exists public.game_presets (
  id            text primary key,
  created_by    uuid references auth.users(id) on delete set null,
  name          text not null,
  game_type     text not null,
  buy_in_cents  int not null,
  stakes_mode   text not null default 'standard',
  config        jsonb not null,
  description   text,
  sort_order    int not null default 0,
  created_at    timestamptz default now()
);

alter table public.game_presets enable row level security;

-- Policies have no IF NOT EXISTS, so drop before create to stay idempotent.
drop policy if exists "all read" on public.game_presets;
create policy "all read" on public.game_presets
  for select using (auth.uid() is not null);

drop policy if exists "admin insert" on public.game_presets;
create policy "admin insert" on public.game_presets
  for insert with check (exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin));

drop policy if exists "admin update" on public.game_presets;
create policy "admin update" on public.game_presets
  for update using (exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin));

drop policy if exists "admin delete" on public.game_presets;
create policy "admin delete" on public.game_presets
  for delete using (exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.is_admin));

-- created_by was `references auth.users not null` in the legacy definition, which
-- would have made any admin who saved a preset undeletable — the same trap fixed on
-- shared_courses. Nulled instead: a preset is shared configuration that should
-- outlive whoever added it.
alter table public.game_presets
  alter column created_by drop not null;

alter table public.game_presets
  drop constraint if exists game_presets_created_by_fkey;

alter table public.game_presets
  add constraint game_presets_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ─── 3. Retire the legacy admin_delete_user ──────────────────────────────────
--
-- The original admin_delete_user(target_user_id uuid) clears child rows by
-- `round_id = any(round_ids)` — rows inside the user's OWN rounds — and never
-- touches their rows in other people's rounds, nor their courses or players. Those
-- reference auth.users directly with no ON DELETE clause, so the final delete fails
-- for anyone who has ever played in a round they did not create. That is the exact
-- chain that blocked a deletion during the field test, and the admin button has
-- therefore never worked for a real user.
--
-- admin_delete_user(p_user_id uuid, p_keep_courses boolean) from 20260907120000
-- walks the full FK graph and preserves courses. Dropping the old one matters
-- because PostgREST resolves by named argument: a client sending target_user_id
-- would keep reaching the broken version while the working one sat unused beside it.
drop function if exists public.admin_delete_user(uuid);
