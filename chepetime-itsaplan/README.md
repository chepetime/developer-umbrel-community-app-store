# It's a Plan

Self-hosted issue tracker with AI agents as assignees
([itsaplan.dev](https://itsaplan.dev), AGPL-3.0). Pinned at `1.10.0`, the
images upstream publishes to GHCR on each release.

## It needs https

With `NODE_ENV=production` the session cookie is `Secure`, and browsers do
not keep a `Secure` cookie that arrives over plain http. On
`http://umbrel.local:36263` the sign-in request succeeds and you stay signed
out. The LAN port is only good for checking that the app started.

Expose it over https, pointed at the gateway container rather than the
Umbrel port (a tunnel to the port lands on Umbrel's login, which does not
survive the trip):

```text
https://plan.example.com  ->  http://chepetime-itsaplan_gateway_1:80
```

Then tell the app its address. On the Umbrel:

```bash
umask 077
cd ~/umbrel/app-data/chepetime-itsaplan
cat > secrets.env <<'ENV'
APP_URL=https://plan.example.com
API_URL=https://plan.example.com/api
ENV
umbreld client apps.restart.mutate --appId chepetime-itsaplan
```

`API_URL` is always `APP_URL` plus `/api`: the gateway sends that path to the
api and everything else to the web app. Only one address works at a time —
CORS, passkeys and cookies are bound to `APP_URL`.

Reaching the gateway directly skips Umbrel's login, which is fine because
the app has its own accounts. **The first account registered becomes the
instance admin**, so register before sharing the address, then set
registration to invite-only or closed in god mode.

## Layout

| Service        | Role                                                    |
| -------------- | ------------------------------------------------------- |
| `gateway`      | nginx; `/api/*` to the api, the rest to web             |
| `web`          | Next.js UI                                              |
| `api`          | REST API, auth, MCP server, agent runs                  |
| `worker`       | webhooks, notifications, schedules                      |
| `bot`          | Telegram bot; idle until a token is saved in god mode   |
| `postgres`     | Postgres 17                                             |
| `rustfs`       | S3-compatible attachment store                          |
| `migrate`      | one-shot: dumps the database, applies migrations, exits |
| `rustfs-init`  | one-shot: creates the attachments bucket, exits         |

State lives under `data/`: `postgres/`, `rustfs/` (attachments) and
`backups/` (the dump `migrate` takes before applying a release's migrations,
kept 30 days).

Secrets are derived per install: the database and object-store passwords from
`APP_PASSWORD`, the auth secret and the credential-encryption key from
`APP_SEED`. Nothing secret is in this repository.

## Other settings

`secrets.env` takes any variable from upstream's
[`.env.example`](https://github.com/croffasia/itsaplan/blob/main/.env.example)
that is not set under `environment:` in `docker-compose.yml` (those win over
env files and cannot be overridden). Useful ones:

- `CLIENT_IP_HEADER=cf-connecting-ip` behind Cloudflare, so the sign-in rate
  limit sees real client addresses.
- `SSRF_ALLOWED_HOSTS=git.lan` to connect a Gitea/Forgejo on your network.
- `PRIVACY_URL`, `TERMS_URL` for the logged-out screens.
- `TELEMETRY_DISABLED=0` to turn upstream's anonymous telemetry back on.

Mail, SSO, AI provider keys and the Telegram bot token are set in the web UI,
not here.

## MCP and API clients

`/api/*` and the OAuth discovery documents are whitelisted past Umbrel's
login, because CLI and MCP clients have no Umbrel session. They are still
behind the app's own auth. MCP OAuth sign-in needs an https `API_URL`; over
http, MCP clients use personal API keys only.
