# MiroTalk P2P

Browser video calls with no accounts. Pinned at `1.9.15` by digest — upstream
publishes only a rolling `latest`.

## Why this one

Media goes browser to browser. The container serves the page and introduces
the peers over socket.io; the call itself never touches it.

That matters because everything here is reached through a Cloudflare Tunnel,
and a tunnel carries HTTP and WebSocket only. Jitsi, plugNmeet and anything
else built on an SFU need their media leg to arrive as UDP at the server —
Jitsi's is UDP 10000 — which a tunnel cannot deliver. The symptom is a room
that loads, lists everyone, and stays silent. MiroTalk P2P has no media leg to
deliver, so the problem does not exist.

The cost is that it is a mesh. Each browser uploads its own stream once per
other participant, so four people is comfortable and six is about the limit on
home upstream. It is a tool for talking to friends, not for running a webinar.

## It needs https before it works at all

Cameras and microphones come from `getUserMedia`, and browsers only grant that
on a secure origin. Opened at `http://umbrel.local:46260` the page loads, the
room opens, and no devices are ever found. This is not a misconfiguration to
debug; it is the browser refusing, and there is no server-side fix.

So the LAN address is only good for checking that the app started. Real use
needs a tunnel or Tailscale Serve in front.

## Exposing it

The tunnel points at the container, not at the published port:

```yaml
- hostname: meet.example.com
  service: http://chepetime-mirotalk_server_1:3000
```

A tunnel aimed at `umbrel.local:46260` lands on Umbrel's `app_proxy`, whose
login redirects to the dashboard on another origin and does not survive the
trip — and guests would not have an Umbrel password anyway.

**Going straight to the container skips Umbrel's login entirely.** Whatever is
at that hostname is open to anyone who reaches it, which for a public tunnel
means anyone who guesses the name. Out of the box this app has no auth at all:
that is the point — your friends open a link and are in — but it also means a
stranger who finds the hostname can open rooms on your bandwidth, and could
walk into a room whose name they guess. Room names are the only secret, so let
the app generate them rather than using `meet.example.com/family`.

If that is too open, see host protection below.

## Per-host settings live in secrets.env

Config resolves in this order:

```text
environment: in docker-compose.yml   >   secrets.env   >   the .env baked into the image
```

The image ships upstream's `.env.template` as `/src/.env`, and `dotenv` never
overwrites a variable that is already set, so anything not named in the compose
file is yours to set. `secrets.env` is touched by neither an install nor an
update, which makes it the only durable place for values that must not be
committed to a public store:

```bash
ssh umbrel
umask 077
nano ~/umbrel/app-data/chepetime-mirotalk/secrets.env
```

Restart the app afterwards.

### Host protection — the useful middle setting

```ini
HOST_PROTECTED=true
HOST_USER_AUTH=false
HOST_USERS='[{"username": "jose", "password": "something-long"}]'
JWT_KEY=another-long-random-string
```

This asks for a password **only to open a room that does not exist yet**
(`server.js`: `authRequired = user_auth || peer_token || (protected && isRoomNew)`).
You log in and start the call; everyone joining the room you opened needs
nothing. Guests stay anonymous, strangers cannot spin up rooms.

Setting `HOST_USER_AUTH=true` as well would demand a password from every
joiner, which defeats the purpose here.

One caveat: upstream tracks this with a single process-wide `hostCfg.authenticated`
flag rather than per session, so it is coarse — it gates room creation, it is
not a security boundary between users. `JWT_KEY` is worth overriding regardless,
since its default is published in upstream's env template.

### TURN, for the friend who cannot connect

Peer to peer usually connects straight through a home NAT with STUN alone. It
fails behind symmetric NAT and carrier-grade NAT, which is common on mobile
networks, and that person sees everyone else while nobody sees them.

The fix is a TURN relay. The image's baked default points at Metered's shared
openrelay credentials — published in upstream's template, so shared with the
whole internet and rate-limited accordingly. Fine as a fallback, not something
to rely on. Replace it with your own:

```ini
TURN_SERVER_ENABLED=true
TURN_SERVER_URL=turn:your-turn-host:3478
TURN_SERVER_USERNAME=...
TURN_SERVER_CREDENTIAL=...
```

Cloudflare's hosted TURN service fits this setup well: it needs no open port
here, and it is already the vendor terminating the tunnel. Running coturn on
the Umbrel also works but wants one forwarded UDP port, which is the thing
this app was picked to avoid.

A relayed call is still end-to-end encrypted — TURN forwards DTLS packets it
cannot read — but it is a third party seeing that a call happened, and it adds
a hop of latency. Set it and forget it; WebRTC only uses it when the direct
path fails.

Verify a candidate at
<https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>.

## What the packaging changed

Upstream's defaults assume a public instance run by MiroTalk. Turned off here:
usage analytics loaded from `stats.mirotalk.com` into every visitor's page, the
QuestionPro survey guests are redirected to on hang up, and IP geolocation of
each peer via geojs.io.

The REST API is disabled outright (`API_DISABLED` covering all six endpoints
`server.js` gates). Upstream disables two of the six and leaves the rest behind
an `API_KEY_SECRET` whose default value is in the published template. Nothing
in a personal install calls them.

`ROOM_MAX_PARTICIPANTS` is 8, down from upstream's 1000 — an SFU number that
means nothing in a mesh.

## Data

None. No volumes, no database, no recordings kept server-side; recordings save
to the recording browser's downloads. Rooms exist while someone is in them.
Nothing to back up, and reinstalling costs nothing but `secrets.env`.

## Updating

`latest` is the only tag upstream publishes and the git repository carries no
tags, so the digest is the entire pin — the same situation as Tinyauth's `v5`.
`scripts/check-image-updates.ts` holds it at `digest` policy and follows the
digest, adding a `-N` store revision because there is no tag to read a version
from. The `version:` in the manifest is upstream's `package.json` version at
the time of pinning and has to be corrected by hand when it drifts.
