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
ghcr.io/chepetime/billow:v0.1.42@sha256:464fc84ef077e0c7e1f1c81536f383f408a5dafa3a4d696ee5d8f6741d21429c
```

Keep `id: billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
