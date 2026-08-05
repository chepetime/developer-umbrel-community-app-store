# Threadfin

An IPTV playlist turned into a tuner Plex, Jellyfin and Emby can use. The
maintained fork of the abandoned xTeVe. Pinned at `1.2.37`.

## Setup

1. Open the app and add your provider's M3U URL in **Playlist**.
2. Add an XMLTV guide URL in **XMLTV**.
3. Under **Filter**, pick the channels you actually want. Providers commonly
   send thousands; filter first or the mapping step is unusable.
4. Map channels to guide IDs in **Mapping**.
5. In Plex: **Live TV & DVR → Set up** and enter
   `http://umbrel.local:46254` when asked for the tuner address.

No provider is included. Nothing works until step 1.

## Why some paths skip Umbrel's login

Plex fetches the playlist, guide and HDHomeRun discovery endpoints with no
browser session. Those paths are listed in `PROXY_AUTH_WHITELIST`, so they
answer without authentication:

```text
/m3u/*  /xmltv/*  /discover.json  /lineup.json  /device.xml  /stream/*  /auto/*
```

The consequence: anyone on your LAN can read your playlist and stream through
this instance. Do not expose it to the internet.

## Pinned to a version tag, not `latest`

Upstream's `latest` is currently **amd64 only**, while the version tags are
multi-arch (amd64, arm, arm64). Following `latest` would break an arm install.

## Data

```text
${APP_DATA_DIR}/conf    settings, filters, channel mapping
${APP_DATA_DIR}/temp    stream buffer, safe to delete when nothing is playing
```

## Updating

```bash
docker buildx imagetools inspect fyb3roptik/threadfin:X.Y.ZZ \
  --format '{{.Manifest.Digest}}'
```

Check the tag is multi-arch before pinning it.
