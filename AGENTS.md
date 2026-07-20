# Repository Notes

This repository is an Umbrel Community App Store named `Sparkles`.

Umbrel reads this repository as a store. It does not build app source from here.
Each app directory should contain only the Umbrel package files needed for
installation:

- `umbrel-app.yml`
- `docker-compose.yml`
- optional store-facing `README.md`
- static store assets, if needed

## Current Apps

- `sparkles-billow`: Billow, a personal invoices app.

The Billow app source now lives in:

```text
/Users/jlugo/Projects/personal/billow
```

## Billow Store Contract

Keep the app ID stable for existing installs:

```yaml
id: sparkles-billow
```

The store package currently points at:

```yaml
image: ghcr.io/chepetime/billow:v0.1.6
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
on the Umbrel host, leaving `sparkles-billow_app_proxy_1` in `Created`.

## Updating Billow

1. Make app changes in `/Users/jlugo/Projects/personal/billow`.
2. Publish a new image tag from the Billow repo.
3. Update `sparkles-billow/docker-compose.yml` to the new image tag.
4. Bump `version` and `releaseNotes` in `sparkles-billow/umbrel-app.yml`.
5. Commit and push this store repo.
6. Refresh the alt store in Umbrel.

Do not add the Billow Next.js source, `node_modules`, `.next`, Prisma generated
files, or Docker build workflow back into this store repo.

## Umbrel Debugging

If an app appears in the store but install fails, the store metadata is loading.
Check the app containers on the Umbrel host:

```bash
sudo docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
sudo docker logs sparkles-billow_server_1 --tail 200
sudo docker logs sparkles-billow_db_1 --tail 120
sudo docker inspect sparkles-billow_app_proxy_1 --format '{{json .State}}'
```

Common Billow install failures seen so far:

- GHCR image tag does not exist yet.
- GHCR package is private.
- `docker-compose.yml` image tag does not match the published tag.
- App container exits while waiting for Postgres or applying migrations.
- `app_proxy` cannot bind the configured host port.

Billow production startup runs migrations, then `next start`. It intentionally
does not run seed data during startup.
