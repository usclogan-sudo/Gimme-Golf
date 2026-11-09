# Shared guard for the staging scripts. Sourced, not executed.
#
# Both scripts take the database connection string from SUPABASE_DB_URL. The
# production project ref is hardcoded here on purpose: a connection string that
# contains it is refused before anything runs, whatever else the URL says.

PRODUCTION_PROJECT_REF="dbtphtdzblwphpuwodea"

require_staging_url() {
  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "SUPABASE_DB_URL is not set." >&2
    echo "Set it to the staging database connection string, for example:" >&2
    echo "  export SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.STAGING_REF.supabase.co:5432/postgres'" >&2
    echo "Find it in the Supabase dashboard for the STAGING project under Connect." >&2
    exit 2
  fi
  case "$SUPABASE_DB_URL" in
    *"$PRODUCTION_PROJECT_REF"*)
      echo "Refusing to run: SUPABASE_DB_URL points at the production project ($PRODUCTION_PROJECT_REF)." >&2
      echo "These scripts only ever run against staging or a local stack." >&2
      exit 3
      ;;
  esac
}

require_psql() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is not installed. On a Mac: brew install libpq && brew link --force libpq" >&2
    exit 4
  fi
}

describe_target() {
  # Host only, never the password.
  printf '%s' "$SUPABASE_DB_URL" | sed -E 's#^[a-z]+://[^@]*@##; s#/.*$##'
}
