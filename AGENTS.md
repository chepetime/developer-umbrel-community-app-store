# Repository Notes

This repository is an Umbrel Community App Store named `José Lugo`, displayed
in the Umbrel UI as "José Lugo App Store". The store `id` stays `billow`:
changing it would make Umbrel treat this as a different store.

Umbrel reads this repository as a store. It does not build app source from here.
Each app directory should contain only the Umbrel package files needed for
installation:

- `umbrel-app.yml`
- `docker-compose.yml`
- optional store-facing `README.md`
- static store assets, if needed

## Current Apps

- `billow`: Billow, a personal invoices app.

The Billow app source now lives in:

```text
/Users/jlugo/Projects/personal/billow
```

Remote:

```text
https://github.com/chepetime/billow
```

The split is complete:

- Billow app repo initial commit: `3c9fc0d Initial Billow app`.
- Store cleanup commit: `fc89fe7 Move Billow source to app repo`.
- Billow publish workflow rerun `29778177872` completed successfully after the
  GHCR package was granted write access for `chepetime/billow`.

## Billow Store Contract

Keep the app ID stable for existing installs:

```yaml
id: billow
```

The store package currently points at:

```yaml
image: ghcr.io/chepetime/billow:v0.1.15
```

Keep the Postgres data path stable so image updates do not wipe user data:

```yaml
volumes:
  - ${APP_DATA_DIR}/postgres:/var/lib/postgresql/data
```

The current Umbrel host port is:

```yaml
port: 46247
```

Earlier installs failed because the template port `4000` was already allocated
on the Umbrel host, leaving `billow_app_proxy_1` in `Created`.

## Updating Billow

1. Make app changes in `/Users/jlugo/Projects/personal/billow`.
2. Publish a new image tag from the Billow repo's
   `.github/workflows/publish.yml`.
3. Run `scripts/bump-billow.sh` to bump the version everywhere, commit, and
   push. It takes `patch` (default), `minor`, `major`, or an explicit `X.Y.Z`,
   plus optional `-n "release notes"`, `--no-push`, and `--dry-run`.
4. Refresh the alt store in Umbrel.

The script keeps the version in sync across `umbrel-app.yml`,
`docker-compose.yml`, `billow/README.md`, and this file, and commits
as `Billow Release X.Y.Z`.

Before changing anything it queries GHCR and aborts if the target tag is not
published, since pointing the store at a missing tag is the most common install
failure. Pass `--skip-image-check` to bump ahead of the build. If GHCR cannot be
reached the check warns and continues rather than blocking.

Do not add the Billow Next.js source, `node_modules`, `.next`, Prisma generated
files, or Docker build workflow back into this store repo.

## Umbrel Debugging

If an app appears in the store but install fails, the store metadata is loading.
Check the app containers on the Umbrel host:

```bash
sudo docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
sudo docker logs billow_server_1 --tail 200
sudo docker logs billow_db_1 --tail 120
sudo docker inspect billow_app_proxy_1 --format '{{json .State}}'
```

Common Billow install failures seen so far:

- GHCR image tag does not exist yet.
- GHCR package is private.
- GHCR package exists but the publishing repo lacks package write access.
- `docker-compose.yml` image tag does not match the published tag.
- App container exits while waiting for Postgres or applying migrations.
- `app_proxy` cannot bind the configured host port.

Billow production startup runs migrations, then `next start`. It intentionally
does not run seed data during startup.
