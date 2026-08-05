# José Lugo Umbrel App Store

This repository is a personal Umbrel Community App Store. It shows up in the
Umbrel UI as "José Lugo App Store".

## Apps

- `chepetime-billow`: Billow, a personal invoices app. Host port `46247`.
- `chepetime-goose`: Goose, a copy of Billow renamed and restarted at `0.1.0`. Host port
  `46248`.

Goose and Billow are independent: separate repositories, separate images,
separate databases. Installing one does not affect the other, and there is no
way to move data between them.

## Structure

Each app directory contains only Umbrel package metadata:

- `umbrel-app.yml`
- `docker-compose.yml`
- optional store-facing `README.md`

App source code lives in separate app repositories:

```text
https://github.com/chepetime/billow
https://github.com/chepetime/umbrel-goose
```

## Billow Updates

Publish a new Billow image from the Billow repository, then update this store:

1. Change the image tag in `chepetime-billow/docker-compose.yml`.
2. Bump `version` and `releaseNotes` in `chepetime-billow/umbrel-app.yml`.
3. Push this store repo.
4. Refresh the alt store in Umbrel.

Keep `id: chepetime-billow` and the Postgres volume path stable so existing
Umbrel installs keep their data.

## Goose Updates

The same four steps, against `chepetime-goose/` and the `chepetime/umbrel-goose`
repository. Keep `id: chepetime-goose`, host port `46248`, and the Postgres volume path
stable.

Note that `scripts/bump-billow.sh` handles Billow only; Goose is bumped by hand.
