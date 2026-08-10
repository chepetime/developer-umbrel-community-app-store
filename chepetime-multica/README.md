# Multica

An issue tracker whose assignees can be coding agents. Pinned at `v0.4.22`
(upstream's own GHCR images).

## This app is only the server

Multica has two halves:

| Half | Runs where | This app |
| ---- | ---------- | -------- |
| Server — API, web UI, PostgreSQL | anywhere | **yes** |
| Agent daemon — runs the agent CLIs | the machine with your code | **no** |

The daemon executes tasks by shelling out to `claude`, `codex`,
`cursor-agent` and friends inside a checkout of your repository. It needs your
code, your git credentials and your authenticated agent CLIs, none of which
are on this Umbrel. Assign an issue with no daemon connected and nothing
happens.

## First sign-in

1. Open `http://umbrel.local:46258` and enter an email address. Any address
   works — it is an identifier, not a delivery target, until you configure
   SMTP.
2. No mail backend is configured, so the six-digit code is printed to the
   backend log instead of being sent:

   ```bash
   ssh umbrel
   sudo docker logs chepetime-multica_backend_1 --tail 50 | grep DEV
   ```

   It expires in ten minutes.
3. The first account creates the workspace.

To get codes by email instead, set `SMTP_HOST` (plus `SMTP_PORT`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS`) or `RESEND_API_KEY` in
`docker-compose.yml` and restart.

Anyone on your LAN can reach the sign-up endpoint, because the API bypasses
Umbrel's login (see below) — but they cannot finish sign-up without reading
this log. Once your own account exists, close the door by adding
`ALLOW_SIGNUP: "false"` to the backend environment.

## Connecting the daemon

On the machine that has your repositories:

```bash
brew install multica-ai/tap/multica
multica setup self-host --server-url http://umbrel.local:46258 \
                        --app-url    http://umbrel.local:46258
multica daemon status
```

Both URLs are the same here — the gateway serves the UI and the API on one
origin. The daemon appears under **Settings → Runtimes**.

## Why there is a gateway container

Umbrel's `app_proxy` forwards to a single `APP_HOST`/`APP_PORT`. Multica needs
two upstreams:

- the Next.js frontend on `:3000`, which proxies `/api`, `/auth` and
  `/uploads` to the backend through its own rewrites;
- the Go backend on `:8080`, for the WebSocket endpoints — **Next.js rewrites
  forward HTTP only and drop the `Upgrade` handshake.**

So `hooks/nginx.conf` sends exactly four paths to the backend and leaves
everything else on upstream's tested path:

| Path | Why it cannot go through Next.js |
| ---- | -------------------------------- |
| `/ws` | browser realtime; the rewrite drops the `Upgrade` handshake |
| `/api/daemon/ws` | the daemon's control channel, same reason |
| `/health` | not in the rewrite list at all — `multica setup self-host` probes it and reports "not reachable" on a 404 |
| `/healthz` | same, for readiness |

Without the gateway the UI loads and then loops
`disconnected, reconnecting in 3s`.

The config lives in `hooks/` because an Umbrel app **update** copies only
`docker-compose.yml`, `*.template`, `exports.sh`, `torrc` and `hooks` — a file
anywhere else is frozen at whatever the first install wrote, and fixing it
would mean an uninstall, which deletes the database.

The rewrites are Next.js `afterFiles` rewrites, meaning real pages win over
them. That is why `/auth/*` is **not** routed to the backend here:
`/auth/callback` is a frontend page, and hijacking it would break Google
sign-in.

## Reaching it at another address

The backend checks the WebSocket `Origin` header. Three things can satisfy it,
in this order:

1. the `Host` the gateway forwards (`$http_host`, port included — `$host`
   would strip the port and fail);
2. `X-Forwarded-Host`, trusted because `MULTICA_TRUSTED_PROXIES` covers
   `10.21.0.0/16`, Umbrel's app network;
3. the explicit `CORS_ALLOWED_ORIGINS` list.

Because of (2), a browser arriving on a Tailscale name or a tunnel hostname is
already accepted without editing anything. If realtime does stop working, look
for `ws: rejected origin` in the backend log and add that exact origin to
`CORS_ALLOWED_ORIGINS`.

## Running it over https through a tunnel

The committed configuration is LAN-only on purpose — no hostname of yours
belongs in a public store repo. Two things change when you put a tunnel in
front of it.

**Point the tunnel at the gateway, not at the published port.** A tunnel to
`umbrel.local:46258` lands on Umbrel's `app_proxy`, whose login redirects to
the Umbrel dashboard on a different origin and does not survive the trip. If
`cloudflared` runs as an Umbrel app it is already on `umbrel_main_network`, so
give it the container directly:

```yaml
# cloudflared ingress
- hostname: multica.example.com
  service: http://chepetime-multica_gateway_1:80
```

That skips Umbrel's login entirely and leaves Multica's own auth — email code,
session cookie, CSRF token, `mul_` tokens — as the only wall, which is what
upstream expects of a public instance. Before doing this, make sure your
account exists and then set `ALLOW_SIGNUP: "false"` on the backend.

**Then commit to one primary origin.** On the host:

```bash
ssh umbrel
# ~/umbrel/app-data/chepetime-multica/docker-compose.yml, backend environment:
#   FRONTEND_ORIGIN:      https://multica.example.com
#   MULTICA_APP_URL:      https://multica.example.com
#   MULTICA_PUBLIC_URL:   https://multica.example.com   # absolute webhook URLs
#   CORS_ALLOWED_ORIGINS: https://multica.example.com,http://umbrel.local:46258
umbreld client apps.restart.mutate --appId chepetime-multica
```

The trade-off is in `FRONTEND_ORIGIN` alone: an `https` value makes session
cookies `Secure`, and a `Secure` cookie is dropped by the browser on a
plain-http page — so LAN access at `http://umbrel.local:46258` stops being
able to log in. Leave it `http` and both addresses work, with the cookie
merely unflagged. Pick whichever address you actually use.

These edits live in `app-data` and are overwritten by `rsync` on the next app
update. Keep a copy; there is no supported override file.

## The API bypasses Umbrel's login

`PROXY_AUTH_WHITELIST` covers `/api/*` and `/ws`, because the CLI and the
daemon authenticate with a `mul_` personal access token over
`Authorization: Bearer` and have no Umbrel session cookie.

The API is therefore reachable from the LAN with only Multica's own auth in
front of it. Every route outside `/api/auth` requires a valid token or
session, so this is not an open door — but it is a smaller wall than Umbrel's.
The web UI itself stays behind Umbrel's login.

## secrets.env

Settings that must not be published, and must survive updates, go in a file
the store never ships:

```bash
ssh umbrel
umask 077
cd ~/umbrel/app-data/chepetime-multica
printf 'MULTICA_VCS_SECRET_KEY=%s\n' "$(openssl rand -base64 32)" > secrets.env
umbreld client apps.restart.mutate --appId chepetime-multica
```

The backend reads it via `env_file` with `required: false`, so the app still
starts when it does not exist. It is the only file here that survives both a
fresh install (rsync copies the app template, and this is not in it) and an
update (which copies a whitelist, and this is not in that either).

| Key | Effect |
| --- | ------ |
| `MULTICA_VCS_SECRET_KEY` | enables self-hosted Git providers — Forgejo, Gitea, GitLab. Must be **exactly 32 bytes, base64-encoded**; `secretbox.LoadKey` rejects anything else, which is why it cannot be derived from `APP_SEED`. Until it is set, "Connect a provider instance" reports *Git provider integration is not configured on this server*. GitHub needs none of this. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS` | login codes get emailed instead of printed to the backend log. Also makes workspace invitations work |
| `RESEND_API_KEY` | same, via Resend instead of SMTP |
| `ALLOW_SIGNUP=false` | close signup once your account exists |
| `FRONTEND_ORIGIN`, `MULTICA_APP_URL`, `MULTICA_PUBLIC_URL`, `CORS_ALLOWED_ORIGINS` | the address this install is actually reached at — see below |

**A variable set under `environment:` in `docker-compose.yml` beats the same
variable here, silently.** So this file can only supply keys the compose file
does not declare, which is why the four address variables are deliberately
absent from it.

### The address variables

Unset, the app still works on any hostname for everything resolved per
request — the gateway forwards the browser's `Host` and the backend trusts
`X-Forwarded-Host`, so realtime connects and cookies stay non-`Secure` so they
survive plain http. What breaks is anything needing an absolute URL from
config: **invitation email links**, the daemon setup command shown in the UI,
and autopilot webhook URLs.

If you reach this app at anything other than `http://umbrel.local:46258`:

```bash
FRONTEND_ORIGIN=https://multica.example.com
MULTICA_APP_URL=https://multica.example.com
MULTICA_PUBLIC_URL=https://multica.example.com
CORS_ALLOWED_ORIGINS=https://multica.example.com,http://umbrel.local:46258
```

`FRONTEND_ORIGIN`'s **scheme** is load-bearing: `https` makes session cookies
`Secure`, and a `Secure` cookie is dropped by the browser on a plain-http
page — so once it is set to https, logging in at the LAN address stops
working. Listing the LAN origin in `CORS_ALLOWED_ORIGINS` keeps realtime
working there, but the login itself follows the scheme.

## Not wired up

**S3 attachment storage, Slack, Lark and WeCom bots** are all left unset. See
upstream's `.env.example`; their keys can go in `secrets.env` too.

## Data

```text
${APP_DATA_DIR}/postgres    everything: issues, runs, logs, tokens
${APP_DATA_DIR}/uploads     attachments and avatars
```

Both are bind mounts and survive updates. The `postgres` directory is the
whole application state — back it up before touching the pin.

## Updating

No build step. Check upstream's releases, then update the tag *and* its
multi-arch index digest for **both** images:

```bash
docker buildx imagetools inspect ghcr.io/multica-ai/multica-backend:vX.Y.Z \
  --format '{{.Manifest.Digest}}'
docker buildx imagetools inspect ghcr.io/multica-ai/multica-web:vX.Y.Z \
  --format '{{.Manifest.Digest}}'
```

Keep the two on the same tag — they share a release and the frontend talks to
the backend's API surface. Then bump `version` and `releaseNotes` in
`umbrel-app.yml`.

Upstream releases fast (v0.4.18 through v0.4.22 inside a week), so a fresh tag
has had little soak time. `v0.4.21` is the previous release if one misbehaves.
