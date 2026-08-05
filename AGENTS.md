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
image: ghcr.io/chepetime/billow:v0.1.0@sha256:8f49968de0ae0836a7ead27112720c28c27912e2f80a3838fb68b65cb560dae9
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

Two version-pin traps found while packaging:

- **Threadfin's `latest` is amd64-only**; its version tags are multi-arch.
  Check `docker buildx imagetools inspect` before moving the pin.
- **Tinyauth publishes rolling major tags** on GHCR (`v5`, `latest`) with no
  per-patch tag, so the digest is the only real pin.

**Huntarr was considered and rejected.** Upstream `plexguide/huntarr.io` is
gone (404) and there is a public reproducible unauthenticated auth-bypass in
v9.4.2 that returns the API keys of every *arr app it manages. Do not package
it.

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
