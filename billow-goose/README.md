# Goose Umbrel Package

This directory is the Umbrel store package for Goose.

The app source lives in:

```text
/Users/jose/Projects/personal/umbrel-goose
```

Umbrel installs Goose by reading:

- `umbrel-app.yml`
- `docker-compose.yml`

It then pulls the published image:

```text
ghcr.io/chepetime/goose:v0.1.0@sha256:266b8c54b46cdc52af913464edb14f297e3bb148e104483b8c4928150609bb0b
```

Keep `id: billow-goose` and the Postgres volume path unchanged so existing
Umbrel installs keep their app data across image updates.

Goose is a copy of Billow renamed, restarted at 0.1.0. It binds host port
`46248` rather than Billow's `46247` so both can be installed on one host.
The two apps share no data and there is no migration path between them.
