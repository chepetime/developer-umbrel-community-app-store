# Repository Notes

This repository is an Umbrel Community App Store. It currently contains one app:

- `sparkles-billow`: Billow, a personal invoices baseline app.

Umbrel reads this repository as a store. Umbrel does not build the app from this
repository when installing. It reads `sparkles-billow/umbrel-app.yml` and
`sparkles-billow/docker-compose.yml`, then pulls the Docker images referenced in
Compose.

## Official Umbrel App Patterns Checked

Reference repo:

```text
https://github.com/getumbrel/umbrel-apps
```

Important findings from the official repo:

- Each top-level directory is an app package consumed by umbrelOS.
- App packages use `docker-compose.yml` plus `umbrel-app.yml`.
- The `app_proxy` service sets `APP_HOST` and `APP_PORT`; the actual web app
  service does not need to expose the proxied port directly.
- Official packages usually pin application images by digest:

  ```yaml
  image: owner/image:version@sha256:<multi-arch-digest>
  ```

- Apps with databases persist data under `${APP_DATA_DIR}`, not a plain Docker
  named volume.
- Example official Postgres pattern from Docmost:

  ```yaml
  db:
    image: postgres:<version>@sha256:<digest>
    user: "1000:1000"
    volumes:
      - ${APP_DATA_DIR}/data/db_data:/var/lib/postgresql/data
  ```

- Example official finance/database pattern from Firefly III:

  ```yaml
  db:
    image: mariadb:<version>@sha256:<digest>
    user: "1000:1000"
    volumes:
      - ${APP_DATA_DIR}/data/mysql:/var/lib/mysql
  ```

Current Billow follows the important local-store pieces:

- top-level package directory: `sparkles-billow`
- proxied web service through `app_proxy`
- database data persisted under `${APP_DATA_DIR}/postgres`
- app image pulled from GHCR rather than built by Umbrel

Still to improve before treating this like a polished distributable app:

- Replace placeholder gallery screenshots.
- Replace placeholder icon.
- Consider adding `user: "1000:1000"` to services if runtime file ownership
  requires it on Umbrel.
- Pin the Billow image and Postgres image by digest after publishing and testing.
- Consider moving app source into a separate app repo later, leaving this repo as
  only the Umbrel store package.

## Current App Shape

Billow lives at `sparkles-billow`.

Important files:

- `sparkles-billow/umbrel-app.yml`: Umbrel listing metadata.
- `sparkles-billow/docker-compose.yml`: Umbrel runtime services.
- `sparkles-billow/Dockerfile`: Image build for the Next.js app.
- `sparkles-billow/app`: Next.js app source.
- `sparkles-billow/app/prisma/schema.prisma`: Prisma schema.
- `sparkles-billow/app/prisma/migrations`: SQL migrations.
- `sparkles-billow/app/prisma/seed.mjs`: Seed data for app metadata.
- `.github/workflows/publish-billow.yml`: Builds and pushes the app image to GHCR.

The Compose file currently pulls:

```yaml
image: ghcr.io/chepetime/billow:v0.1.3
```

The app ID is:

```yaml
id: sparkles-billow
```

## Local Install

Run commands from `sparkles-billow/app` unless stated otherwise.

Install dependencies:

```bash
npm install
```

Generate Prisma Client:

```bash
npm run db:generate
```

Prisma uses `DATABASE_URL`. Local examples are in:

```text
sparkles-billow/app/.env.example
```

Current local URL shape:

```bash
DATABASE_URL="postgresql://billow:billow-password@localhost:5432/billow?schema=public"
```

## Local Database

For local app development, start a compatible Postgres database. One simple
option is:

```bash
docker run --rm \
  --name billow-postgres \
  -e POSTGRES_DB=billow \
  -e POSTGRES_USER=billow \
  -e POSTGRES_PASSWORD=billow-password \
  -p 5432:5432 \
  postgres:16-alpine
```

Then run migrations and seed:

```bash
npm run db:migrate
npm run db:seed
```

The seed uses `upsert`, so it is safe to run more than once.

## Run Locally

Start the Next.js dev server:

```bash
npm run dev
```

Useful routes:

- `/`: Server Component renders app metadata from Postgres.
- `/api/metadata`: Next.js API route returns metadata JSON from Prisma.

## Verify Locally

Run:

```bash
npm run lint
npm run build
npx prisma validate
```

`npm run build` intentionally uses:

```bash
prisma generate && next build --webpack
```

Webpack is used instead of the default Turbopack path because Turbopack hit a
sandbox port-binding failure in this local Codex environment during CSS
processing.

## Docker Build

Build locally from the repository root:

```bash
docker build -t ghcr.io/chepetime/billow:v0.1.3 sparkles-billow
```

Multi-arch build and push:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t ghcr.io/chepetime/billow:v0.1.3 \
  -t ghcr.io/chepetime/billow:latest \
  --push \
  sparkles-billow
```

The GitHub Actions workflow does this automatically on pushes to `master` or
`main` when files under `sparkles-billow/**` or the workflow itself change.

## GHCR Publishing

Workflow:

```text
.github/workflows/publish-billow.yml
```

It publishes:

```text
ghcr.io/chepetime/billow:v0.1.3
ghcr.io/chepetime/billow:latest
```

The package must be publicly pullable for Umbrel to install it without registry
credentials. If Umbrel install fails with an image pull error, check the GHCR
package visibility first.

Useful checks:

```bash
gh run list --workflow publish-billow.yml --limit 3
gh run view <run-id> --log-failed
```

Prisma 7 reads the seed command from `prisma.config.ts`, not from the old
`package.json` `prisma.seed` field. Use a plain Node seed script for the
production container:

```ts
migrations: {
  path: "prisma/migrations",
  seed: "node prisma/seed.mjs",
}
```

Using only `tsx prisma/seed.ts` failed on Umbrel with `spawn tsx ENOENT` because
Prisma did not resolve `node_modules/.bin` for the spawned seed process. Using
`./node_modules/.bin/tsx prisma/seed.ts` avoided that path issue, but `tsx` also
uses IPC that can fail under restrictive local sandboxes. The current
`prisma/seed.mjs` uses `pg` directly, which is simpler for startup seeding.

The first successful image publish was run `29771639783`. It built both
`linux/amd64` and `linux/arm64` and eventually completed successfully after
about 9 minutes, but the arm64 build appeared stuck at the Next.js build line for
several minutes:

```text
▲ Next.js 16.2.10 (webpack)
Creating an optimized production build ...
```

That slowness was QEMU emulation for arm64 on GitHub's amd64 runner. For faster
iteration, commit `43ff921` changed the workflow to publish only `linux/amd64`.
If the target Umbrel device is ARM-based, restore `linux/arm64` or use a native
ARM runner.

## GitHub Actions Build Note

The workflow currently builds only `linux/amd64` so installs move quickly on the
current Umbrel target. If `linux/arm64` is added back later, GitHub-hosted amd64
runners will build the arm64 image under QEMU emulation, so the arm64
`next build` step can appear stuck for several minutes at:

```text
▲ Next.js 16.2.10 (webpack)
Creating an optimized production build ...
```

That can be normal for multi-arch builds. Wait for the workflow result before
changing code. If it eventually fails, inspect logs with:

```bash
gh run view <run-id> --log-failed
```

The previous image build failure was caused by `DATABASE_URL` being required at
module import time during `next build`. That was fixed by lazy-initializing
Prisma in `sparkles-billow/app/src/lib/prisma.ts`.

## Runtime Startup

The container starts with:

```text
sparkles-billow/app/scripts/start.sh
```

Startup sequence:

```bash
prisma migrate deploy
prisma db seed
npm run start
```

The script retries migrations while Postgres is starting.

## Umbrel Persistence

Do not use a Docker named volume for the database in the Umbrel store app.
Persist Postgres under Umbrel's app data directory:

```yaml
volumes:
  - ${APP_DATA_DIR}/postgres:/var/lib/postgresql/data
```

This lets Docker image updates replace the app container while keeping database
files in Umbrel-managed app data.

## Get It Into Umbrel

Current path:

1. Push this store repository to GitHub.
2. GitHub Actions builds and pushes `ghcr.io/chepetime/billow:v0.1.3`.
3. Confirm the GHCR package is public.
4. In Umbrel, add this repository as a Community App Store if it is not already
   added.
5. Refresh the community app store in Umbrel.
6. Open Billow and click Install.

If the app appears in Umbrel but install fails, the store metadata is working.
The failure is usually one of:

- The GHCR image does not exist yet because the workflow is still running or
  failed.
- The GHCR image exists but is private.
- The image tag in `docker-compose.yml` does not match the published tag.
- The app container starts but exits because migrations or seed cannot connect
  to Postgres.

In this session, Umbrel successfully showed the Billow listing from the alt
store after pushing the store repo. The install button failed before publishing
the GHCR image because the original Compose image was only:

```yaml
image: sparkles-billow:latest
```

Umbrel does not build that local image from the store repo. The fix was to add a
GHCR publish workflow and change Compose to:

```yaml
image: ghcr.io/chepetime/billow:v0.1.3
```

## Release/Update Flow

For a new app version:

1. Make app changes under `sparkles-billow/app`.
2. Bump image tag in `.github/workflows/publish-billow.yml`.
3. Update `sparkles-billow/docker-compose.yml` to the same image tag.
4. Bump `version` and `releaseNotes` in `sparkles-billow/umbrel-app.yml`.
5. Run local checks:

   ```bash
   cd sparkles-billow/app
   npm run lint
   npm run build
   npx prisma validate
   ```

6. Commit and push.
7. Wait for the publish workflow to complete.
8. Refresh the store in Umbrel and update/install the app.

## Future Repo Split

This repo can remain only the Umbrel store later. A cleaner long-term split is:

```text
billow/
  app source
  Dockerfile
  Prisma schema
  tests
  image publishing workflow

developer-umbrel-community-app-store/
  umbrel-app-store.yml
  sparkles-billow/
    docker-compose.yml
    umbrel-app.yml
```

In that split, this store repo only references a published Billow image. It
should not need Node dependencies, app source, Prisma schema, or Dockerfile.
