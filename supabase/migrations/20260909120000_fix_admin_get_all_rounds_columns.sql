-- admin_get_all_rounds referenced columns that do not exist on rounds.
--
-- The baseline declared `created_by` and `created_at`; the table has neither — the
-- owner is user_id, and `date` is the only timestamp. The earlier fix in
-- 20260908130000 corrected the uuid/text mismatch but kept created_at, so the
-- function raised 42703 the moment an admin passed the authorization check.
--
-- The client logs the error and renders an empty list, so this surfaced as "No
-- rounds yet" on a database holding thirty-three of them — the third variant today
-- of a real error arriving as a misleading empty state.
--
-- Columns now match the table exactly, and event_id + invite_code are added since
-- the admin round panel needs both.
drop function if exists public.admin_get_all_rounds();

create function public.admin_get_all_rounds()
returns table (
  id text, course_id text, date timestamptz, status text, current_hole integer,
  players jsonb, game jsonb, course_snapshot jsonb, user_id uuid, event_id text,
  invite_code text
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
           r.players, r.game, r.course_snapshot, r.user_id, r.event_id, r.invite_code
    from public.rounds r
    order by r.date desc;
end;
$$;

grant execute on function public.admin_get_all_rounds() to authenticated;
