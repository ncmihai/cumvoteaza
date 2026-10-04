#!/usr/bin/env bash
# D19: re-imports CDEP profiles for every legislature (committee dates and roles, one source per committee),
# refreshes read models and runs the integrity checks. Logs every step to data/imports/ and prints the tail of a failure.
# Usage: tools/identity-repair/reimport-committees.sh --env-file .env --confirm-host <db host>
# `.env` is the Neon dev branch: rehearse there as often as needed. For production use `--env-file .env.production`;
# the CLI guard then refuses unless the owner sets ALLOW_PRODUCTION=1 on purpose (agents never do).
set -uo pipefail
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) DATABASE_URL="$(grep '^DATABASE_URL=' "$2" | cut -d= -f2- | sed 's/^"//;s/"$//')"; export DATABASE_URL; shift 2 ;;
    --confirm-host) CONFIRM_HOST="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done
: "${DATABASE_URL:?Set DATABASE_URL or pass --env-file}"
host="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*@([^/:?]+).*#\1#')"
echo "Target database host: $host"
[ "${CONFIRM_HOST:-}" = "$host" ] || { echo "Refusing to run: pass --confirm-host $host" >&2; exit 1; }

cd "$(dirname "$0")/../.."
log_dir="data/imports/reimport-committees-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$log_dir"
failed=0
run() { # name, command...
  local name="$1"; shift
  if "$@" >"$log_dir/$name.log" 2>&1; then echo "   $name ok"; else echo "   $name FAILED (full log: $log_dir/$name.log)"; tail -n 12 "$log_dir/$name.log" | sed 's/^/      /'; failed=1; fi
}
for year in 1990 1992 1996 2000 2004 2008 2012 2016 2020 2024; do
  run "cdep-$year" npm run --silent ingest:cdep-history:import -- --legislature="$year" --persist
done
run refresh-read-models npm run --silent ingest:refresh-read-models
run integrity npm run --silent ingest:integrity:check
echo; grep -E "^(FAIL|WARN)" "$log_dir/integrity.log" || echo "All integrity checks pass."
[ "$failed" = 0 ] && echo "Done. Logs: $log_dir" || { echo "Some steps failed. Logs: $log_dir"; exit 1; }
