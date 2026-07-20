# Sparkles Umbrel App Store

This repository is a personal Umbrel Community App Store.

## Apps

- `sparkles-billow`: Billow, a personal invoices app.

## Structure

Each app directory contains only Umbrel package metadata:

- `umbrel-app.yml`
- `docker-compose.yml`
- optional store-facing `README.md`

App source code lives in separate app repositories. Billow source lives at:

```text
https://github.com/chepetime/billow
```

## Billow Updates

Publish a new Billow image from the Billow repository, then update this store:

1. Change the image tag in `sparkles-billow/docker-compose.yml`.
2. Bump `version` and `releaseNotes` in `sparkles-billow/umbrel-app.yml`.
3. Push this store repo.
4. Refresh the alt store in Umbrel.

Keep `id: sparkles-billow` and the Postgres volume path stable so existing
Umbrel installs keep their data.
