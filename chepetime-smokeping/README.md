# SmokePing

Long-term latency and packet-loss graphs. Pinned at `2.9.0` (LinuxServer.io
image).

## Nothing is graphed until you edit Targets

The shipped configuration probes localhost only. Edit the targets file on the
Umbrel host:

```bash
ssh umbrel
sudo nano ~/umbrel/app-data/chepetime-smokeping/config/Targets
```

A useful starting set — one inside the house, one at the ISP, two beyond it:

```text
+ Local
menu = Local
title = Local network

++ Gateway
menu = Gateway
title = Router
host = 192.168.1.1

+ Internet
menu = Internet
title = Beyond the router

++ Cloudflare
menu = Cloudflare
host = 1.1.1.1

++ Google
menu = Google
host = 8.8.8.8
```

Restart the app afterwards. Graphs need a few hours before they say anything,
and a few weeks before they say something useful.

## Reading it

The line is median latency; the "smoke" around it is the spread across the
pings in that interval. Colour marks packet loss. Thick smoke on the gateway
means the problem is inside the house; smoke that starts at the ISP hop and
carries outward means it is not.

## Data

```text
${APP_DATA_DIR}/config    Targets and SmokePing configuration
${APP_DATA_DIR}/data      RRD files: the entire measurement history
```

These are separate volumes so a config mistake never costs you the history.
Back up `data` — it cannot be reconstructed.

## Updating

```bash
docker buildx imagetools inspect linuxserver/smokeping:X.Y.Z \
  --format '{{.Manifest.Digest}}'
```
