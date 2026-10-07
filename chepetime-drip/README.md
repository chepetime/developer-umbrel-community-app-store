# Drip Umbrel Package

This directory is the Umbrel store package for Drip, a subscription tracker.

The app source lives in:

```text
/Users/jose/Projects/personal/drip   (github.com/chepetime/umbrel-drip)
```

Umbrel installs Drip by reading `umbrel-app.yml` and `docker-compose.yml`, then
pulls the image pinned in the compose file by tag and multi-arch digest.

Keep `id: chepetime-drip` and the `data/postgres` volume path unchanged so
existing installs keep their data across image updates.

Drip is built on Goose (and so on Billow). It binds host port `46249` — Billow
uses `46247` and Goose `46248` — so all three can be installed on one host.
They share no data.
