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
ghcr.io/chepetime/billow:v0.1.2@sha256:c95277999b6299009d8992e28e6cabd3fb571b74149c104934251fb0734f911a
```

Keep `id: chepetime-billow` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.
