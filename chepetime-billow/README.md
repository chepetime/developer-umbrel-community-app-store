# Billow Umbrel Package

This directory is the Umbrel store package for Billow.

The app source lives in:

```text
/Users/jose/Projects/personal/billow
```

Umbrel installs Billow by reading:

- `umbrel-app.yml`
- `docker-compose.yml`

It then pulls the published image:

```text
ghcr.io/chepetime/billow:v0.1.3@sha256:3a508e48ec3060a986033306fa2c7862260358a8820c95a859d5f85c80420757
```

Keep `id: chepetime-billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
