# Fing Agent

Always-on network monitoring for your Umbrel. The agent watches the LAN
continuously and reports devices, changes and security findings to the Fing
mobile and web apps.

Upstream image: [`fing/fing-agent`](https://hub.docker.com/r/fing/fing-agent),
pinned here at `1.1.1`.

## There is no web interface

This is the part that surprises people. The agent has no dashboard of its own.
Umbrel's **Open** button points at port `44444`, which is where the agent
publishes its status over UPnP and, on paid Fing plans, serves the local API —
not a UI. Everything you actually do with the agent happens in the Fing app.

## Activation

1. Install the app from this store and let it start.
2. Install the Fing app on a phone **on the same network** as this Umbrel.
3. Sign in or create a free Fing account.
4. Open **Network** in the app; the agent should be discovered automatically
   and offered for activation. Accept it to bind the agent to your account.

If the agent is not found, check that the phone is on the same subnet — the
discovery is local, and phones on a guest VLAN or on cellular will not see it.

## Why host networking

The compose file sets `network_mode: host` and grants `NET_ADMIN`. Fing
requires both: device discovery works at the ARP level against the real LAN,
and a bridged container can only see Docker's own subnet, so it would report an
empty network. This is a genuine privilege grant on the host network stack —
narrower than the `privileged: true` that Home Assistant uses, but worth
knowing before you install.

A consequence of host networking is that the app has no `app_proxy`, so port
`44444` is served directly on the host without Umbrel's auth in front of it.
Do not forward it from the internet.

## Data

Agent identity, activation state and history live in:

```text
${APP_DATA_DIR}/fingdata
```

Keep that path stable across updates. Losing it unpairs the agent from your
Fing account and discovery starts over from nothing.

## Updating

1. Check for a newer tag on Docker Hub.
2. Update the tag **and** its multi-arch index digest in `docker-compose.yml`:

   ```bash
   docker buildx imagetools inspect fing/fing-agent:X.Y.Z \
     --format '{{.Manifest.Digest}}'
   ```

3. Bump `version` and `releaseNotes` in `umbrel-app.yml`.
4. Refresh the alt store in Umbrel.

Upstream publishes infrequently — `1.1.1` dates from January 2025 — so expect
long gaps between releases rather than a stalled package.
