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
ghcr.io/chepetime/billow:v0.1.38@sha256:e1d9c9a7286ce56181973ff61c7440d4a5475eccd8347cfb7cbe3fa7a2020007
```

Keep `id: billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
