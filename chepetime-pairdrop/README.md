# PairDrop

Browser-to-browser file transfer between any two devices. Pinned at `1.11.2`
(LinuxServer.io image).

## Use

Open `http://umbrel.local:46257` on both devices. Devices on the same network
see each other automatically; drag a file onto the other device's icon.

For devices elsewhere, use **Pair Device** for a six-digit code, or a room
link. Text and links can be sent the same way.

## Why it is not on host networking

This looks like an app that needs host networking to find devices on the LAN.
It does not, and switching it would break discovery.

PairDrop has no mDNS or broadcast discovery. The server groups peers into a
room keyed by the IP address it sees on their **WebSocket** connection:

```js
// server/ws-server.js
this._joinRoom(peer, 'ip', peer.ip);

// server/peer.js — x-forwarded-for if present, else the socket address
_setIP(request) { … }
```

Umbrel's `app_proxy` sets `x-forwarded-for` on HTTP requests but **not** on
WebSocket upgrades, and runs with `xfwd: false`
(`containers/app-proxy/utils/proxy.js`). So PairDrop sees the proxy's own
address for every client, puts them all in one room, and they find each other.

On `network_mode: host`, each device would connect with its own
`192.168.x.x`, land in a room of one, and see nobody. Upstream's IP grouping
is built for public instances, where every device behind your router shares
one public IP — self-hosting on the LAN inverts that assumption.

If a future Umbrel release forwards client IPs on WebSocket upgrades,
automatic discovery here stops working. **Pair Device** and room links do not
depend on it and will keep working.

## Two settings that differ from upstream

- `WS_FALLBACK=true` — transfers normally go peer to peer over WebRTC and
  never touch this server. When a network blocks that (client isolation on an
  access point, separate VLANs), this relays through the server instead of
  failing. Slower, but it works.
- `RATE_LIMIT=false` — behind Umbrel's app proxy every request appears to come
  from the proxy, so the limiter would throttle all clients together.

## Data

None. PairDrop keeps nothing on disk — there is nothing to back up, and
uninstalling loses nothing.

## Updating

```bash
docker buildx imagetools inspect linuxserver/pairdrop:X.Y.Z \
  --format '{{.Manifest.Digest}}'
```
