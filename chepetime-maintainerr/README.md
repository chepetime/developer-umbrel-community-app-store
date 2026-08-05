# Maintainerr

Rules that decide what leaves your media library. Pinned at `3.21.1`.

## Connecting it to what you already run

Everything is on Umbrel's shared Docker network, so use container names rather
than IP addresses. In **Settings**:

| Service     | URL                                 |
| ----------- | ----------------------------------- |
| Plex        | `http://plex_server_1:32400`        |
| Radarr      | `http://radarr_server_1:7878`       |
| Sonarr      | `http://sonarr_server_1:8989`       |
| Jellyseerr  | `http://jellyseerr_server_1:5055`   |

Use the fully-qualified container name. Every Umbrel app shares one network,
so a bare `radarr` can resolve to something unexpected.

## How to use it without deleting something you wanted

1. Build a rule — for example: added over a year ago, never watched, not in a
   collection you keep.
2. Set the collection to **show in Plex** with a "leaving soon" label and a
   long grace period.
3. Watch what it collects for a couple of weeks before enabling deletion.

Deletions go back through Radarr and Sonarr, so entries are removed properly
rather than left orphaned on disk.

## Library paths

Umbrel's shared storage is mounted at `/downloads`, matching the *arr apps.
The leftover-folder cleanup compares against paths as Radarr and Sonarr report
them, so this has to agree or that feature finds nothing.

## Runs as uid 1000

Upstream requires `/opt/data` to be writable by the configured user, and
Umbrel creates app data as `1000:1000`, so the two already match.

## Note for older CPUs

Collection posters and overlays use `sharp`, which needs `x86-64-v2`.
Maintainerr still runs without it, with those features disabled. Not an issue
on Umbrel Home or on arm64.

## Data

```text
${APP_DATA_DIR}/data
```

Rules, collection state and history.

## Updating

```bash
docker buildx imagetools inspect ghcr.io/maintainerr/maintainerr:X.Y.Z \
  --format '{{.Manifest.Digest}}'
```

Upstream moved the package from `jorenn92/maintainerr` to the org path; both
resolve to the same digest today, but the org path is canonical.
