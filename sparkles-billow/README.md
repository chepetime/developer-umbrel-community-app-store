# Billow

Billow is a baseline personal invoices app for Umbrel. It uses Next.js App
Router, React Server Components, shadcn/ui, Prisma, and Postgres.

## Local app commands

Run these from `sparkles-billow/app`:

```bash
npm run db:generate
npm run lint
npm run build
```

`npm run build` runs `prisma generate` before `next build --webpack`.

## Database

The Prisma model is `AppMetadata` in `app/prisma/schema.prisma`.

Container startup runs:

```bash
prisma migrate deploy
prisma db seed
npm run start
```

The seed uses `upsert`, so restarting or updating the app image refreshes the
baseline metadata without duplicating rows.

## Persistent data

Postgres stores data under `${APP_DATA_DIR}/postgres` as declared in
`docker-compose.yml`. Updating `server.image` and recreating the app container
does not remove that app data directory.
