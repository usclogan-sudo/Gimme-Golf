-- Course catalog (Spec 2).
--
-- A licensed course dataset replaces the hand typed catalogue. The vendor key
-- lives in the course-search Edge Function; the browser never sees it. The
-- function caches every vendor answer here for thirty days, so the same search
-- or the same course costs one vendor call a month, not one per player.
--
--   courses_catalog     one row per vendor course: identity and location
--   course_tees         tee boxes with rating, slope and the per hole card
--   course_search_cache which search terms and map cells were asked recently
--   course_vendor_usage calls made per day, so the function stops at the cap
--   course_overrides    an organizer's correction to a round's card
--
-- Rounds keep snapshotting the card they were played from, so a catalog
-- refresh never changes a finished card. The correction RPC updates the
-- round's snapshot and records the change for review; the shared catalog row
-- is never edited by a player.
--
-- The catalog is keyed by (source, vendor_id). GolfCourseAPI is the first
-- source; a second vendor is a second source value, not a second schema.

begin;

create extension if not exists pg_trgm with schema extensions;

-- ─── Catalog ─────────────────────────────────────────────────────────────────

create table if not exists public.courses_catalog (
  source text not null default 'golfcourseapi',
  vendor_id text not null,
  club_name text,
  course_name text,
  name text not null,
  address text,
  city text,
  state text,
  country text,
  lat double precision,
  lng double precision,
  hole_count integer,
  scorecard_url text,
  summary_fetched_at timestamptz not null default now(),
  detail_fetched_at timestamptz,
  primary key (source, vendor_id)
);

create index if not exists courses_catalog_name_trgm
  on public.courses_catalog using gin (name extensions.gin_trgm_ops);
create index if not exists courses_catalog_city_idx
  on public.courses_catalog (lower(city), lower(state));
create index if not exists courses_catalog_latlng_idx
  on public.courses_catalog (lat, lng);

create table if not exists public.course_tees (
  source text not null,
  vendor_id text not null,
  gender text not null check (gender in ('male', 'female')),
  tee_name text not null,
  course_rating numeric(4,1),
  slope_rating integer,
  par_total integer,
  total_yards integer,
  total_meters integer,
  number_of_holes integer,
  holes jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (source, vendor_id, gender, tee_name),
  foreign key (source, vendor_id)
    references public.courses_catalog (source, vendor_id) on delete cascade
);

create table if not exists public.course_search_cache (
  kind text not null check (kind in ('search', 'near')),
  key text not null,
  result_ids text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  primary key (kind, key)
);

create table if not exists public.course_vendor_usage (
  day date primary key,
  calls integer not null default 0
);

alter table public.courses_catalog enable row level security;
alter table public.course_tees enable row level security;
alter table public.course_search_cache enable row level security;
alter table public.course_vendor_usage enable row level security;

-- Catalog and tees are public read. Only the Edge Function, running as the
-- service role, writes them. The cache and usage tables have no policies at
-- all, so only the service role can touch them.
drop policy if exists courses_catalog_read on public.courses_catalog;
create policy courses_catalog_read on public.courses_catalog
  for select to anon, authenticated using (true);

drop policy if exists course_tees_read on public.course_tees;
create policy course_tees_read on public.course_tees
  for select to anon, authenticated using (true);

grant select on public.courses_catalog, public.course_tees to anon, authenticated;

-- Nearest catalog courses to a point. A bounding box narrows the scan, then the
-- haversine distance orders and trims it. Miles, like the rest of the app.
create or replace function public.catalog_courses_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_mi double precision default 25,
  p_limit integer default 25
)
returns table (
  source text,
  vendor_id text,
  name text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  hole_count integer,
  detail_fetched_at timestamptz,
  distance_mi double precision
)
language sql
stable
set search_path = ''
as $$
  select * from (
    select c.source, c.vendor_id, c.name, c.city, c.state, c.lat, c.lng, c.hole_count, c.detail_fetched_at,
      3958.8 * 2 * asin(sqrt(
        power(sin(radians(c.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - p_lng) / 2), 2)
      )) as distance_mi
    from public.courses_catalog c
    where c.lat is not null and c.lng is not null
      and c.lat between p_lat - p_radius_mi / 69.0 and p_lat + p_radius_mi / 69.0
      and c.lng between p_lng - p_radius_mi / (69.0 * greatest(cos(radians(p_lat)), 0.1))
                    and p_lng + p_radius_mi / (69.0 * greatest(cos(radians(p_lat)), 0.1))
  ) near
  where near.distance_mi <= p_radius_mi
  order by near.distance_mi
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.catalog_courses_near(double precision, double precision, double precision, integer) to anon, authenticated;

-- ─── Card corrections ────────────────────────────────────────────────────────

create table if not exists public.course_overrides (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds (id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer check (par between 3 and 6),
  stroke_index integer check (stroke_index between 1 and 18),
  previous_par integer,
  previous_stroke_index integer,
  reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (round_id, hole_number)
);

alter table public.course_overrides enable row level security;

drop policy if exists course_overrides_read on public.course_overrides;
create policy course_overrides_read on public.course_overrides
  for select to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and (r.user_id = auth.uid() or public.is_round_participant(r.id))
    )
    or public.is_admin_caller()
  );

grant select on public.course_overrides to authenticated;

-- The correction itself goes through correct_round_card so the override row
-- and the snapshot change are one transaction.
create or replace function public.correct_round_card(
  p_round_id text,
  p_hole_number integer,
  p_par integer,
  p_stroke_index integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round record;
  v_old jsonb;
  v_prev_par integer;
  v_prev_si integer;
  v_hole_count integer;
  v_swapped integer;
  v_holes jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found';
  end if;
  if v_round.user_id <> auth.uid() and not public.is_admin_caller() then
    raise exception 'Only the organizer can correct the card';
  end if;
  if v_round.course_snapshot is null or v_round.course_snapshot->'holes' is null then
    raise exception 'This round has no course card';
  end if;

  select h into v_old
  from jsonb_array_elements(v_round.course_snapshot->'holes') h
  where (h->>'number')::int = p_hole_number;
  if v_old is null then
    raise exception 'No hole % on this card', p_hole_number;
  end if;

  v_hole_count := jsonb_array_length(v_round.course_snapshot->'holes');
  if p_par < 3 or p_par > 6 then
    raise exception 'Par must be 3 to 6';
  end if;
  if p_stroke_index < 1 or p_stroke_index > v_hole_count then
    raise exception 'Stroke index must be 1 to %', v_hole_count;
  end if;

  v_prev_par := (v_old->>'par')::int;
  v_prev_si := (v_old->>'strokeIndex')::int;

  -- Stroke indexes stay unique: the hole that held the new index takes the
  -- old one, which is how a scorecard swap works on paper.
  select (h->>'number')::int into v_swapped
  from jsonb_array_elements(v_round.course_snapshot->'holes') h
  where (h->>'strokeIndex')::int = p_stroke_index
    and (h->>'number')::int <> p_hole_number
  limit 1;

  select jsonb_agg(
    case
      when (h->>'number')::int = p_hole_number
        then h || jsonb_build_object('par', p_par, 'strokeIndex', p_stroke_index)
      when v_swapped is not null and (h->>'number')::int = v_swapped
        then h || jsonb_build_object('strokeIndex', v_prev_si)
      else h
    end
    order by (h->>'number')::int
  )
  into v_holes
  from jsonb_array_elements(v_round.course_snapshot->'holes') h;

  update public.rounds
  set course_snapshot = jsonb_set(course_snapshot, '{holes}', v_holes)
  where id = p_round_id;

  insert into public.course_overrides
    (round_id, hole_number, par, stroke_index, previous_par, previous_stroke_index, reason, created_by)
  values
    (p_round_id, p_hole_number, p_par, p_stroke_index, v_prev_par, v_prev_si, nullif(trim(coalesce(p_reason, '')), ''), auth.uid())
  on conflict (round_id, hole_number) do update
    set par = excluded.par,
        stroke_index = excluded.stroke_index,
        reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = now(),
        reviewed_at = null,
        reviewed_by = null;

  return jsonb_build_object(
    'hole', p_hole_number,
    'par', p_par,
    'stroke_index', p_stroke_index,
    'previous_par', v_prev_par,
    'previous_stroke_index', v_prev_si,
    'swapped_hole', v_swapped
  );
end;
$$;

-- Admin: mark a correction reviewed. Logged like every admin action.
create or replace function public.admin_review_course_override(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_caller() then
    raise exception 'Not authorized';
  end if;
  update public.course_overrides
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_id;
  if not found then
    raise exception 'No such correction';
  end if;
  perform public.log_admin_action('review_course_override', 'course_override', p_id::text, null, '{}'::jsonb);
end;
$$;

commit;
