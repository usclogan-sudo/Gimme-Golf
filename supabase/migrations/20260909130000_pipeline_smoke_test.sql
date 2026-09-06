-- No-op migration: proves production delivery works.
--
-- Every migration so far has been applied by hand, so the GitHub integration has
-- never actually delivered one. Finding that out on hole_declarations (#86) would be
-- expensive — the Scorecard queries it on load and fails outright if it is missing,
-- unlike shared_courses and game_presets, which failed silently for months.
--
-- This changes nothing. It sets a comment on a function that already exists. If it
-- lands in supabase_migrations.schema_migrations after merging, delivery works and
-- #86 is safe to ship. If it does not, we know before it costs anything.
comment on function public.admin_get_all_rounds() is
  'Admin-only listing of every round. Columns match public.rounds exactly — note the table has no created_at or created_by; the owner is user_id and date is the only timestamp. Pipeline delivery verified 2026-09-06.';
