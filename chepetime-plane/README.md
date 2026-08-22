# Plane

Open-source project management — issues, cycles, modules. Pinned at `v1.4.1`
(upstream's own Docker Hub images), packaged from upstream's official
self-host `docker-compose.yml`
(https://developers.plane.so/self-hosting/methods/docker-compose).

Thirteen containers: `web` (Next.js app), `space` (public read-only views),
`admin` (the "god-mode" instance-admin panel), `live` (realtime/WebSocket),
`api` + `worker` + `beat-worker` + a one-shot `migrator` (all the same Django
image, different entrypoints), `plane-db` (Postgres), `plane-redis`
(Valkey), `plane-mq` (RabbitMQ), `plane-minio` (S3-compatible storage) and
`proxy` (Caddy, fronting all of it). This is by far the heaviest app in this
store — budget the RAM for it.

## First sign-in

1. Open `http://umbrel.local:46259` and sign up with an email and password.
   No SMTP is configured, but this app's sign-up flow does not require a
   verification email — `create_instance_admin` (the command that promotes a
   user to instance admin, below) only requires the `User` row to already
   exist. **This is inferred from upstream's source, not yet confirmed
   against a live install** — if sign-up unexpectedly tries to send mail and
   fails, that's the first thing to check.
2. Promote your account to instance admin:

   ```bash
   ssh umbrel
   sudo docker exec chepetime-plane_api_1 python manage.py create_instance_admin you@example.com
   ```
3. Visit `/god-mode` to finish instance setup and, optionally, add SMTP
   credentials — without them, workspace invitations and notifications fail
   silently rather than send anything.

## Why there is no extra gateway container

Unlike Multica, Plane's own `proxy` container (Caddy) already reverse-proxies
everything — `web`, `space`, `admin`, `live` (WebSocket, upgrade handled
natively by Caddy) and `api` — behind one origin. `app_proxy` points straight
at it (`chepetime-plane_proxy_1:80`); no second gateway was needed.

Its baked-in Caddyfile targets bare service names (`web`, `space`, ...)
though, which is only safe on upstream's own compose where those names are
scoped to one project. Every Umbrel app shares one Docker network, so a bare
name can resolve to an unrelated app's container — confirmed live, `web`
resolved to a different installed app entirely and Plane silently served its
UI instead. `hooks/Caddyfile` replaces it with fully-qualified targets,
mounted over `/etc/caddy/Caddyfile`.

## File storage (MinIO)

Attachments and avatars live in the bundled `plane-minio`, not on any
container's filesystem. Plane hands the *browser* presigned URLs to download
them directly, which would normally mean MinIO's endpoint has to be
browser-reachable — but Caddy's config
(`apps/proxy/Caddyfile.ce` upstream) already routes `/{bucket}/*` to
`plane-minio` through the same origin as everything else, so this works out
of the box with no extra configuration.

To use an external S3-compatible bucket instead, set `AWS_S3_ENDPOINT_URL`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_S3_BUCKET_NAME` in
`secrets.env` (below), drop `USE_MINIO`, and comment out the `plane-minio`
service.

`AWS_S3_ENDPOINT_URL` points at `chepetime-plane-plane-minio`, not the
container's real name (`chepetime-plane_plane-minio_1`) — boto3 rejects
hostnames with underscores outright, so the real name 500s every action
that touches file storage, sign-up included. The hyphen-only name is a
second network alias for the exact same container (`plane-minio`'s
`networks.default.aliases` in the compose file); do not "simplify" it back.

### The MinIO image pin

MinIO stopped publishing new community builds to Docker Hub after
`RELEASE.2025-09-07T16-13-09Z` — their well-known move away from free
rolling releases toward the commercial AIStor product. That tag is genuinely
the newest one there, and it's confirmed multi-arch (amd64+arm64+ppc64le). A
security-hotfixed rebuild of that same release exists at
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z.hotfix.7aa24e772` (patched
as recently as April 2026) — but it's **amd64-only**. Only switch to it if
this box is confirmed x86; on arm64 it would brick the app the same way
Threadfin's `latest` tag does.

## The API bypasses Umbrel's login

`PROXY_AUTH_WHITELIST` covers `/api/*`, because Plane's workspace-level API
keys authenticate integrations with `Authorization: Bearer` and no Umbrel
session cookie — same reasoning as Multica's `mul_` tokens. The API is
therefore reachable from the LAN with only Plane's own auth in front of it.
The web UI itself stays behind Umbrel's login.

## WEB_URL and CORS_ALLOWED_ORIGINS

Unlike Multica's address variables, these two **cannot be left unset** —
Plane's own `plane.utils.host.base_host()` does
`settings.WEB_URL or settings.APP_BASE_URL` with no None-safety, and crashes
sign-up and sign-in outright (`ImproperlyConfigured` or, on some builds,
`'NoneType' object has no attribute 'rstrip'`) the instant both are unset.
They default here to `http://umbrel.local:46259` — not secret, just the
generic default LAN address, safe to publish. If you reach this install at
a different address (a tunnel, a different port), hand-edit these two
values directly in `~/umbrel/app-data/chepetime-plane/docker-compose.yml`
(they're under `x-app-env`, referenced by `api`/`worker`/`beat-worker`/
`migrator`) and restart — there is no separate override file for them, the
way there is for Multica's `secrets.env`, since the value isn't sensitive
enough to warrant keeping it out of the compose file.

## Reaching it over https through a tunnel

The committed configuration is LAN-only on purpose — no hostname of yours
belongs in a public store repo.

**Point the tunnel at the proxy container, not at the published port.** A
tunnel to `umbrel.local:46259` lands on Umbrel's `app_proxy`, whose login
redirects to the Umbrel dashboard on a different origin and does not survive
the trip.

```yaml
# cloudflared ingress
- hostname: plane.example.com
  service: http://chepetime-plane_proxy_1:80
```

Then set `WEB_URL`/`CORS_ALLOWED_ORIGINS` as above and restart.

## Data

```text
${APP_DATA_DIR}/postgres        issues, cycles, modules, everything relational
${APP_DATA_DIR}/redis           Valkey — cache + realtime pub-sub, persisted
${APP_DATA_DIR}/rabbitmq        Celery broker state
${APP_DATA_DIR}/uploads         attachments and avatars (MinIO's /export)
${APP_DATA_DIR}/proxy/config    Caddy's own runtime config
${APP_DATA_DIR}/proxy/data      Caddy's on-disk state (autosave, certs if ever enabled)
${APP_DATA_DIR}/logs/*          per-service Django/Celery logs
```

All bind mounts, all survive updates. `postgres` and `uploads` together are
the whole application state — back both up before touching an image pin.

## Updating

No build step, but there are seven image families to keep in step:

```bash
for repo in plane-frontend plane-space plane-admin plane-live plane-backend plane-proxy; do
  docker buildx imagetools inspect makeplane/$repo:vX.Y.Z --format '{{.Manifest.Digest}}'
done
```

All six Plane images move together — they share a release. `plane-backend`
is used four times (`api`, `worker`, `beat-worker`, `migrator`); move all
four together too. Postgres, Valkey, RabbitMQ and MinIO are pinned
independently and only need to move when there's a real reason to (a data
directory migration, in Postgres/Valkey/RabbitMQ's case) —
`scripts/check-image-updates.ts` treats all four as `digest`-only for
exactly that reason and will never suggest crossing a major on its own.

Then bump `version` and `releaseNotes` in `umbrel-app.yml`.
