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
ghcr.io/chepetime/billow:v0.1.41@sha256:11c72b2dc1976e11bf18d4976464f7135a0cadf1dfe53bc3fa23fd68177068b9
```

Keep `id: billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
