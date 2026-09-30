# Deploying to EasyPanel

The API (`apps/api`), the event worker, and the dashboard (`apps/web`) are deployed as **three independent EasyPanel Apps** — the API and worker share the same Dockerfile/image, just with a different start command. None of them share a runtime — you can redeploy, restart or scale any one without touching the others, and the worker in particular can be scaled to N replicas independently of the API's replica count (Phase 8's horizontal-scaling target). Postgres and Redis run as managed EasyPanel services in the same Project so everything shares an internal Docker network.

## 1. Create the Postgres and Redis services

In your EasyPanel Project: **+ Service → Postgres** (template). Note the values it gives you:
- Internal hostname (service name, e.g. `postgres`)
- User / password / database name

You'll compose `DATABASE_URL` from these in step 2.

Also add **+ Service → Redis** (template) — Phase 2's event ingestion queue (BullMQ) needs it; note its internal hostname too (e.g. `redis`).

## 2. Create the API app (`vgon-api`)

**+ Service → App → From Git repository**, pointing at this repo.

| Setting | Value |
|---|---|
| Build method | Dockerfile |
| Dockerfile path | `apps/api/Dockerfile` |
| Build context | repo root (default — do **not** point it at `apps/api`, the Dockerfile needs the monorepo root to reach `packages/shared`) |
| Port | `4000` |
| Health check path | `/api/v1/health` |

Environment variables (Runtime, not Build Args — this app has no `NEXT_PUBLIC_*` style build-time vars):

```
DATABASE_URL=postgresql://<pg-user>:<pg-password>@<postgres-service-name>:5432/<pg-db>?schema=public
REDIS_URL=redis://<redis-service-name>:6379
JWT_ACCESS_SECRET=<generate with: openssl rand -base64 48>
AGENT_JWT_SECRET=<generate a DIFFERENT random value the same way>
WEB_ORIGIN=https://<web-app-domain>        # fill in after step 3, see note below
PORT=4000
```

Deploy it. On boot, `docker-entrypoint.sh` runs `prisma migrate deploy` automatically before starting the server — no manual migration step needed. Assign a domain (EasyPanel's generated `*.easypanel.host` subdomain is fine to start) and note its public URL; you need it for step 3.

## 3. Create the event worker app (`vgon-worker`)

Same repo, same Dockerfile as the API — this is Phase 8's horizontally-scalable event processor (`apps/api/src/worker.module.ts` / `main-worker.ts`), split out so a burst of Agent traffic can be absorbed by adding worker replicas without also scaling (and paying for) more HTTP API instances.

| Setting | Value |
|---|---|
| Build method | Dockerfile |
| Dockerfile path | `apps/api/Dockerfile` |
| Build context | repo root |
| Start command | `node dist/main-worker.js` (overrides `docker-entrypoint.sh`'s default, and skips the migration step — the API app already ran it) |
| Port | none — it has no HTTP server, don't assign a domain or health check path |

Environment variables: just `DATABASE_URL` and `REDIS_URL` (same values as the API app) — it needs no JWT secrets, since it never authenticates a request itself. Deploy it, and set its replica count independently in EasyPanel's scaling settings whenever event volume grows.

## 4. Create the web app (`vgon-web`)

Same repo, another **+ Service → App**.

| Setting | Value |
|---|---|
| Build method | Dockerfile |
| Dockerfile path | `apps/web/Dockerfile` |
| Build context | repo root |
| Port | `3000` |

**Build Args** (not Runtime env vars — this is the part people get wrong):

```
NEXT_PUBLIC_API_URL=https://<api-app-domain>/api/v1
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<your Turnstile site key>
```

Next.js inlines `NEXT_PUBLIC_*` variables into the browser bundle at build time. Setting it as a runtime environment variable does nothing — the already-built JavaScript won't see it. Use the **public** domain of the API app from step 2 (the browser calls this directly), never the internal service name (`vgon-api:4000` is not reachable from the visitor's browser).

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is optional — only set it if you want the Cloudflare Turnstile captcha on the login form; leave it unset to keep the login form exactly as it is today. If you do set it, also set the matching `TURNSTILE_SECRET_KEY` (a *Runtime* env var, not a build arg) on the **API** app — both come from the same Cloudflare Turnstile site.

Deploy it, then assign its own domain.

## 5. Close the loop on CORS

Now that the web app has a domain, go back to the **API app's environment variables** and set:

```
WEB_ORIGIN=https://<web-app-domain>
```

Redeploy the API app (a restart is enough — `WEB_ORIGIN` is read at runtime, unlike the web app's build arg).

## 6. Seed initial data (optional, once)

Open the API app's **Console/Terminal** in EasyPanel and run:

```bash
cd apps/api && npm run prisma:seed
```

This creates the `acme-demo` tenant with an OWNER and ANALYST login (see [README.md](README.md)). Skip this in a real deployment and use `POST /auth/register-tenant` instead to create your actual tenant.

## Gotchas specific to this split

- **Rebuild, not just redeploy, the web app** whenever `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_TURNSTILE_SITE_KEY` changes (e.g. you move the API to a custom domain, or turn the captcha on/off later) — both are baked into static assets. In EasyPanel this means triggering a new build, not just restarting the running container.
- The web app and the API never talk to each other directly; the browser is the only thing that calls the API (client components using `fetch`). So the API's `WEB_ORIGIN` (CORS) must exactly match the web app's public origin, and the web app's `NEXT_PUBLIC_API_URL` must be a URL the visitor's browser can reach — both are public URLs, not internal service names.
- The worker app talks to nothing but Postgres and Redis — it has no `WEB_ORIGIN`/CORS concern and no public domain at all.
- If you rotate `JWT_ACCESS_SECRET` or `AGENT_JWT_SECRET`, every logged-in user and every enrolled Agent is signed out / loses its access token simultaneously (refresh tokens for Agents still work since those aren't JWTs — the Agent will just get a new access token on its next `/agents/token/refresh` call). The worker app doesn't need either secret and is unaffected.
- If EasyPanel's Redis template sets a password, put it in the URL: `redis://:<password>@<redis-service-name>:6379`. `REDIS_URL` is parsed at boot in both the API and the worker, so a wrong value fails fast in the logs rather than silently dropping events.
- The API app still runs its *own* copy of the event processor too (importing `EventsModule` pulls in `EventsProcessor` regardless) — it's not purely HTTP-only. That's intentional: BullMQ workers on the same queue just share the load, so the API absorbs a baseline amount of processing and the dedicated `vgon-worker` app is what you scale up under load, without needing to also add more API replicas (and their JWT/CORS/HTTP overhead) just to process events faster.
- `docker-compose.dev.yml` in this repo is for **local development only** (it wires the same Dockerfiles together, including the `worker` service, with a build-arg default of `http://localhost:3000`/`:4000`); EasyPanel does not use it — each App's build config above is the source of truth in production.
