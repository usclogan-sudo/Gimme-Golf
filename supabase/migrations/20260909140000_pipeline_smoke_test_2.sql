-- Second no-op delivery test.
--
-- The first (20260909130000) merged before the integration's production toggle was
-- saved, so it was never picked up — the settings do not apply retroactively. This
-- one runs with the toggle confirmed on.
--
-- Changes nothing: sets a comment on a function that already exists. Its appearance
-- in supabase_migrations.schema_migrations is the whole point.
comment on function public.admin_round_overview(text) is
  'Admin round panel read model. Delivery pipeline verified 2026-09-06.';
