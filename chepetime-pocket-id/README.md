# Pocket ID

A small OIDC provider that signs you in with passkeys. Pinned at `2.12.0`.

## Read this first: it needs https

Passkeys are WebAuthn, and browsers only expose WebAuthn in a **secure
context** — https, or `localhost`. `http://umbrel.local:46251` is neither, so
passkey registration silently fails there. The app starts and the UI loads;
you simply cannot enrol.

You already run two things that fix this:

- **Tailscale Serve** — gives the app an https address on your tailnet.
- **Cloudflare Tunnel** — gives it a public https hostname.

Pick one, then set `APP_URL` to that address on the Umbrel host in
`~/umbrel/app-data/chepetime-pocket-id/docker-compose.yml`, and restart.

**Choose the address before you enrol anyone.** Passkeys are bound to the
origin in `APP_URL`; changing it later invalidates every passkey already
registered.

## First run

The first account created becomes the admin. After that:

1. Add users, and have each register a passkey from their own device.
2. Add an OIDC client per application you want to connect. Pocket ID gives you
   a client ID and secret; the application asks for those plus the issuer URL,
   which is your `APP_URL`.

Apps you already run that speak OIDC: Gitea, Docmost, Immich, Karakeep.

## Encryption key

`ENCRYPTION_KEY` is wired to Umbrel's `${APP_SEED}` — a 64-character secret
unique to this installation, never published. It encrypts the stored private
keys.

Do not change it after first start. The existing database cannot be read with
a different key.

## Data

```text
${APP_DATA_DIR}/data
```

SQLite database, OIDC signing keys, uploaded logos. Back this up; losing it
means re-enrolling every passkey and reconfiguring every client.

## Updating

```bash
docker buildx imagetools inspect ghcr.io/pocket-id/pocket-id:vX.Y.Z \
  --format '{{.Manifest.Digest}}'
```

Update tag and digest together in `docker-compose.yml`, bump `version` and
`releaseNotes` in `umbrel-app.yml`.
