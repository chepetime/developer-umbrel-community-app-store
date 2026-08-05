# PairDrop

Browser-to-browser file transfer between any two devices. Pinned at `1.11.2`
(LinuxServer.io image).

## Use

Open `http://umbrel.local:46257` on both devices. Devices on the same network
see each other automatically; drag a file onto the other device's icon.

For devices elsewhere, use **Pair Device** for a six-digit code, or a room
link. Text and links can be sent the same way.

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
