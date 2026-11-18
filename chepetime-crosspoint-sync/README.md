# CrossPoint Sync

A KOSync-compatible reading-progress server, with stats, highlights and a web
app. Pinned at `0.2.1` (`ghcr.io/crosspoint-reader/crosspoint-sync`, MIT).

## Use

Open `http://umbrel.local:36264/app/` and create an account, or create it from
the reader's sync settings. Then point each reader at the server:

- **KOReader:** Tools → Progress sync → Custom sync server →
  `http://umbrel.local:36264` (or the tunnel's https address)
- **CrossPoint / CrossInk:** Settings → KOReader Sync → Sync Server URL

Use the same username and password on every device. For reading stats from
KOReader, install upstream's plugin; see
[their README](https://github.com/crosspoint-reader/crosspoint-sync#koreader-reading-statistics-plugin).

## No Umbrel login in front

Readers, the companion app and connector OAuth callbacks all call the server
without a browser session, so `app_proxy` runs with `PROXY_AUTH_ADD: "false"`.
The app's own accounts are the only gate.

**Registration is open by default**, because the first account has to be
created somehow. Once everyone has an account, close it — especially if the
app is reachable through a tunnel:

```bash
nano ~/umbrel/app-data/chepetime-crosspoint-sync/secrets.env
```

```bash
REGISTRATION_DISABLED=true
```

Restart the app afterwards.

## Connectors and https

Service connectors (Hardcover, Readwise Reader, Audiobookshelf, Jellyfin,
Readest, Micro.blog, BookOrbit...) are enabled: `TOKEN_ENC_KEY` is derived from
the app's seed, so they work without setup. The app refuses to accept
connector credentials over plain http, so link them from the tunnel's https
address, not from `umbrel.local`. `TRUST_PROXY` is on so the app believes the
tunnel's `X-Forwarded-Proto: https`.

Point the tunnel at `chepetime-crosspoint-sync_server_1:8080`.

## Other settings

All optional, all in `secrets.env`:

```bash
# Stop sending book titles and authors to metadata.dev (covers, page counts).
METADATA_API=false

# Richer book details: moods, series, ratings. `read:catalog` is enough.
HARDCOVER_API_KEY=...

# Per-IP limit on registration, per minute (0 disables).
AUTH_RATE_LIMIT_PER_MINUTE=30
```

The full list is in
[upstream's README](https://github.com/crosspoint-reader/crosspoint-sync#configuration).
Do not add any of them under `environment:` in the compose file: a variable
declared there silently beats the same one from `secrets.env`.

## Data

One SQLite database, `data/crosspoint.db`. Back up `data/` to keep accounts,
progress, stats and linked connectors.

## Updating

Server releases are tagged `vX.Y.Z` on GitHub and `X.Y.Z` on GHCR, multi-arch.
Ignore the `koreader-v*` releases; those are the plugin. Avoid `main`.

```bash
docker buildx imagetools inspect ghcr.io/crosspoint-reader/crosspoint-sync:X.Y.Z \
  --format '{{.Manifest.Digest}}'
```

`pnpm check-images --app crosspoint-sync` does this automatically under the
default `minor` policy.
