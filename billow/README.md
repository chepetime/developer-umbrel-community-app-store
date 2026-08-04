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
ghcr.io/chepetime/billow:v0.1.0@sha256:8f49968de0ae0836a7ead27112720c28c27912e2f80a3838fb68b65cb560dae9
```

Keep `id: billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
