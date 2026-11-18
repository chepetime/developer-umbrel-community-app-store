---
name: umbrel-app
description: Add an app to this Umbrel store or release an update to one. Use when asked to add, package or repackage an app (often just a GitHub URL), or to bump, release or publish a new version.
---

# Add or release an Umbrel app

`AGENTS.md` holds every rule and the reason behind it. This skill is the
order of work. A section name in quotes below is a heading in `AGENTS.md`.
Read it when the step touches it, because most of these rules fail
**silently**: the app is missing from the store, the install "fails" with no
error, or data lands in the wrong place.

`check-app.sh` in this folder lints a package against the silent-failure
rules. Run it from anywhere in the repo:

```bash
.claude/skills/umbrel-app/check-app.sh chepetime-<name>   # or --all
```

## Add an app

1. **Read upstream before writing anything.** Fetch its README, compose
   file, Dockerfile and env example:
   `gh api repos/<owner>/<repo>/contents/<path> --jq .content | base64 -d`.
   Then read the *source* for anything the package will rely on: how a key
   is parsed, whether proxy headers are trusted, whether an address variable
   tolerates being unset. Plane's sign-up 500 ("Plane Store Contract") is
   what guessing costs.
   **Done when** you can name, each backed by a file you read: the stable
   image tag, the uid the image runs as, every state path, every
   environment variable you will set, any baked-in proxy config, and every
   route called by something other than a logged-in browser (e-readers,
   CLIs, webhooks, OAuth callbacks).

2. **Pin the image.** Take the newest stable release tag, never `latest`,
   `main` or `dev` unless upstream publishes nothing else.
   `docker buildx imagetools inspect <image>:<tag>` gives the index digest.
   Watch for a GHCR tag spelled differently from the GitHub release
   (`0.2.1` against `v0.2.1`).
   **Done when** the pin is `<tag>@sha256:<index digest>` and the inspect
   output lists both `linux/amd64` and `linux/arm64`.

3. **Allocate a port.** Take the next free `362xx` (see "Current Apps",
   and the 40000–49999 reservation explained there), then check the host:

   ```bash
   ssh umbrel 'cat ~/umbrel/app-stores/*/*/umbrel-app.yml | grep -E "^port:" | sort -u; ss -lntu'
   ```

   **Done when** the port is in neither list.

4. **Write `chepetime-<name>/`, starting from the closest existing app:**
   - one stateless container: `chepetime-drawio`
   - one container with state: `chepetime-crosspoint-sync`, or
     `chepetime-calibre-web-automated` for shared storage
   - several services behind a gateway: `chepetime-itsaplan`, or
     `chepetime-multica`

   Use the house conventions, each explained in its `AGENTS.md` section:
   - **ID:** the ID equals the directory name and starts with
     `chepetime-` ("Every app ID must start with the store ID").
   - **State:** `storage: dataRoot: data`, with every stateful mount under
     `${APP_DATA_DIR}/data`. Ship `data/.gitkeep` (or the subdirectories)
     when the image runs as non-root ("App State Lives Under `data/`").
   - **Container names:** use qualified names
     (`chepetime-<name>_<service>_1`) wherever one service names another,
     including any proxy config baked into the image. Use hyphen-only
     network aliases where boto3 or another client rejects underscores
     ("Plane Store Contract").
   - **Shipped config files** go in `hooks/` ("Installs Copy Everything,
     Updates Copy A Whitelist").
   - **User-tunable settings** come only through the optional
     `${APP_DATA_DIR}/secrets.env` `env_file`. Keep them out of
     `environment:`, which silently beats it.
   - **Secrets** are derived from `APP_SEED` / `APP_PASSWORD`, with a fixed
     suffix that never changes.
   - **Machine-called routes** go in `PROXY_AUTH_WHITELIST`, or use
     `PROXY_AUTH_ADD: "false"` when nearly every route is machine-called
     (CrossPoint Sync).
   - **Manifest:** `gallery: []`, and the icon chosen per "App icons".
   - **Store copy:** the description states every caveat a user must know
     before installing, such as https requirements, open registration, or
     data sent to third parties.
   - **README:** sections for use, configuration, data and updating.
   - **Compose comments:** explain every deviation from upstream's compose.
     They are what stops the next edit from "fixing" it back.

   **Done when** `check-app.sh chepetime-<name>` prints only `ok`, apart
   from the two "not listed" lines that step 6 clears.

5. **Run it locally.** Use the pinned image with the package's environment
   (`docker run`, or `docker compose --compatibility` without `app_proxy`
   for several services). Exercise the core flow end to end over HTTP:
   sign up, sync, upload, whatever the app is for. Then read the logs.
   **Done when** the core flow succeeded, the logs are clean, and the
   containers and scratch data are removed.

6. **Document it.**
   - `AGENTS.md`: a line under "Current Apps", plus a
     "<Name> Store Contract" and an "Updating <Name>" section covering every
     non-obvious choice and anything found in steps 1 and 5.
   - Root `README.md`: a table row.
   - `POLICIES` in `scripts/check-image-updates.ts`, when the default
     `minor` is wrong: `digest` for rolling tags and databases, `skip` for
     images that release in lockstep or are built from our own source.

   **Done when** `check-app.sh --all` passes and
   `pnpm check-images --app <name>` reports every pin current.

7. **Publish.** Commit as `<Name> X.Y.Z: add the app`. Run
   `git pull --rebase origin master` first, because the nightly bot pushes
   to `master`, then push. **Done when** `git log origin/master` shows the
   commit. The store picks it up within five minutes ("Umbrel Debugging").

## Release an update

Pick the branch for the app, then finish with the publish step from above
(`pull --rebase`, push).

- **Third-party image, single release line:** run
  `pnpm check-images:release --app <name>`. It moves the pin, version and
  release notes, commits, and pushes. Nothing else is needed.
- **Third-party images that release in lockstep** (Plane, It's a Plan,
  Multica): follow "Updating <Name>". Move every pin of the release
  together.
- **Our own apps:** Billow uses `scripts/bump-billow.sh`. Goose and Drip
  follow "Updating Goose" and "Updating Drip": publish the image from the
  source repo first, then pin it here.
- **Packaging-only change** (compose, hooks or manifest, with the same
  image): add or increment a `-N` revision on `version`. Umbrel offers an
  update only when the version string changes. Hooks stay `100755`.
- **Icon or README only:** no version bump. The listing reads them
  straight from the repo.

Release notes replace the previous block. Write one sentence on what changed
in the version being offered. Run `check-app.sh <app>` before pushing.

If an install then fails on the host, go to "Umbrel Debugging" before
changing the package.
