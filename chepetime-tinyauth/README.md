# Tinyauth

A login page for services that have none. Pinned at `5.1.3`.

## Read this first: it protects nothing on its own

Tinyauth is a **forward-auth** provider. It works by having a reverse proxy
ask it about every incoming request. Umbrel's built-in `app_proxy` does not
support forward auth, and there is no reverse proxy in any app store currently
added to this Umbrel.

So installing Tinyauth alone gives you a working login page that guards
nothing. To actually use it you need one of:

- **Traefik**, **Caddy** or **nginx-proxy-manager** packaged into this store,
  with the apps you want protected routed through it, or
- an existing proxy elsewhere on your network pointed at
  `http://chepetime-tinyauth_server_1:3000/api/auth/<proxy>`.

If what you want is single sign-on for apps that already speak OIDC — Gitea
and Docmost both do — **Pocket ID** does that with no proxy involved.

## Create a user before you try to log in

`TINYAUTH_AUTH_USERS` ships empty, on purpose: a default credential in a
public repository is not a credential. Generate a bcrypt hash:

```bash
htpasswd -bnBC 10 "" 'your-password' | tr -d ':'
```

Then on the Umbrel host, edit
`~/umbrel/app-data/chepetime-tinyauth/docker-compose.yml`:

```yaml
TINYAUTH_AUTH_USERS: "jose:$2y$10$…"
```

Escape any `$` as `$$`, or Docker Compose will try to expand it as a variable.
Restart the app afterwards.

## Set the URL

`TINYAUTH_APPURL` must match the address you actually reach Tinyauth on.
It defaults to `http://umbrel.local:46250`. Change it — same file, same
restart — if you front it with Tailscale or a tunnel.

## Data

```text
${APP_DATA_DIR}/data/tinyauth.db
```

Accounts and sessions. Upstream's default puts this on the container
filesystem, where an update would erase it; this package moves it onto a
volume.

## Updating

Upstream publishes rolling major tags on GHCR (`v5`, `latest`) rather than a
tag per patch, so the digest is what pins this. To move to a newer 5.x:

```bash
docker buildx imagetools inspect ghcr.io/tinyauthapp/tinyauth:v5 \
  --format '{{.Manifest.Digest}}'
```

Update the digest in `docker-compose.yml`, and set `version` in
`umbrel-app.yml` to whatever the latest GitHub release says.
