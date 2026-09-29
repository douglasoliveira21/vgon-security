#!/bin/sh
set -e

# An override command (e.g. the standalone event worker, see docker-compose.dev.yml's `worker`
# service and EASYPANEL.md) skips migrations — those only need to run once, from the API
# container — and just execs whatever was passed.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

echo "[vgon-api] applying database migrations..."
npx prisma migrate deploy

echo "[vgon-api] starting server..."
exec node dist/main.js
