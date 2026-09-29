#!/bin/sh
set -e

# An override command (e.g. the standalone event worker, see docker-compose.dev.yml's `worker`
# service and EASYPANEL.md) skips migrations — those only need to run once, from the API
# container — and just execs whatever was passed.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

BASELINE_MIGRATION="20260101000000_init"
MIGRATE_LOG="/tmp/migrate-deploy.log"

echo "[vgon-api] applying database migrations..."
# No `| tee` / pipefail here (busybox ash's pipefail support isn't reliable across Alpine
# versions) — redirect to a file instead so the exit code below is unambiguously prisma's own.
if npx prisma migrate deploy >"$MIGRATE_LOG" 2>&1; then
    cat "$MIGRATE_LOG"
else
    cat "$MIGRATE_LOG"
    # This project's first migration ever committed was a baseline covering the whole schema,
    # but some existing deployments already had that schema (created earlier via `prisma db
    # push`, before any migration existed). The baseline SQL is written to be safe to re-run
    # against such a database (IF NOT EXISTS / duplicate_object-tolerant), but Prisma still
    # refuses to even attempt a migration it previously recorded as failed (P3009) — so if that's
    # what happened, clear the failed record and retry once, automatically, with no manual step.
    if grep -q "P3009" "$MIGRATE_LOG" && grep -q "$BASELINE_MIGRATION" "$MIGRATE_LOG"; then
        echo "[vgon-api] baseline migration was previously marked failed (likely applied against a database that already had this schema) — clearing it and retrying..."
        npx prisma migrate resolve --rolled-back "$BASELINE_MIGRATION"
        npx prisma migrate deploy
    else
        exit 1
    fi
fi

echo "[vgon-api] starting server..."
exec node dist/main.js
