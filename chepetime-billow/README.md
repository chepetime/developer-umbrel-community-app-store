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
ghcr.io/chepetime/billow:v0.1.4@sha256:bfa391fe44f619b6f9e9e6b658d8323513f393f8cf04f71ec42f52d8ca70281b
```

Keep `id: chepetime-billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
