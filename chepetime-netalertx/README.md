# NetAlertX

Continuous LAN scanning with a device inventory, presence history and alerts
when something new appears. A free, self-hosted replacement for Fing Agent and
a considerably richer one than WatchYourLAN.

Upstream: [jokob-sk/NetAlertX](https://github.com/jokob-sk/NetAlertX), pinned
here at `26.8.5`.

## Set the password first

There is no `app_proxy`, so Umbrel's login does **not** cover this app — the UI
on port `20211` is reachable by anything on your LAN. First thing after
install:

1. Open the app.
2. Go to **Settings → General**.
3. Enable the password and set one.

Do not forward `20211` or `20212` from the internet.

## First run

The first scan takes a few minutes, and every device will be reported as new —
that is expected. Work through the list once, name the devices you recognise,
and from then on a new entry means something actually new.

Worth setting early, in **Settings**:

- **SCAN_SUBNETS** — must match your real subnet and interface. The default
  guess is often wrong, and a wrong value means an empty device list.
- **Notifications** — email, Telegram, ntfy, Pushover, MQTT, webhooks, Apprise.
  You already run ntfy-capable clients; ntfy is the least friction.

## Why host networking

The compose file sets `network_mode: host` and grants a narrow capability set
(`cap_drop: ALL`, then `NET_ADMIN`, `NET_RAW`, `NET_BIND_SERVICE`, `CHOWN`,
`SETUID`, `SETGID`). NetAlertX scans with arp-scan, nmap and nbtscan, which
need raw sockets against the real LAN. Bridged, it would only see Docker's
subnet and report nothing useful.

## What was changed from upstream's compose

- **The `sysctls` block is dropped.** Upstream sets
  `net.ipv4.conf.all.arp_ignore=1` and `arp_announce=2` for ARP-flux accuracy.
  Docker refuses any `net.*` sysctl on a container sharing the host network
  namespace and fails it with *"sysctl ... is not allowed in host network
  mode"*, so copying that block verbatim stops the app from starting. Those
  settings would also change the Umbrel host globally, not the container. If
  scan accuracy ever needs them, set them on the host.
- **Named volume replaced by `${APP_DATA_DIR}/data`**, so the data sits with
  every other Umbrel app's.
- **`restart: on-failure`** instead of `unless-stopped`, matching the other
  apps here — Umbrel manages the lifecycle.
- Resource limits and log rotation dropped; Umbrel handles both.

`read_only: true` and the `/tmp` tmpfs are kept as upstream ships them.

## Ports

| Port    | Use                                    |
| ------- | -------------------------------------- |
| `20211` | Web UI and REST API                    |
| `20212` | GraphQL API                            |

Both were free on the Umbrel host when this was packaged. They do not collide
with Billow (`46247`) or Goose (`46248`).

## Data

```text
${APP_DATA_DIR}/data
```

Config and the SQLite device database. Keep this path stable across updates or
you lose the entire device history and start over.

Never set `ALWAYS_FRESH_INSTALL: "true"` — it wipes config and database on
every container start.

## Updating

1. Check [Docker Hub](https://hub.docker.com/r/jokobsk/netalertx/tags) for a
   newer tag.
2. Update the tag **and** its multi-arch index digest in `docker-compose.yml`:

   ```bash
   docker buildx imagetools inspect jokobsk/netalertx:X.Y.Z \
     --format '{{.Manifest.Digest}}'
   ```

3. Bump `version` and `releaseNotes` in `umbrel-app.yml`.
4. Refresh the alt store in Umbrel, and wait up to 5 minutes for umbreld to
   re-clone.

Upstream releases roughly monthly on a `YY.M.P` scheme.
