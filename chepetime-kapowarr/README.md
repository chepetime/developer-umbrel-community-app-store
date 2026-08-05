# Kapowarr

Comic library management, in the shape of the *arr apps. Pinned at `1.3.1`.

## You need a ComicVine API key

Kapowarr identifies volumes and issues against ComicVine, and does nothing
useful without a key. It is free: register at
<https://comicvine.gamespot.com/api/> and paste the key into
**Settings → General → ComicVine API key** on first run.

## Paths

| Container path       | Host path                                          |
| -------------------- | -------------------------------------------------- |
| `/comics`            | `${UMBREL_ROOT}/data/storage/downloads/comics`      |
| `/app/temp_downloads`| `${UMBREL_ROOT}/data/storage/downloads/kapowarr-incomplete` |
| `/app/db`            | `${APP_DATA_DIR}/db`                                |

Set `/comics` as the root folder in **Settings → Media Management**. Both
media paths are on the same filesystem on purpose, so a finished download is
moved rather than copied.

Umbrel creates the shared storage directory, but not these subdirectories —
Kapowarr creates them on first start.

## Runs as uid 1000, not root

Upstream's documentation uses `PUID=0`/`PGID=0`. This package uses `1000`, so
files it writes match what Radarr, Sonarr and Transmission produce on the same
storage. If you hit a permissions error on a pre-existing directory, fix the
ownership rather than reverting to root:

```bash
ssh umbrel
sudo chown -R 1000:1000 ~/umbrel/data/storage/downloads/comics
```

## Data

```text
${APP_DATA_DIR}/db
```

The database: your volume list, issue tracking and history. The comics
themselves are on shared storage and are not affected by uninstalling.

## Updating

```bash
docker buildx imagetools inspect mrcas/kapowarr:vX.Y.Z \
  --format '{{.Manifest.Digest}}'
```

Update tag and digest together, then bump `version` and `releaseNotes`.
Upstream releases a few times a year; `latest` and `development` also exist,
but this store pins version tags only.
