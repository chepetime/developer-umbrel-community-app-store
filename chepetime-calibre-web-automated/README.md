# Calibre-Web Automated

Calibre-Web with an ingest pipeline in front. Pinned at `v4.0.6`.

## The two folders

This is the only thing worth understanding before using it.

```text
~/umbrel/home/Downloads/books-ingest       drop zone — EMPTIED AS IT WORKS
~/umbrel/home/Downloads/calibre-library    the managed library — back this up
${APP_DATA_DIR}/config                     users, settings, Calibre binaries
```

Put a file in **books-ingest** and CWA converts it, fetches metadata and a
cover, files it into **calibre-library** under Calibre's own author/title
layout, and **deletes the original**. That deletion is the design, not a bug —
the ingest folder is a conveyor belt, not storage.

The library is a real Calibre library with a `metadata.db`, so desktop Calibre
and anything else that speaks the format can open it directly.

Both folders show up in Umbrel's Files app under Downloads, so dropping books
in needs no shell.

## Your existing books folder is not wired up

`Downloads/books` already holds 38 loose files — mixed epub, pdf, cbz, plus a
`.pptx` and a stray jpeg. It is **not** mounted into this app, on purpose. If
it were the ingest folder, CWA would consume and delete the lot, comics
included, and choke on the files that are not books.

To import it, copy rather than move, in batches you have looked at:

```bash
ssh umbrel
cd ~/umbrel/home/Downloads
cp books/*.epub books-ingest/
```

Watch the library fill, confirm the results, then delete the originals
yourself. The `.cbz` files belong to Kapowarr and should not go anywhere near
this.

## First start is slow

CWA installs Calibre's conversion binaries on first boot. The container's own
healthcheck allows 120 seconds before it even starts checking, and on a busy
box it can take several minutes before the web UI answers. It is not stuck.

## Log in and change the password immediately

```text
username: admin
password: admin123
```

This matters more here than on most apps, because OPDS and Kobo sync are
exempt from Umbrel's login — see below. Until the default password is changed,
anyone on the LAN can read the library through an OPDS client.

## E-readers: OPDS and Kobo

Both are called by software that cannot answer Umbrel's login page, so
`PROXY_AUTH_WHITELIST` exempts them:

```text
/opds, /opds/*, /kobo/*, /kobo_auth/*
```

They keep their own auth — OPDS asks for a Calibre-Web username and password,
Kobo sync carries a per-user token in the URL — but Umbrel's blanket login no
longer sits in front. That is the trade the store's other machine-called apps
make too (Threadfin's tuner endpoints, Pocket ID's OIDC discovery).

The OPDS feed is at `/opds`. For Kobo, generate the sync URL per user in the
Calibre-Web user settings.

## Exposing it

Same shape as the other apps here — point the tunnel at the container, not the
published port:

```yaml
- hostname: books.example.com
  service: http://chepetime-calibre-web-automated_server_1:8083
```

That skips Umbrel's login entirely, so the app's own auth is all that stands
in front of it. Change the admin password *before* adding the hostname, not
after.

If a second proxy ever ends up chained in front, set `TRUSTED_PROXY_COUNT` in
`secrets.env` — otherwise leave it, since one proxy is correct whether traffic
comes via `app_proxy` or straight from cloudflared.

## secrets.env

Not in the app template and not in the update whitelist, so neither an install
nor an update touches it:

```bash
ssh umbrel
umask 077
nano ~/umbrel/app-data/chepetime-calibre-web-automated/secrets.env
```

Nothing is required. What belongs there:

```ini
HARDCOVER_TOKEN=...        # enables Hardcover as a metadata provider
TRUSTED_PROXY_COUNT=2      # only if a second proxy is chained in front
NETWORK_SHARE_MODE=true    # only for an NFS/SMB library, which this is not
```

None of these appear under `environment:` in the compose file, because a name
declared there beats `env_file` silently.

## Backups

Back up `calibre-library` — it is the books and the `metadata.db` that
describes them. `config` is worth keeping for users and settings but can be
rebuilt. `books-ingest` should be empty most of the time; anything sitting in
it is either mid-processing or failed to process.

## Updating

Upstream's tag scheme changed case at 4.0 — `V3.1.4` but `v4.0.6` — and it
publishes a stream of `dev-NNN` builds alongside. `latest` currently points at
a dev build months ahead of the last stable release, which is why the pin is
the explicit stable tag. `scripts/check-image-updates.ts` runs the default
`minor` policy, so it follows `v4.x` and will report a 5.0 as held back.
