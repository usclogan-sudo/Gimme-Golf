#!/usr/bin/env bash
# Wipe every app table in a staging or local database, then reseed.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.STAGING_REF.supabase.co:5432/postgres' npm run reset:staging
#
# Tables are truncated children first so the order reads as the dependency
# graph; CASCADE is also set so a table added later cannot leave the reset
# half done. app_versions is config, not data, and is left alone. The seeded
# example.com accounts are removed from auth so the seed can recreate them.
# Refuses to run against production.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_staging-guard.sh
source "$SCRIPT_DIR/_staging-guard.sh"

require_staging_url
require_psql

echo "Resetting $(describe_target) ..."
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 --quiet <<'SQL'
begin;

truncate table
  -- leaves
  public.prop_wagers,
  public.prop_bets,
  public.side_bets,
  public.junk_records,
  public.bbb_points,
  public.hole_scores,
  public.settlements,
  public.buy_ins,
  public.notifications,
  public.invite_attempts,
  public.event_participants,
  public.round_participants,
  public.round_players,
  public.tournament_matchups,
  public.tournament_rounds,
  -- parents
  public.rounds,
  public.events,
  public.tournaments,
  public.courses,
  public.players,
  public.pinned_friends,
  public.push_subscriptions,
  public.notification_preferences,
  public.feedback_reports,
  public.admin_audit_log,
  public.game_presets,
  public.shared_courses,
  public.user_profiles
restart identity cascade;

delete from auth.users where email like '%@example.com';

commit;
SQL

echo "Tables cleared. Reseeding ..."
exec "$SCRIPT_DIR/seed-staging.sh"
