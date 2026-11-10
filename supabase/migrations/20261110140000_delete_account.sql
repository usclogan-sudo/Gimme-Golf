-- Account deletion that leaves other players' finished rounds intact (Spec 1).
--
-- delete_own_account removed every row the caller ever wrote, including their
-- scores in other people's finished rounds, so one deletion punched holes in
-- everyone else's history. Both stores require in app deletion; neither
-- requires taking the group's scorecard with it.
--
-- delete_account keeps finished rounds whole. The caller's seat in each is
-- renamed "Former player", and the rows they wrote there (scores, buy ins,
-- settlements, the round itself if they organized it) are reassigned to a
-- reserved account that can never sign in. Every foreign key to auth.users
-- is NOT NULL and NO ACTION, so reassignment is what lets the auth row go
-- without loosening a constraint. Everything in rounds still in play, and
-- everything personal (profile, payment handles, courses, guests, invites,
-- notifications), is deleted as before.
--
-- delete_own_account stays as a name and now calls delete_account, so the
-- current client keeps working during the rollout.

begin;

-- ─── The reserved account ────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, banned_until,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-00000000f0f0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'former-player@reserved.gimme.invalid',
  '', now(), '', '', '', '',
  '{"provider":"reserved","providers":[]}'::jsonb,
  '{"reserved":"former_player"}'::jsonb,
  false, 'infinity',
  now(), now()
)
on conflict (id) do nothing;

insert into public.user_profiles (user_id, is_admin, admin_only, onboarding_complete, display_name, tee)
values ('00000000-0000-4000-8000-00000000f0f0', false, false, true, 'Former player', 'White')
on conflict (user_id) do nothing;

-- ─── The deletion ────────────────────────────────────────────────────────────

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  uid_text text;
  former constant uuid := '00000000-0000-4000-8000-00000000f0f0';
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if uid = former then
    raise exception 'Reserved account';
  end if;
  uid_text := uid::text;

  -- 1. Finished rounds the caller sat in: rename the seat. The id stays, so
  --    scores, settlements and the leaderboard keep lining up.
  update public.rounds r
  set players = (
    select jsonb_agg(
      case when p->>'id' = uid_text
           then p || jsonb_build_object('name', 'Former player', 'ghinNumber', '')
           else p end
      order by ord)
    from jsonb_array_elements(r.players) with ordinality as t(p, ord)
  )
  where r.status = 'complete'
    and r.players @> jsonb_build_array(jsonb_build_object('id', uid_text));

  -- 2. Finished rounds the caller organized, and the rows they wrote in any
  --    finished round, move to the reserved account.
  update public.rounds set user_id = former
  where user_id = uid and status = 'complete';

  update public.events e set user_id = former
  where e.user_id = uid
    and exists (select 1 from public.rounds r where r.event_id = e.id and r.status = 'complete');

  update public.hole_scores h
  set user_id = former,
      submitted_by = case when h.submitted_by = uid then former else h.submitted_by end
  where h.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = h.round_id::text and r.status = 'complete');

  update public.round_players x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.buy_ins x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.settlements x
  set user_id = former,
      reported_by = case when x.reported_by = uid then former else x.reported_by end,
      confirmed_by = case when x.confirmed_by = uid then former else x.confirmed_by end
  where (x.user_id = uid or x.reported_by = uid or x.confirmed_by = uid)
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.junk_records x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.bbb_points x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.side_bets x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.prop_bets x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.rounds r where r.id::text = x.round_id::text and r.status = 'complete');

  update public.prop_wagers x set user_id = former
  where x.user_id = uid
    and exists (select 1 from public.prop_bets b join public.rounds r on r.id::text = b.round_id::text
                where b.id = x.prop_bet_id and r.status = 'complete');

  -- 3. Seat bindings and invitations go everywhere: the person is gone, the
  --    seat is not. Other players' participant rows are untouched.
  delete from public.round_participants where user_id = uid;
  delete from public.event_participants where user_id = uid;
  delete from public.notifications       where user_id = uid;

  -- 4. Whatever the caller wrote in rounds still in play.
  delete from public.prop_wagers         where user_id = uid;
  delete from public.prop_bets           where user_id = uid;
  delete from public.settlements         where user_id = uid;
  delete from public.side_bets           where user_id = uid;
  delete from public.junk_records        where user_id = uid;
  delete from public.bbb_points          where user_id = uid;
  delete from public.buy_ins             where user_id = uid;
  delete from public.hole_scores         where user_id = uid;
  delete from public.round_players       where user_id = uid;
  delete from public.tournament_matchups where user_id = uid;
  delete from public.tournament_rounds   where user_id = uid;

  -- 5. Rounds, tournaments and events the caller still owns, with their children.
  delete from public.rounds      where user_id = uid;
  delete from public.tournaments where user_id = uid;
  delete from public.events      where user_id = uid;

  -- 6. Prop rows elsewhere that point at the caller's guest players.
  delete from public.prop_wagers where player_id in (select id from public.players where user_id = uid);
  delete from public.prop_bets   where target_player_id in (select id from public.players where user_id = uid)
                                    or creator_id      in (select id from public.players where user_id = uid);

  -- 7. Personal data, then the account.
  delete from public.courses        where user_id = uid;
  delete from public.players        where user_id = uid;
  delete from public.pinned_friends where user_id = uid;
  delete from public.user_profiles  where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_account() is
  'Deletes the calling user and their personal data; keeps finished rounds readable for everyone else by renaming the seat "Former player" and reassigning the rows to a reserved account.';

revoke all on function public.delete_account() from public;
revoke all on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.delete_account();
end;
$$;

commit;
