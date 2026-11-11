# draw.io

The diagrams.net editor, self-hosted. Pinned at `32.6.10` (`jgraph/drawio`,
built by upstream from each draw.io release).

## Use

Open `http://umbrel.local:36262`. When it asks where to save, pick **Device**
to download `.drawio` files, or **Browser** to keep them in that browser's
local storage.

The server keeps nothing. A diagram saved to **Browser** lives only in that
one browser, and is gone if its site data is cleared — save anything you care
about to **Device**.

## What differs from diagrams.net

- **Cloud storage is off.** Google Drive, OneDrive, Dropbox, GitHub, GitLab
  and Trello are all disabled. Drive, OneDrive and GitLab can be turned back on
  with your own OAuth app (see below); the other three cannot.
- **No server-side export.** Upstream retired its export server. PNG, JPEG and
  SVG export run in the browser and are unaffected; **Export as > PDF** opens
  the browser's print dialog instead.
- **No AI generation** unless you configure it with your own API key in
  `DRAWIO_CONFIG` (`enableAi` plus a key and a model, per upstream's README).

Upstream describes this image as an evaluation build and sells a separate
production version. For personal use on a LAN it is the full editor.

## Configuration

Everything is optional and goes in `secrets.env`, which neither installs nor
updates touch:

```bash
nano ~/umbrel/app-data/chepetime-drawio/secrets.env
```

```bash
# Public address, with the trailing slash. Needed for OAuth integrations and
# for correct "Publish > Link" / embed URLs when reached through a tunnel.
DRAWIO_SERVER_URL=https://draw.example.com/

# Default UI language (the URL's lang= and the user's own choice still win).
DRAWIO_LANG=es

# Editor configuration, as one line of JSON.
DRAWIO_CONFIG={"defaultFonts":["Helvetica","Verdana"]}
```

Then restart the app. The full list of `DRAWIO_*` variables, including the
Google Drive, OneDrive and GitLab ones, is in
[upstream's README](https://github.com/jgraph/docker-drawio#environment-variables).
OAuth integrations need https, so they only make sense behind a tunnel.

Do not add any of these under `environment:` in the compose file: a variable
declared there silently overrides the same one from `secrets.env`.

## Data

None on the server. Uninstalling loses nothing but `secrets.env`.

## Updating

Upstream tags every draw.io release (`32.6.10`), roughly weekly, all
multi-arch. Avoid `dev` and `latest`.

```bash
docker buildx imagetools inspect jgraph/drawio:X.Y.Z \
  --format '{{.Manifest.Digest}}'
```

`pnpm check-images --app drawio` does this automatically under the default
`minor` policy.
