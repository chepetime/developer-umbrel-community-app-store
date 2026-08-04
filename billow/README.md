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
ghcr.io/chepetime/billow:v0.1.43@sha256:56847f29f16a48736e9c02bcbc6750973409a693780d2455dd98ea45923b66ef
```

Keep `id: billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
