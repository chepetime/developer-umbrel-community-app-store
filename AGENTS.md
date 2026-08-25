# Repository Notes

This repository is an Umbrel Community App Store named `José Lugo`, displayed
in the Umbrel UI as "José Lugo App Store". The store `id` is `chepetime`.

It used to be `billow`, named after the only app that existed at the time.
That forced every later app to be prefixed `billow-` (see the rule below), so
an unrelated app briefly had to be called `billow-goose`. It was renamed to
`chepetime` so the prefix names the author rather than one of the apps.

Changing the store `id` makes Umbrel treat this as a different store: the old
one has to be removed and re-added, and any app installed from it keeps its
old app ID and data directory rather than migrating.

## Every app ID must start with the store ID

This is the single most important rule here, and breaking it fails silently.
umbreld filters the app list with
(`packages/umbreld/source/modules/apps/app-repository.ts`):

```ts
// Filter out invalid IDs
.filter((app) => meta.id === 'umbrel-app-store' || app.id.startsWith(meta.id))
```

The store `id` is `chepetime`, so **every app directory here must be named
`chepetime-…`**. An app whose ID does not match is dropped from the listing
with no error, no log line in the UI, and no visible difference from a store
that has not refreshed yet. Goose was first published as `goose`, was
invisible, and stayed invisible through a full remove-and-re-add of the store
before anyone read this filter.

The `name:` field is what users see (`Billow`, `Goose`), so the prefix never
appears in the UI — it shows up only in the app ID, the data directory and
container names.

Two more constraints that follow from the same file:

- The **directory name must equal the app ID**. `app-store.ts` resolves an
  app's files as `${repoPath}/${appId}`, so `chepetime-goose/` and
  `id: chepetime-goose` have to agree or installation fails.
- App IDs must match `/^[a-zA-Z0-9-_]+$/`.

Umbrel's own template store demonstrates the convention: store `id: sparkles`,
app directory `sparkles-hello-world`, `name: Hello World`.

Umbrel reads this repository as a store. It does not build app source from here.
Each app directory should contain only the Umbrel package files needed for
installation:

- `umbrel-app.yml`
- `docker-compose.yml`
- optional store-facing `README.md`
- static store assets, if needed

## Current Apps

- `chepetime-billow`: Billow, a personal invoices app. Host port `46247`.
- `chepetime-goose`: Goose, a copy of Billow renamed and restarted at `0.1.0`. Host port
  `46248`.
- `chepetime-netalertx`: NetAlertX, third-party LAN scanner. Host ports `20211`
  and `20212`, upstream's own, outside this store's `462xx` allocations.

Repackaged third-party apps, all behind `app_proxy` on allocated host ports:

| App           | ID                     | Port    |
| ------------- | ---------------------- | ------- |
| Tinyauth      | `chepetime-tinyauth`   | `46250` |
| Pocket ID     | `chepetime-pocket-id`  | `46251` |
| Tdarr         | `chepetime-tdarr`      | `46252` |
| Kapowarr      | `chepetime-kapowarr`   | `46253` |
| Threadfin     | `chepetime-threadfin`  | `46254` |
| SmokePing     | `chepetime-smokeping`  | `46255` |
| Maintainerr   | `chepetime-maintainerr`| `46256` |
| PairDrop      | `chepetime-pairdrop`   | `46257` |
| Multica       | `chepetime-multica`    | `46258` |
| Plane         | `chepetime-plane`      | `46259` |
| MiroTalk P2P  | `chepetime-mirotalk`   | `46260` |

Allocate the next free `462xx` for anything new, and check it is actually free
on the host (`ss -lntu`) before publishing — a taken port leaves
`<app-id>_app_proxy_1` stuck in `Created` with no useful error.

Goose is a full copy of the Billow tree, not a fork sharing history, and the two
are independent from here on: separate repositories, separate GHCR packages,
separate ports, separate databases. There is no migration path between them —
a Goose install starts empty. Source lives in:

```text
/Users/jose/Projects/personal/umbrel-goose
https://github.com/chepetime/umbrel-goose
```

Its image is `ghcr.io/chepetime/goose`. The package name deliberately does not
match the repository name (`umbrel-goose`); nothing requires it to.

The Billow app source now lives in:

```text
/Users/jlugo/Projects/personal/billow
```

Remote:

```text
https://github.com/chepetime/billow
```

The split is complete:

- Billow app repo initial commit: `3c9fc0d Initial Billow app`.
- Store cleanup commit: `fc89fe7 Move Billow source to app repo`.
- Billow publish workflow rerun `29778177872` completed successfully after the
  GHCR package was granted write access for `chepetime/billow`.

## Billow Store Contract

Keep the app ID stable for existing installs:

```yaml
id: chepetime-billow
```

The store package currently points at:

```yaml
image: ghcr.io/chepetime/billow:v0.1.4@sha256:bfa391fe44f619b6f9e9e6b658d8323513f393f8cf04f71ec42f52d8ca70281b
```

Keep the Postgres data path stable so image updates do not wipe user data:

```yaml
volumes:
  - ${APP_DATA_DIR}/postgres:/var/lib/postgresql/data
```

The current Umbrel host port is:

```yaml
port: 46247
```

Earlier installs failed because the template port `4000` was already allocated
on the Umbrel host, leaving `chepetime-billow_app_proxy_1` in `Created`.

## Updating Billow

1. Make app changes in `/Users/jlugo/Projects/personal/billow`.
2. Publish a new image tag from the Billow repo's
   `.github/workflows/publish.yml`.
3. Run `scripts/bump-billow.sh` to bump the version everywhere, commit, and
   push. It takes `patch` (default), `minor`, `major`, or an explicit `X.Y.Z`,
   plus optional `-n "release notes"`, `--no-push`, and `--dry-run`.
4. Refresh the alt store in Umbrel.

The script keeps the version in sync across `umbrel-app.yml`,
`docker-compose.yml`, `chepetime-billow/README.md`, and this file, and commits
as `Billow Release X.Y.Z`.

Before changing anything it queries GHCR and aborts if the target tag is not
published, since pointing the store at a missing tag is the most common install
failure. Pass `--skip-image-check` to bump ahead of the build. If GHCR cannot be
reached the check warns and continues rather than blocking.

Do not add the Billow Next.js source, `node_modules`, `.next`, Prisma generated
files, or Docker build workflow back into this store repo.

## Goose Store Contract

Same shape as Billow's, with its own values:

```yaml
id: chepetime-goose
port: 46248
image: ghcr.io/chepetime/goose:v0.1.0@sha256:266b8c54b46cdc52af913464edb14f297e3bb148e104483b8c4928150609bb0b
```

The Postgres data path is the same and stays unchanged for the same reason:

```yaml
volumes:
  - ${APP_DATA_DIR}/postgres:/var/lib/postgresql/data
```

Do not reuse port `46247`. It belongs to Billow, and both apps may be installed
on one host — a port already allocated leaves `chepetime-goose_app_proxy_1` stuck in
`Created` with no useful error.

## Updating Goose

1. Make app changes in `/Users/jose/Projects/personal/umbrel-goose`.
2. Publish a new image tag from that repo (`gh workflow run release.yml
   -f version=X.Y.Z`, or push a `vX.Y.Z` tag).
3. Update `chepetime-goose/docker-compose.yml` **and** the pin quoted above with the new
   tag *and* its multi-arch index digest:

   ```bash
   docker buildx imagetools inspect ghcr.io/chepetime/goose:vX.Y.Z \
     --format '{{.Manifest.Digest}}'
   ```

4. Bump `version` and `releaseNotes` in `chepetime-goose/umbrel-app.yml`.
5. Refresh the alt store in Umbrel.

`scripts/bump-billow.sh` is Billow-only — it hardcodes the app directory, the
image name and the commit subject. Goose is bumped by hand until someone
generalises it. Do not point it at Goose expecting it to work.

`gallery:` is **required**, and getting this wrong costs an afternoon. umbreld
validates every manifest with Zod
(`packages/umbreld/source/modules/apps/schema.ts`) and declares:

```ts
gallery: z.array(z.string()),   // note: no .optional()
```

Every other field that can be left out carries `.optional()`; `gallery` does
not. A manifest without it fails validation and umbreld **drops the app from
the store with no error at all** — the app simply never appears, which looks
identical to the store not having refreshed. Goose shipped without it once and
was invisible until the schema was read.

An empty array (`gallery: []`) validates, so a new app does not need
screenshots to be listed. Goose currently reuses Billow's screenshots, copied
into `chepetime-goose/gallery/` rather than linked to Billow's copies so that dropping
real captures in place is a straight file swap. They still show Billow's name
in the UI.

If an app is missing from the store, check the manifest against that schema
before assuming a caching problem.

## NetAlertX Store Contract

Not our app: this repackages the third-party image `jokobsk/netalertx`. There
is no source repo of ours and no release to publish — only the pin moves.

```yaml
id: chepetime-netalertx
port: 20211
image: jokobsk/netalertx:26.8.5@sha256:e8d800176d35a2fcc856ddc68c354a6b472e535c6ed42c52d040b715ca9bb127
```

Four things differ from the Billow/Goose shape. Each looks like a bug to
anyone who assumes that shape:

- **No `app_proxy` service.** The app runs `network_mode: host`, and the proxy
  only reaches containers on `umbrel_main_network`. Home Assistant in
  `getumbrel/umbrel-apps` omits it identically. The cost is that the UI has no
  Umbrel auth in front of it, so NetAlertX's own password must be turned on in
  Settings after install.
- **`sysctls` are deliberately absent.** Upstream's compose sets
  `net.ipv4.conf.all.arp_ignore=1` and `arp_announce=2`. Docker rejects any
  `net.*` sysctl on a host-network container — "sysctl ... is not allowed in
  host network mode" — so copying upstream's file verbatim prevents the
  container from starting. Do not "restore" them.
- **A narrow capability set, not `privileged`.** `cap_drop: ALL` then
  `NET_ADMIN`, `NET_RAW`, `NET_BIND_SERVICE`, `CHOWN`, `SETUID`, `SETGID`.
  The scanners need raw sockets; the entrypoint needs the last three to chown
  `/data` and drop to uid 20211.
- **`read_only: true` plus a `/tmp` tmpfs**, as upstream ships. Anything the
  app writes goes to `/data` or that tmpfs.

Ports `20211` (UI, REST) and `20212` (GraphQL) are upstream's, deliberately
outside this store's `462xx` range. Both were free on the host when packaged.

Keep the state path stable — losing it loses the whole device history:

```yaml
volumes:
  - ${APP_DATA_DIR}/data:/data
```

Never set `ALWAYS_FRESH_INSTALL: "true"`; it wipes config and database on
every start.

`gallery: []` is intentional for now. Upstream's screenshots are theirs;
replace with our own captures of a running instance.

## Updating NetAlertX

No build step. Check Docker Hub for a newer tag, then update the tag *and* its
multi-arch index digest in `chepetime-netalertx/docker-compose.yml` and in the
pin quoted above:

```bash
docker buildx imagetools inspect jokobsk/netalertx:X.Y.Z \
  --format '{{.Manifest.Digest}}'
```

Then bump `version` and `releaseNotes` in `chepetime-netalertx/umbrel-app.yml`.

Upstream releases roughly monthly on a `YY.M.P` scheme, so the tag is a date,
not semver. `26.8.5` was published the same day it was packaged here; if a
fresh release ever misbehaves, `26.7.1` is the previous known-good tag.

## Repackaged Third-Party Apps

Eight apps added on 2026-08-04 that are not ours: they repackage upstream
images, so there is nothing to build and only the pin moves. Each has its own
README with the setup detail. What is worth knowing at store level:

- **Every one is pinned by tag *and* multi-arch index digest.** Get the digest
  with `docker buildx imagetools inspect <image>:<tag> --format
  '{{.Manifest.Digest}}'`. It works without a running Docker daemon.
- **Media apps mount Umbrel's shared storage**, following the official Radarr
  package: `${UMBREL_ROOT}/data/storage/downloads` plus
  `permissions: [STORAGE_DOWNLOADS]` in the manifest. Tdarr, Kapowarr and
  Maintainerr all mount it at the same path the *arr apps use, or their
  library paths would not agree.
- **`PROXY_AUTH_WHITELIST` is load-bearing for three of them.** Threadfin's
  tuner endpoints, Pocket ID's OIDC discovery and Tinyauth's forward-auth API
  are all called by machines, not by a logged-in browser, and fail behind
  Umbrel's login. The cost is that those paths are unauthenticated on the LAN.
- **Use fully-qualified container names** when pointing one app at another
  (`radarr_server_1`, not `radarr`). Every Umbrel app shares one network, so
  bare service names collide across apps.

Two carry caveats big enough that they may never be usable as packaged, both
recorded in their descriptions so they show in the store listing:

- **Tinyauth** is forward-auth only. It protects nothing until a reverse proxy
  is added, and no store currently on this Umbrel has one. It also ships with
  an empty user list by design.
- **Pocket ID** needs https. Passkeys are WebAuthn, and browsers refuse to
  register one over `http://umbrel.local`. It needs Tailscale Serve or a
  tunnel in front before it can be used at all, and `APP_URL` must be set to
  that address *before* anyone enrols, since passkeys bind to the origin.

**PairDrop must stay on bridge networking.** It looks like an app that needs
`network_mode: host` to see LAN devices; it is the reverse. PairDrop groups
peers into a room keyed by the IP on their WebSocket upgrade
(`_joinRoom(peer, 'ip', peer.ip)`), and Umbrel's app_proxy sets
`x-forwarded-for` on HTTP but not on WebSocket upgrades (`onProxyReqWs`, with
`xfwd: false`). Every client therefore arrives as the proxy's address, shares
one room, and discovery works. On host networking each device would arrive
with its own LAN IP, get a room of one, and see nobody. Upstream's grouping
assumes a public instance where LAN peers share a public IP.

Two version-pin traps found while packaging:

- **Threadfin's `latest` is amd64-only**; its version tags are multi-arch.
  Check `docker buildx imagetools inspect` before moving the pin.
- **Tinyauth publishes rolling major tags** on GHCR (`v5`, `latest`) with no
  per-patch tag, so the digest is the only real pin.

**Huntarr was considered and rejected.** Upstream `plexguide/huntarr.io` is
gone (404) and there is a public reproducible unauthenticated auth-bypass in
v9.4.2 that returns the API keys of every *arr app it manages. Do not package
it.

## MiroTalk P2P Store Contract

Not our app: it repackages upstream's `mirotalk/p2p`. Added 2026-08-24.

**It was chosen for the tunnel, not for its feature list.** MiroTalk P2P is a
mesh — every browser sends its stream directly to every other browser, and the
container only serves the page and relays socket.io signalling. Cloudflare
Tunnel carries HTTP and WebSocket only, so anything with an SFU (Jitsi's JVB on
UDP 10000, mediasoup, LiveKit, and therefore plugNmeet) loads a room in which
nobody can hear anyone. This has no media leg to deliver. Do not "upgrade" it
to MiroTalk SFU without also solving the UDP path.

The mesh is the trade: `ROOM_MAX_PARTICIPANTS` is set to 8, against upstream's
1000, because the Nth joiner adds an upload stream to every browser already in
the room.

**The digest is the only pin.** Docker Hub serves exactly one tag for this
image — `latest`, `count: 1` from the tags API — and the GitHub repository
carries no tags or releases either. Same shape as Tinyauth's rolling `v5`, and
`POLICIES` holds it at `digest`. The manifest `version:` is `package.json`'s
value at pinning time and drifts silently; correct it by hand when the digest
moves.

**Configuration resolves through the image's own `.env`.** The Dockerfile does
`COPY .env.template ./.env`, and `config.js` calls `require('dotenv').config()`,
which does not overwrite variables that are already set. Precedence is
therefore `environment:` > `${APP_DATA_DIR}/secrets.env` > the baked template.
Variables meant to stay host-configurable — every `TURN_SERVER_*`, `HOST_*`,
`JWT_KEY`, `API_KEY_SECRET` — are deliberately **absent** from `environment:`,
because a name declared there beats env_file silently. Adding one of them to
the compose file to "document the default" would break secrets.env for it.

**Upstream's defaults assume upstream runs the instance.** Turned off in the
package: `STATS_ENABLED` (loads a script from stats.mirotalk.com into every
visitor's page, and note the config treats *absent* as enabled, so it must be
set explicitly), `SURVEY_ENABLED` (redirects guests to QuestionPro on hang up),
`REDIRECT_ENABLED`, `IP_LOOKUP_ENABLED` (geojs.io lookup per peer). Also
`API_DISABLED` covers all six endpoints `server.js` gates — upstream disables
two and leaves the rest behind an `API_KEY_SECRET` whose default is published
in the template.

**It cannot work over http.** `getUserMedia` needs a secure context, so on
`http://umbrel.local:46260` the room opens and finds no camera or microphone.
Same class of problem as Pocket ID's passkeys. The LAN port is only good for
confirming the app started; real use goes through the tunnel, pointed at
`chepetime-mirotalk_server_1:3000` rather than the published port.

**Rooms are open by design.** Reaching the container directly skips Umbrel's
login, and the app ships no auth, which is the anonymity the app was asked for.
`HOST_PROTECTED=true` with `HOST_USER_AUTH=false` in secrets.env is the useful
middle — `server.js` computes
`authRequired = user_auth || peer_token || (protected && isRoomNew)`, so a
password is needed only to open a room that does not exist yet, and guests
joining it stay anonymous. It is coarse: upstream tracks it in one
process-wide `hostCfg.authenticated` flag, not per session.

**Stateless.** No volumes beyond `/etc/localtime`, no database, nothing to back
up. Reinstalling costs only `secrets.env`.

## Keeping Image Pins Current

`scripts/check-image-updates.ts` checks every `image:` line in the store
against its registry and can release what it finds. Node 24 runs the
TypeScript directly, so there is nothing to build; `pnpm install` only pulls
`typescript` and `@types/node` for `pnpm typecheck`.

```bash
pnpm check-images                 # report only
pnpm check-images:apply           # rewrite the files, no commit
pnpm check-images:release         # rewrite, one commit per app, push
pnpm check-images --app tdarr     # limit to some apps
pnpm check-images --allow-major   # let a tag cross a major
pnpm check-images --check         # exit 1 if anything is stale
```

It uses anonymous registry v2 APIs over `fetch` — no Docker daemon, no login —
and works against Docker Hub and GHCR alike. Two kinds of staleness are
reported: a newer tag, and a digest that moved under a tag that did not.

How far a tag may move is per image, in the `POLICIES` table at the top of the
script. The default is `minor`, newest tag inside the current major:

- **Postgres, pgvector and Redis are `digest`.** Their tag *is* the major, and
  moving it is a data-directory migration somebody has to do by hand. A newer
  major is still reported, as `[held back: pg19]`, so it does not go unnoticed.
- **Tinyauth is `digest`** for the reason above: `v5` is all upstream
  publishes.
- **Billow, Goose and Multica's own images are `skip`.** Their store version
  is released alongside their source, Billow's by `scripts/bump-billow.sh`.

Two behaviours worth knowing before trusting it:

- **A candidate tag is rejected unless it covers every platform the current
  pin covers**, which is the Threadfin trap above enforced automatically.
- **The store version follows the primary image's tag** — the service behind
  `app_proxy` — but only when the two were already in step. Otherwise it adds
  or increments a `-N` store revision, which is what makes Umbrel offer an
  update for a change that carries no upstream version. Multica takes that
  path: its primary service is the nginx gateway, whose version is not
  Multica's.

New release notes **replace** the block rather than being prepended above it.
They used to accumulate behind `---` rules, but this script writes the same
sentence every time an upstream tag is re-published, so the block filled with
verbatim repeats and buried the one entry a user wants: what changed in the
version being offered. Umbrel shows these notes on the app page every time, so
length costs something. Packaging rationale belongs in the compose file's
comments, and git keeps superseded entries. Pass `--keep-notes` to leave the
block alone.

### The nightly run

`.github/workflows/check-image-updates.yml` runs the same thing every night
and pushes what it finds straight to `master`, as `github-actions[bot]`. The
store picks the commits up on its next five-minute refresh, so an update can
appear in the Umbrel UI without anyone having touched this repo.

- **`cron: "0 6 * * *"` is local midnight.** GitHub schedules in UTC, and
  America/Mexico_City is UTC-6 all year since Mexico dropped daylight saving
  in 2022. There is no half-year drift to correct for. Scheduled runs are
  best-effort and can be delayed under load.
- **Run it by hand from the Actions tab** with `workflow_dispatch`. It takes a
  `dry_run` input that reports without committing, which is the safe way to
  test a change to the `POLICIES` table.
- **The report is written to `$RUNNER_TEMP`, not the checkout.** The checker
  aborts on a dirty tree, and an untracked `report.txt` beside it counts as
  dirty. It also lands in the run's step summary, so the Actions page says
  what moved without anyone opening the log.
- **GitHub disables scheduled workflows after 60 days without repository
  activity**, and commits pushed by `GITHUB_TOKEN` do not count as activity.
  If the store goes quiet for two months the nightly run stops silently and
  has to be re-enabled from the Actions tab.

A push that races something else onto `master` fails the job rather than
merging; rerun it and the next check picks up wherever the pins ended up.

## Multica Store Contract

Not our app: it repackages upstream's `ghcr.io/multica-ai/multica-backend` and
`ghcr.io/multica-ai/multica-web`. Both move together — they share a release.

```yaml
id: chepetime-multica
port: 46258
image: ghcr.io/multica-ai/multica-backend:v0.4.32@sha256:508de17e1ddb335a5a3907a2a7702f2a20e7cf4a9321f63ee7a2bcdfef57ee35
image: ghcr.io/multica-ai/multica-web:v0.4.32@sha256:c6976fbee1b1c566543067cde544d3168d3f9b71c60e6a5ccb7f2851392e8234
image: pgvector/pgvector:pg18@sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a
image: nginx:1.31-alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913
```

**Postgres 18 changed what it expects mounted where, and it broke this app
on the very first attempt at the pg18 pin above.** The official `postgres`
image (which `pgvector/pgvector` builds on) started refusing to start, from
18 onward, when a volume lands directly on `/var/lib/postgresql/data` —
treated as leftover pre-18 state and rejected
(`docker-library/postgres#1259`), even against a completely empty volume on
a first boot. It wants a single mount at the parent `/var/lib/postgresql`
instead, and places data itself in a version-named subdirectory below it.
Confirmed live on 2026-08-21: the crash loop this produced left the app
stuck `Restarting` and every other service stuck `Created`, reported by
Umbrel as the install simply failing back to `not-installed` with no useful
error anywhere in the UI. `postgres:` volumes on this pin mount
`${APP_DATA_DIR}/postgres:/var/lib/postgresql`, not `.../postgresql/data` —
if a future edit "corrects" that back to the more common-looking `.../data`
path, it will reintroduce this exact crash loop. Do not route around it by
setting `PGDATA` either; mounting the parent is upstream's actual fix, not a
workaround.

This is the first app here with **four** services, and the first that ships a
config file alongside the manifest. Both are deliberate:

- **The `gateway` nginx container is not optional.** `app_proxy` forwards to a
  single `APP_HOST`/`APP_PORT`, and Multica needs two upstreams. The Next.js
  frontend proxies `/api`, `/auth` and `/uploads` to the Go backend through
  its own rewrites, but **Next.js rewrites forward HTTP only and drop the
  `Upgrade` handshake**, so both WebSocket endpoints — `/ws` (browser) and
  `/api/daemon/ws` (agent daemon) — must reach the backend directly. Without
  the gateway the UI loads and then loops `disconnected, reconnecting in 3s`,
  and the daemon never connects at all.
- **`nginx.conf` lives in `hooks/`, not beside the manifest.** A fresh install
  would find it either way, but only `hooks/` survives an app update — see
  "Installs Copy Everything, Updates Copy A Whitelist" below. Do not move it
  back for tidiness; that silently freezes the file at whatever the first
  install wrote.
- **Only `/ws`, `/api/daemon/ws`, `/health` and `/healthz` are exact-matched
  to the backend.** Everything else, `/api` included, stays on upstream's
  tested path through Next.js. Do not "simplify" this by routing `/auth/*` to
  the backend: those are `afterFiles` rewrites, so real pages win, and
  `/auth/callback` is a frontend page used by Google sign-in.
- **`/health` must be routed *and* whitelisted.** `multica setup self-host`
  probes `GET <server-url>/health` and refuses to write any config unless it
  answers 200 (`cmd_setup.go` `probeServer`). Next.js does not rewrite it, so
  the frontend 404s it; `app_proxy` redirects it to Umbrel's login unless it
  is in `PROXY_AUTH_WHITELIST`. Either failure is reported to the user as
  "Server is not reachable", which reads like a DNS or tunnel fault and sends
  you debugging the wrong layer entirely.
- **`proxy_set_header Host $http_host`, never `$host`.** The backend accepts a
  WebSocket when `Origin`'s host equals `r.Host`; `$host` strips the port, so
  `umbrel.local` would never match `umbrel.local:46258` and every upgrade
  would be rejected.
- **`proxy_pass` targets are held in variables with a `resolver`.** A literal
  name in `proxy_pass` is resolved once at nginx startup, so a recreated
  backend container leaves nginx talking to a dead IP.

Three more traps specific to this app:

- **`Dockerfile.web` bakes in `REMOTE_API_URL=http://backend:8080`.** A bare
  `backend` alias on `umbrel_main_network` resolves to other apps' containers.
  The compose file overrides it with the fully-qualified container name; if
  the frontend ever starts talking to something surprising, check this first.
- **`JWT_SECRET: ${APP_SEED}` and `POSTGRES_PASSWORD: ${APP_PASSWORD}` are
  different values on purpose.** `app-script` derives both
  (`derive_entropy "${app_entropy_identifier}"` and the same identifier with
  `-APP_PASSWORD` appended), so there is no reason to sign sessions with the
  database password.
- **`MULTICA_VCS_SECRET_KEY` cannot be wired to `APP_SEED`.** It is parsed as
  base64 and must decode to exactly 32 bytes (`secretbox.LoadKey`); a 64-char
  hex seed decodes to 48. It is left unset, and the self-hosted Git provider
  endpoints return 503 naming the variable until a user sets one.

The app is **only the server**. The agent daemon runs on the user's own
machine, which is why `PROXY_AUTH_WHITELIST: "/api/*,/ws"` is there: the CLI
and daemon authenticate with a `mul_` PAT over `Authorization: Bearer` and
have no Umbrel session cookie. The trade-off is the same one Pocket ID and
Threadfin make — the API is LAN-reachable behind Multica's own auth only.

There is no email backend, so login codes are printed to the backend log
(`SendVerificationCode` falls through to stdout when neither `SMTP_HOST` nor
`RESEND_API_KEY` is set). The first sign-in therefore needs SSH. Never set
`MULTICA_DEV_VERIFICATION_CODE`; it is a fixed code that turns any known email
address into an account.

**The first install looks like it fails.** umbreld starts `app_proxy` before
the rest of the stack (`app-script`: `compose up --detach app_proxy`), so it
logs `The address 'chepetime-multica_gateway_1' cannot be found` / `Retrying...`
until the gateway exists. With five services to pull, `initdb` to run and 271
migrations to apply, that took 17 retries on first install here and the UI
reported failure while it was still coming up. The app reached
`state: ready` on its own. Check before changing anything:

```bash
umbreld client apps.state.query --appId chepetime-multica
sudo docker logs chepetime-multica_app_proxy_1 --tail 5   # "Multica is now ready..."
```

Verified working on 2026-08-10: `/api/config` returns JSON with no Umbrel
login (the whitelist), and `/api/daemon/ws` returns `401` from the backend
rather than a Next.js 404, which is what proves the gateway is routing the
daemon's WebSocket past the frontend.

## Updating Multica

No build step. Move both images to the same new tag, with their multi-arch
index digests:

```bash
docker buildx imagetools inspect ghcr.io/multica-ai/multica-backend:vX.Y.Z \
  --format '{{.Manifest.Digest}}'
docker buildx imagetools inspect ghcr.io/multica-ai/multica-web:vX.Y.Z \
  --format '{{.Manifest.Digest}}'
```

Then bump `version` and `releaseNotes` in `chepetime-multica/umbrel-app.yml`
and the pins above. Upstream ships roughly one release a day; `v0.4.31` is the
previous release before the current `v0.4.32` pin, so a fresh tag has had
almost no soak time.

## Plane Store Contract

Not our app: it repackages upstream's official self-host
`docker-compose.yml` (`deployments/cli/community/docker-compose.yml` in
`makeplane/plane`, the same file
https://developers.plane.so/self-hosting/methods/docker-compose's installer
downloads) as closely as possible. AGPL-3.0, no self-hosting/resale
restriction, and the images used are the real `.ce` community-edition
builds — nothing is gated behind a separate license key.

**Thirteen containers, by far the heaviest app in this store** (Multica, the
previous heaviest, has four): `web`, `space`, `admin`, `live`, `api`,
`worker`, `beat-worker`, `migrator` (one-shot, runs Django migrations then
exits), `plane-db` (Postgres), `plane-redis` (Valkey), `plane-mq`
(RabbitMQ), `plane-minio`, `proxy` (Caddy).

Deviations from upstream's literal compose, all deliberate:

- **`deploy: {replicas, restart_policy}` blocks are Swarm-only** and ignored
  (with a warning) by plain `docker compose`, which is all Umbrel runs. Every
  service uses `restart: on-failure` instead, like everywhere else in this
  store.
- **Every volume is a bind mount under `${APP_DATA_DIR}`.** Upstream uses
  plain Docker-managed named volumes (`pgdata:`, `uploads:`, ...); those
  survive an uninstall as ownerless orphans since nothing under app-data
  references them. Converted all nine to explicit paths.
- **Every cross-service hostname is fully-qualified**
  (`chepetime-plane_api_1`, not bare `api`) — every Umbrel app shares one
  Docker network, and generic names like `api`/`web`/`worker` are exactly
  the kind that can resolve to an unrelated app's container.
- **`TRUSTED_PROXIES` is set on `proxy`, scoped to `10.21.0.0/16`.**
  Upstream's own `variables.env` defines this (Caddy's
  `trusted_proxies static {$TRUSTED_PROXIES:0.0.0.0/0}`, gating whether
  `X-Forwarded-For` is honoured) but never actually wires it into any
  service's `environment:` block in their own compose — so their literal
  file silently falls back to trusting every peer. Scoped to Umbrel's
  internal network instead, same value and reasoning as Multica's
  `MULTICA_TRUSTED_PROXIES`.
- **Postgres/Valkey/RabbitMQ get healthchecks**, and `api`/`worker`/
  `beat-worker`/`migrator` gate on `condition: service_healthy` for them.
  Not strictly required — `docker-entrypoint-api.sh` and friends
  (`apps/api/bin/` upstream) already run `python manage.py wait_for_db` then
  `wait_for_migrations` before doing anything, so the app converges either
  way — but it avoids needless crash-loop log noise on first boot, matching
  the bar Multica's compose sets.

**No extra gateway container, unlike Multica.** Upstream's own `proxy`
(Caddy, `apps/proxy/Caddyfile.ce`) already reverse-proxies `web`, `space`,
`admin`, `live` (WebSocket — Caddy handles `Upgrade` natively) and `api`
behind one `SITE_ADDRESS`. `app_proxy` points straight at
`chepetime-plane_proxy_1:80`.

**But the image's own Caddyfile had to be replaced anyway, and this one bit
in production.** `Caddyfile.ce` reverse-proxies to bare service names —
`web`, `space`, `admin`, `live`, `api`, `plane-minio` — which is exactly
right on upstream's own compose, where Docker Compose scopes those names to
one project's network. It is wrong here: every Umbrel app shares a single
Docker network, so a bare name resolves whatever container happens to
answer to it, not necessarily this app's own. **Confirmed live on
2026-08-21**: `web` resolved to a different installed app entirely
(Docmost) instead of `chepetime-plane_web_1` — Plane's proxy silently
served Docmost's UI on Plane's own port, with no error anywhere, not in
`docker ps`, not in any log, not in Umbrel's install state (which reported
`ready`). Only a manual `curl` past the app_proxy layer surfaced it.
`hooks/Caddyfile` replaces it with fully-qualified targets
(`chepetime-plane_web_1:3000`, etc.), mounted over `/etc/caddy/Caddyfile` —
same `hooks/`-for-survivability reasoning as Multica's `nginx.conf`. Caddy's
`reverse_proxy` re-resolves hostnames per request (unlike nginx, which
needs the `resolver` + variable trick Multica's `nginx.conf` uses), so no
equivalent workaround is needed here beyond qualifying the name once.
**Any other repackaged app whose own image ships a baked-in proxy/gateway
config needs this same check** — do not assume a vendor's reverse-proxy
config is network-safe just because it already unifies everything behind
one origin; check what hostnames it actually targets.

**MinIO's presigned URLs are not a problem here**, unlike the `plane-aio-community`
all-in-one image (considered and rejected — see below): Caddyfile.ce already
routes `/{$BUCKET_NAME}/*` to `plane-minio` through the same origin as
everything else, so browser-facing attachment links resolve fine without any
extra configuration — once that target is qualified the same way, per above.

**`AWS_S3_ENDPOINT_URL` cannot use the container's real name either, for a
completely different reason: boto3 itself rejects it.** Fully-qualifying
`plane-minio`'s hostname as `chepetime-plane_plane-minio_1` (correct, and
required, per the collision reasoning above) fixed the Caddy-routing
collision but broke the Django backend's own S3 client: botocore's
endpoint-hostname validation disallows underscores by RFC 1123, and Docker's
DNS resolving that name without complaint doesn't change what botocore
itself will accept. **Confirmed live on 2026-08-22**: the `api` container's
`create_bucket` step failed silently at boot with `Invalid endpoint`, and
every code path touching real file storage 500'd afterward — sign-up
included, since it checks/creates the default bucket. `AWS_S3_ENDPOINT_URL`
now points at `chepetime-plane-plane-minio`, a *second*,
hyphen-only network alias for the same `plane-minio` container
(`networks.default.aliases` on that service) — fully-qualified (so it still
can't collide with another app), just spelled without the underscore boto3
chokes on. Do not "simplify" this back to the real container name; it will
reintroduce the exact same silent bucket-creation failure.

**MinIO's own tag is a real trap.** MinIO stopped publishing new community
builds to Docker Hub after `RELEASE.2025-09-07T16-13-09Z` (their move away
from free rolling releases toward the commercial AIStor product). That tag
is pinned here — genuinely the newest on Docker Hub, and confirmed multi-arch
(amd64+arm64+ppc64le). A security-hotfixed rebuild of the same release
exists at `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z.hotfix.7aa24e772`
(patched as recently as April 2026) but is **amd64-only** — verified via its
manifest list, one real `amd64` manifest and no `arm64`. Do not move to it
without confirming the target box is x86; on arm64 it's the same trap as
Threadfin's `latest`.

**`plane-aio-community` (the all-in-one image) was considered and
rejected.** It bundles `web`+`space`+`admin`+`api`+`worker`+`beat`+`live`+
`proxy` into one container via supervisord, dropping the stack to five
containers total (aio + postgres + valkey + rabbitmq + minio) — much closer
to Multica's footprint. Not used because (a) it isn't what upstream's own
documented docker-compose self-hosting method describes, and (b) its baked-in
Caddyfile (`Caddyfile.aio.ce`) has no `/{bucket}/*` route, so MinIO's
presigned URLs would need either an external S3 bucket or a hand-patched
Caddyfile mounted over the image's own — extra maintenance surface the full
CE stack doesn't need.

**`WEB_URL`/`CORS_ALLOWED_ORIGINS` cannot be left unset, unlike Multica's
address variables — this broke sign-up and sign-in outright in
production.** The first cut of this app followed Multica's pattern exactly:
leave them out of `environment:` (since a value there silently beats the
same key from `env_file:`) and source them from an optional `secrets.env`
instead, on the theory that "unset is safe, only absolute-URL cases need
it." That theory is true for Multica and false for Plane.
`plane.utils.host.base_host()` does
`settings.WEB_URL or settings.APP_BASE_URL` with **no None-safety**, and
both are `None` by default — neither ships an env default anywhere in
Plane's own settings. **Confirmed live on 2026-08-22**: sign-up and sign-in
both 500'd with `ImproperlyConfigured("APP_BASE_URL or WEB_URL is not set")`
(or, one layer up in `get_safe_redirect_url`, `AttributeError: 'NoneType'
object has no attribute 'rstrip'`) — this is not an edge case, it is the
very first thing a new install needs to do. Fix: `WEB_URL` and
`CORS_ALLOWED_ORIGINS` now default to `http://umbrel.local:46259` directly
under `environment:` in `x-app-env`. This is **not** a secrets-out-of-the-repo
concern the way Multica's `FRONTEND_ORIGIN` is — `http://umbrel.local:46259`
is a generic default, not anyone's real address — so there is no
`secrets.env`/`env_file:` on this app at all; a user reaching it at a
different address hand-edits these two values directly in their
`app-data/chepetime-plane/docker-compose.yml`, same as Multica's own
tunnel-address instructions do for its four address variables.
**Any other app in this store that leaves an address variable unset by
default needs this same check first**: does the vendor's own code actually
tolerate `None`/empty here, or does it just happen to work in whatever
manual test was run? Confirmed by reading the source
(`plane.utils.host.base_host`), not by assumption.

## Updating Plane

Seven image families, six of which move together (they share upstream's
release):

```bash
for repo in plane-frontend plane-space plane-admin plane-live plane-backend plane-proxy; do
  docker buildx imagetools inspect makeplane/$repo:vX.Y.Z --format '{{.Manifest.Digest}}'
done
```

`plane-backend` is used four times (`api`, `worker`, `beat-worker`,
`migrator`); move all four pins together. Postgres/Valkey/RabbitMQ/MinIO are
independent and `digest`-only in `scripts/check-image-updates.ts` — see
below — so they won't be suggested to cross a major automatically. Then bump
`version` and `releaseNotes` in `chepetime-plane/umbrel-app.yml`.

## Installs Copy Everything, Updates Copy A Whitelist

This applies to every app here and is the least obvious rule in the whole
repository.

A **fresh install** rsyncs the entire app directory into app-data
(`apps.ts`: `rsync --archive`), so any file you ship is available to compose.
An **update** does not. `app-script`'s `pre-patch-update` copies only:

```sh
UPDATE_FILES_WHITELIST_PRE="docker-compose.yml *.template exports.sh torrc hooks"
UPDATE_FILES_WHITELIST_POST="umbrel-app.yml"
```

So a config file shipped beside the manifest installs correctly once and is
then **frozen for the life of the install**. Fixing it later would need an
uninstall, and uninstall deletes app-data — the database with it. This was
found the hard way on Multica: a `/health` routing fix in `nginx.conf` could
never have reached the existing install, and had to be applied by hand on the
host.

Two workarounds, one of which does not work:

- **`hooks/` is the answer.** It is a directory in the whitelist, and
  `cp --archive` merges it over the existing one rather than nesting
  (verified on the host: `cp -a repo/hooks data/` overwrites
  `data/hooks/<file>`, it does not create `data/hooks/hooks`). Nothing runs a
  file parked there — `execute_hook` only invokes specific hook names, and
  only when they are executable. Mount it as
  `${APP_DATA_DIR}/hooks/<file>`.
- **`*.template` is not.** `template_app` pipes the file through plain
  `envsubst` on every app start, with no variable filter, so anything using
  `$` for its own syntax — an nginx config, a shell script — is silently
  gutted.

For **secrets and per-host settings**, the inverse trick works: a file that is
*not* in the app template and *not* in the whitelist is touched by neither an
install nor an update, so it is the only durable place for values that must
never be committed to a public store. Multica declares one:

```yaml
    env_file:
      - path: ${APP_DATA_DIR}/secrets.env
        required: false
```

`required: false` needs compose 2.24+; the host runs v5.3.1. The catch is that
a variable declared under `environment:` **silently wins** over the same
variable from an env_file, so anything meant to be user-supplied must be left
out of `environment:` entirely — which is why Multica no longer declares
`SMTP_HOST: ""` there.

Version bumps are what make an update offer appear at all. The UI compares
with string inequality (`version!==u.version` in the bundle), not semver, so a
packaging-only revision can use a `-N` suffix: Multica ships `0.4.22-1` with
unchanged `v0.4.22` images.

## Umbrel Debugging

**Check the clone's commit before suspecting the manifest.** umbreld re-clones
every app repository on a five-minute timer (`updateInterval = '5m'` in
`apps/app-store.ts`); the refresh control in the UI does not force a pull. A
just-pushed app is legitimately missing for a few minutes, and that is
indistinguishable from a broken manifest. This cost an hour once. On the host:

```bash
ssh umbrel
cat ~/umbrel/app-stores/<user>-<repo>-github-<hash>/.git/refs/heads/*
umbreld client appStore.registry.query   # what the store actually serves
```

Note also that umbreld 1.7.4 does **not** validate manifests against the Zod
schema — `validateManifest` only normalises `manifestVersion` and returns, with
the `AppManifestSchema.parse` call commented out. The `gallery:` rule above was
real on the older umbreld it was learned on, but it cannot silently drop an app
on 1.7.4. Keep writing `gallery:` anyway; the rule may come back.

`umbreld client <path>.<query|mutate>` takes `--key value` pairs, not
`--input '{json}'`. For example
`umbreld client apps.uninstall.mutate --appId chepetime-netalertx`.

If an app appears in the store but install fails, the store metadata is loading.
Check the app containers on the Umbrel host:

```bash
sudo docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
sudo docker logs chepetime-billow_server_1 --tail 200
sudo docker logs chepetime-billow_db_1 --tail 120
sudo docker inspect chepetime-billow_app_proxy_1 --format '{{json .State}}'
```

Common Billow install failures seen so far:

- GHCR image tag does not exist yet.
- GHCR package is private.
- GHCR package exists but the publishing repo lacks package write access.
- `docker-compose.yml` image tag does not match the published tag.
- App container exits while waiting for Postgres or applying migrations.
- `app_proxy` cannot bind the configured host port.

Billow production startup runs migrations, then `next start`. It intentionally
does not run seed data during startup.
