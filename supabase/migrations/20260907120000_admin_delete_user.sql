-- Admin-side account deletion, with the option to keep the user's courses.
--
-- WHY
--
-- Deleting a user from the Supabase dashboard fails for anyone who has used the
-- app: twenty tables reference auth.users with no ON DELETE clause, so Postgres
-- refuses while any row remains. The dashboard reports only "Database error
-- deleting user" and names nothing, so the usual outcome is a hand-written delete
-- script and a guess at the FK order.
--
-- delete_own_account() already encodes that order correctly, but it is scoped to
-- auth.uid() — by design, so a caller can never delete anyone else. This is its
-- admin counterpart: same ordering, explicit target, gated on is_admin.
--
-- COURSES
--
-- public.courses is private per user (RLS: auth.uid() = user_id) and user_id is NOT
-- NULL, so an ownerless course is invisible to everyone — "keep the courses" cannot
-- mean leaving them behind. A course is a real golf course rather than personal
-- data, so the useful thing is to move it somewhere it stays reachable:
--
--   keep_courses = true   → copied into shared_courses, the catalogue every signed-in
--                           user can read, credited to the admin doing the deletion.
--   keep_courses = false  → deleted with the rest of the account.
--
-- Courses already in the catalogue under the same id are left alone, so re-running
-- is safe.

create or replace function public.admin_delete_user(
  p_user_id uuid,
  p_keep_courses boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_email text;
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

  -- Promote before deleting: once the courses rows are gone there is nothing to copy.
  if p_keep_courses then
    insert into public.shared_courses (id, created_by, name, tees, holes)
    select c.id, v_caller, c.name, c.tees, c.holes
    from public.courses c
    where c.user_id = p_user_id
      and not exists (select 1 from public.shared_courses s where s.id = c.id);
    get diagnostics v_courses_kept = row_count;
  end if;

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
$$;

comment on function public.admin_delete_user(uuid, boolean) is
  'Admin-only deletion of another user. Clears every table referencing auth.users in FK order, then the auth row. With p_keep_courses (default true) their courses are copied into shared_courses first, credited to the deleting admin.';

revoke all on function public.admin_delete_user(uuid, boolean) from public;
revoke all on function public.admin_delete_user(uuid, boolean) from anon;
grant execute on function public.admin_delete_user(uuid, boolean) to authenticated;

-- shared_courses.created_by references auth.users with no ON DELETE clause, so
-- publishing a catalogue course made its author permanently undeletable — the same
-- failure this function exists to solve, one level up, and it would have bitten the
-- first time an admin who had published a course was removed. The catalogue is
-- deliberately data that outlives its author, so the reference is nulled rather than
-- cascaded: the course stays, it just stops naming a row that no longer exists.
--
-- The table is created here if missing. It exists in production but was applied
-- outside the migration history (supabase/legacy-sql), so a database built purely
-- from migrations — every preview branch, and any fresh environment — does not have
-- it, and altering it failed. Creating it in its final shape makes this migration
-- reproducible; on production the create is a no-op and the alters below do the work.
create table if not exists public.shared_courses (
  id         text primary key,
  created_by uuid references auth.users(id) on delete set null,
  name       text not null,
  tees       jsonb not null,
  holes      jsonb not null,
  created_at timestamptz default now()
);

alter table public.shared_courses enable row level security;

-- Idempotent: policies have no IF NOT EXISTS, so drop-then-create. Same rules the
-- catalogue has always had — everyone signed in can read, only admins can write.
drop policy if exists "all read" on public.shared_courses;
create policy "all read" on public.shared_courses
  for select using (auth.uid() is not null);

drop policy if exists "admin insert" on public.shared_courses;
create policy "admin insert" on public.shared_courses
  for insert with check (exists (
    select 1 from public.user_profiles where user_id = auth.uid() and is_admin));

drop policy if exists "admin update" on public.shared_courses;
create policy "admin update" on public.shared_courses
  for update using (exists (
    select 1 from public.user_profiles where user_id = auth.uid() and is_admin));

drop policy if exists "admin delete" on public.shared_courses;
create policy "admin delete" on public.shared_courses
  for delete using (exists (
    select 1 from public.user_profiles where user_id = auth.uid() and is_admin));

-- For databases where the table already existed with the original strict reference.
-- Both are no-ops on a table just created above.
alter table public.shared_courses
  alter column created_by drop not null;

alter table public.shared_courses
  drop constraint if exists shared_courses_created_by_fkey;

alter table public.shared_courses
  add constraint shared_courses_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
