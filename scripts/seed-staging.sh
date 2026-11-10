#!/usr/bin/env bash
# Seed a staging or local database with supabase/seed.sql.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.STAGING_REF.supabase.co:5432/postgres' npm run seed:staging
#
# The seed is idempotent, so running it again on a database that already holds
# the rows changes nothing. Refuses to run against production.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_staging-guard.sh
source "$SCRIPT_DIR/_staging-guard.sh"

require_staging_url
require_psql

echo "Seeding $(describe_target) ..."
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 --quiet --file "$SCRIPT_DIR/../supabase/seed.sql"
echo "Seed complete. Sign in as organizer@example.com, joiner@example.com or admin@example.com with password staging-pass-123."
