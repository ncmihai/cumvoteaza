#!/usr/bin/env bash
# Identity and group-history repair (docs/PLAN.md Phase 2, D1/D10/D11).
# Runs the full, ordered repair against the database in DATABASE_URL. Rehearse on a Neon branch first.
# Inputs: data/cdep-history/parsed/profiles.jsonl re-parsed with `python3 tools/cdep-history-probe/cdep_history_probe.py reparse`.
set -euo pipefail

# Usage: tools/identity-repair/run.sh --env-file .env --confirm-host <db host>
#    or: DATABASE_URL=... CONFIRM_HOST=<db host> tools/identity-repair/run.sh
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
if [ "${CONFIRM_HOST:-}" != "$host" ]; then
  echo "Refusing to run: pass --confirm-host $host to confirm this is the intended database." >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
log_dir="data/imports/identity-repair-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$log_dir"
step() { echo; echo "== $1"; }

step "0/7 snapshot public profile URLs"
npm run --silent ingest:urls:snapshot -- --file="$PWD/$log_dir/0-urls-before.txt" | tee "$log_dir/0-urls.log"

step "1/7 migrations"
npm run db:migrate >"$log_dir/1-migrate.log" 2>&1

step "2/7 CDEP profiles: mandates, dated groups/parties, career links (all legislatures)"
for year in 1990 1992 1996 2000 2004 2008 2012 2016 2020 2024; do
  npm run --silent ingest:cdep-history:import -- --legislature="$year" --persist >"$log_dir/2-cdep-$year.log" 2>&1
  echo "   $year ok"
done

step "3/7 identity: people from official evidence"
npm run --silent ingest:identity:resolve -- --persist | tee "$log_dir/3-identity.log" | grep -E '"changes"|"peopleAfter"|"review"'

step "4/7 one member per mandate: re-attribute votes, merge duplicates, remove unreferenced"
npm run --silent ingest:identity:merge-members -- --persist | tee "$log_dir/4-merge.log" | grep -E 'reattributed|merges|deletions|unresolved'

step "5/7 identity again (must change nothing; removes people orphaned by step 4)"
npm run --silent ingest:identity:resolve -- --persist | tee "$log_dir/5-identity.log" | grep -E '"changes"|"peopleAfter"'

step "6/7 read models"
npm run --silent ingest:refresh-read-models >"$log_dir/6-read-models.log" 2>&1

step "7/7 integrity checks (blocking) and URL continuity"
npm run --silent ingest:integrity:check | tee "$log_dir/7-integrity.log"
npm run --silent ingest:urls:check -- --file="$PWD/$log_dir/0-urls-before.txt" | tee "$log_dir/7-urls.log"
grep -q '"broken": 0' "$log_dir/7-urls.log" || { echo "Some public profile URLs no longer resolve (see 7-urls.log)." >&2; exit 1; }
echo; echo "Done. Logs: $log_dir"
echo "Next: deploy the matching code, then refresh the site's data cache: npm run ingest:site:revalidate"
