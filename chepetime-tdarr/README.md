# Tdarr

Automated transcoding and health-checking for your media library. Pinned at
`2.85.01`.

## Library paths

Umbrel's shared storage is mounted at `/downloads`, the same path Radarr,
Sonarr and Lidarr use. When you add a library in Tdarr, point it at
`/downloads/movies`, `/downloads/tv` and so on — matching what the *arr apps
report — or Tdarr will scan files the rest of your stack cannot find.

The transcode cache is `/temp`, backed by `${APP_DATA_DIR}/transcode`. It gets
large during a run and is deleted as jobs complete. It is deliberately not on
the media volume.

## Hardware transcoding is off

The `devices: /dev/dri` mount is commented out in `docker-compose.yml`. A
missing device stops the container from starting entirely, and that is a
confusing failure to debug, so it is opt-in.

If your Umbrel has an iGPU — Umbrel Home does, a Raspberry Pi does not —
check for the device first:

```bash
ssh umbrel
ls -la /dev/dri
```

If it exists, uncomment the `devices` block on the host in
`~/umbrel/app-data/chepetime-tdarr/docker-compose.yml`, restart the app, and
select QSV/VAAPI in your plugin stack. On CPU alone, expect a large library to
take days rather than hours.

## One node, or several

This package runs the Tdarr server and one worker node in a single container
(`internalNode=true`). That is the right setup for a single machine.

To spread transcoding across other computers, run `ghcr.io/haveagitgat/tdarr_node`
there and point it at this server on port `8266`. Note that `8266` is not
published on the host by this package — the app proxy only exposes the web UI
on `46252` — so add a port mapping if you go that route.

## Login

Tdarr's own auth is disabled (`auth=false`) because Umbrel's app proxy already
authenticates the UI. Turn it back on if you ever publish port 8265 directly.

## Data

```text
${APP_DATA_DIR}/server      database, statistics, plugin state
${APP_DATA_DIR}/configs     configuration
${APP_DATA_DIR}/logs        logs
${APP_DATA_DIR}/transcode   scratch space, safe to delete when idle
```

## Updating

```bash
docker buildx imagetools inspect haveagitgat/tdarr:X.Y.ZZ \
  --format '{{.Manifest.Digest}}'
```

Update tag and digest together, then bump `version` and `releaseNotes`.
Upstream releases roughly weekly.
