#!/usr/bin/env node
/**
 * Check every image pinned in this store against its registry, and optionally
 * release the updates as one commit per app.
 *
 * Every app here pins `image: name:tag@sha256:...`. Two things can go stale:
 *
 *   - the tag, when upstream publishes a newer version;
 *   - the digest, when upstream re-pushes a floating tag (`redis:8-alpine`,
 *     `tinyauth:v5`) in place.
 *
 * This checks both, using anonymous registry APIs — no Docker daemon, no login.
 *
 *   pnpm check-images                    # report only
 *   pnpm check-images:apply              # rewrite files, no commit
 *   pnpm check-images:release            # rewrite, commit per app, push
 *   pnpm check-images --app tdarr        # limit to some apps
 *   pnpm check-images --allow-major      # let tags cross a major
 *   pnpm check-images --check            # exit 1 if anything is stale
 *
 * How far a tag may move is per image, see POLICIES below. The default is
 * `minor`: newest tag inside the current major. Postgres, pgvector and Redis
 * are `digest`, because their tag *is* the major and moving it is a
 * data-directory migration, not an update. Billow, Goose and Multica are
 * `skip`; their store version is released alongside their source.
 *
 * A candidate tag is rejected unless it covers every platform the current pin
 * covers. Threadfin's `latest` is amd64-only while its version tags are
 * multi-arch, and an amd64-only pin bricks the app on a Raspberry Pi.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How far each image is allowed to move. First match wins; `*` globs.
 *   skip   - never touched here
 *   digest - keep the tag, follow the digest
 *   patch  - newest tag with the same major and minor
 *   minor  - newest tag with the same major
 *   major  - newest tag of the same shape, anything goes
 */
type Policy = "skip" | "digest" | "patch" | "minor" | "major";

const POLICIES: Array<[pattern: string, policy: Policy]> = [
  ["ghcr.io/chepetime/billow", "skip"], // released by scripts/bump-billow.sh
  ["ghcr.io/chepetime/goose", "skip"], // released with the Goose source
  ["ghcr.io/multica-ai/*", "skip"], // released with the Multica source
  ["ghcr.io/tinyauthapp/tinyauth", "digest"], // rolling v5, no per-patch tags
  ["postgres", "digest"], // a major is a data-directory migration
  ["pgvector/pgvector", "digest"], // same, and it carries the extension
  ["redis", "digest"],
  ["nginx", "minor"], // stateless proxy, nothing to migrate across 1.x
];
const DEFAULT_POLICY: Policy = "minor";

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");
const USER_AGENT = "developer-umbrel-community-app-store/check-image-updates";
const TIMEOUT_MS = 20_000;

const IMAGE_LINE = /^(\s*)image:\s*(\S+)\s*$/;
const SERVICE_LINE = /^ {2}([A-Za-z0-9_.-]+):\s*$/;

const warn = (message: string) => console.error(`warning: ${message}`);

function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

// ---------------------------------------------------------------------------
// Image references
// ---------------------------------------------------------------------------

/** A parsed `name:tag@digest` image reference. */
class Ref {
  readonly name: string;
  readonly tag: string;
  readonly digest: string | null;

  constructor(name: string, tag: string, digest: string | null) {
    this.name = name;
    this.tag = tag;
    this.digest = digest;
  }

  static parse(reference: string): Ref {
    const [beforeDigest, digest] = splitOnce(reference, "@");
    let name = beforeDigest;
    let tag = "latest";
    const lastSegment = name.slice(name.lastIndexOf("/") + 1);
    if (lastSegment.includes(":")) {
      const cut = name.lastIndexOf(":");
      tag = name.slice(cut + 1);
      name = name.slice(0, cut);
    }
    return new Ref(name, tag, digest || null);
  }

  with(tag: string, digest: string | null): Ref {
    return new Ref(this.name, tag, digest);
  }

  toString(): string {
    return `${this.name}:${this.tag}` + (this.digest ? `@${this.digest}` : "");
  }

  /** [api host, repository path] for the registry v2 API. */
  get registry(): [host: string, repo: string] {
    const head = this.name.slice(0, this.name.indexOf("/") + 1 || undefined);
    const first = this.name.split("/")[0]!;
    if (first.includes(".") || first.includes(":") || first === "localhost") {
      return [first, this.name.slice(head.length)];
    }
    return ["registry-1.docker.io", this.name.includes("/") ? this.name : `library/${this.name}`];
  }

  get policy(): Policy {
    for (const [pattern, policy] of POLICIES) {
      if (this.name === pattern || globToRegExp(pattern).test(this.name)) return policy;
    }
    return DEFAULT_POLICY;
  }
}

function splitOnce(text: string, separator: string): [string, string] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, ""] : [text.slice(0, at), text.slice(at + separator.length)];
}

// ---------------------------------------------------------------------------
// Registry client
// ---------------------------------------------------------------------------

class RegistryError extends Error {}

/** Anonymous, read-only registry v2 access with per-repository tokens. */
class Registry {
  #tokens = new Map<string, string>();

  async #fetch(host: string, repo: string, path: string, method: string, accept: string) {
    const key = `${host}/${repo}`;
    const send = (token: string | undefined) =>
      fetch(`https://${host}${path}`, {
        method,
        headers: {
          Accept: accept,
          "User-Agent": USER_AGENT,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    let response = await send(this.#tokens.get(key));
    if (response.status === 401 && !this.#tokens.has(key)) {
      await this.#authenticate(host, repo, response.headers.get("www-authenticate") ?? "");
      response = await send(this.#tokens.get(key));
    }
    return response;
  }

  async #authenticate(host: string, repo: string, challenge: string): Promise<void> {
    const fields = new Map(
      [...challenge.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key!, value!]),
    );
    const realm = fields.get("realm");
    if (!realm) throw new RegistryError(`${host} gave no auth realm for ${repo}`);

    const query = new URLSearchParams({ scope: `repository:${repo}:pull` });
    const service = fields.get("service");
    if (service) query.set("service", service);

    const response = await fetch(`${realm}?${query}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new RegistryError(`${host}: HTTP ${response.status} from the token endpoint`);
    const body = (await response.json()) as { token?: string; access_token?: string };
    const token = body.token ?? body.access_token;
    if (!token) throw new RegistryError(`${host} issued no token for ${repo}`);
    this.#tokens.set(`${host}/${repo}`, token);
  }

  /** The manifest digest for a tag, or null if it does not exist. */
  async digest(ref: Ref, reference?: string): Promise<string | null> {
    const [host, repo] = ref.registry;
    const path = `/v2/${repo}/manifests/${reference ?? ref.tag}`;
    const response = await this.#fetch(host, repo, path, "HEAD", MANIFEST_ACCEPT);
    if (response.status === 404) return null;
    if (!response.ok) throw new RegistryError(`${ref.name}: HTTP ${response.status} on ${path}`);
    return response.headers.get("docker-content-digest");
  }

  /**
   * Platforms a tag covers, as `os/arch[/variant]`. A single-platform manifest
   * reports nothing, which compares equal to itself and so never blocks an
   * update between two single-platform pins.
   */
  async platforms(ref: Ref, reference?: string): Promise<Set<string>> {
    const [host, repo] = ref.registry;
    const path = `/v2/${repo}/manifests/${reference ?? ref.tag}`;
    const response = await this.#fetch(host, repo, path, "GET", MANIFEST_ACCEPT);
    if (!response.ok) throw new RegistryError(`${ref.name}: HTTP ${response.status} on ${path}`);
    const body = (await response.json()) as {
      manifests?: Array<{ platform?: { os?: string; architecture?: string; variant?: string } }>;
    };
    const found = new Set<string>();
    for (const entry of body.manifests ?? []) {
      const { os, architecture, variant } = entry.platform ?? {};
      // Attestation manifests carry unknown/unknown; they are not runtimes.
      if (!os || !architecture || os === "unknown" || architecture === "unknown") continue;
      found.add(`${os}/${architecture}` + (variant ? `/${variant}` : ""));
    }
    return found;
  }

  async tags(ref: Ref, maxPages = 20): Promise<string[]> {
    const [host, repo] = ref.registry;
    let path = `/v2/${repo}/tags/list?n=1000`;
    const collected: string[] = [];
    for (let page = 0; page < maxPages; page++) {
      const response = await this.#fetch(host, repo, path, "GET", "application/json");
      if (!response.ok) throw new RegistryError(`${ref.name}: HTTP ${response.status} on ${path}`);
      const body = (await response.json()) as { tags?: string[] | null };
      collected.push(...(body.tags ?? []));
      const next = /<([^>]+)>\s*;\s*rel="?next"?/.exec(response.headers.get("link") ?? "");
      if (!next) break;
      path = next[1]!;
    }
    return collected;
  }
}

// ---------------------------------------------------------------------------
// Tag comparison
// ---------------------------------------------------------------------------

/**
 * A pattern matching tags built like this one, with the numbers captured:
 * `v2.12.0` -> `^v(\d+)\.(\d+)\.(\d+)$`, `8-alpine` -> `^(\d+)-alpine$`.
 *
 * Comparing only within a shape is what keeps `latest`, `development` and
 * `pro_1.3004` out of the running, and stops a three-field tag from being
 * replaced by a two-field one.
 */
function tagShape(tag: string): RegExp | null {
  if (!/\d/.test(tag)) return null;
  const pattern = (tag.match(/\d+|\D+/g) ?? [])
    .map((part) => (/^\d+$/.test(part) ? String.raw`(\d+)` : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${pattern}$`);
}

function tagNumbers(shape: RegExp, tag: string): number[] | null {
  const match = shape.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}

/** Lexicographic on the numeric fields, the way version tags order. */
function compareNumbers(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The best candidate under `policy`, plus the best candidate ignoring the
 * policy's ceiling — so a held-back major can still be reported. Both are null
 * when the current tag is already the newest.
 */
function newestTag(
  tags: string[],
  current: string,
  policy: Policy,
): { candidate: string | null; newest: string | null } {
  const empty = { candidate: null, newest: null };
  const shape = tagShape(current);
  if (!shape) return empty;
  const here = tagNumbers(shape, current);
  if (!here) return empty;
  const pinned = policy === "patch" ? 2 : policy === "major" ? 0 : 1;

  const ranked = [...new Set(tags)]
    .map((tag) => ({ tag, numbers: tagNumbers(shape, tag) }))
    .filter((entry): entry is { tag: string; numbers: number[] } => entry.numbers !== null)
    .filter((entry) => compareNumbers(entry.numbers, here) > 0)
    .sort((a, b) => compareNumbers(b.numbers, a.numbers));

  const within = ranked.find((entry) =>
    compareNumbers(entry.numbers.slice(0, pinned), here.slice(0, pinned)) === 0,
  );
  return { candidate: within?.tag ?? null, newest: ranked[0]?.tag ?? null };
}

// ---------------------------------------------------------------------------
// Store layout
// ---------------------------------------------------------------------------

type ImagePin = {
  app: string;
  service: string;
  line: number; // 0-based index into the compose file
  ref: Ref;
};

type Update = {
  pin: ImagePin;
  newRef: Ref;
  heldBack: string | null; // newer tag the policy would not take
};

const tagMoved = (update: Update) => update.newRef.tag !== update.pin.ref.tag;
const isActionable = (update: Update) => String(update.newRef) !== String(update.pin.ref);

/** One store package: its directory, manifest and compose file. */
class App {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  get directory(): string {
    return join(REPO_ROOT, this.name);
  }
  get compose(): string {
    return join(this.directory, "docker-compose.yml");
  }
  get manifest(): string {
    return join(this.directory, "umbrel-app.yml");
  }

  get title(): string {
    const found = /^name:\s*(.+?)\s*$/m.exec(readFileSync(this.manifest, "utf8"));
    return found ? found[1]!.replace(/^["']|["']$/g, "") : this.name;
  }

  get version(): string {
    const found = /^version:\s*"?([^"\n]+?)"?\s*$/m.exec(readFileSync(this.manifest, "utf8"));
    if (!found) die(`${this.manifest}: no version`);
    return found[1]!;
  }

  pins(): ImagePin[] {
    const pins: ImagePin[] = [];
    let service = "?";
    readFileSync(this.compose, "utf8")
      .split("\n")
      .forEach((text, line) => {
        const serviceMatch = SERVICE_LINE.exec(text);
        if (serviceMatch) {
          service = serviceMatch[1]!;
          return;
        }
        const imageMatch = IMAGE_LINE.exec(text);
        if (imageMatch) {
          pins.push({ app: this.name, service, line, ref: Ref.parse(imageMatch[2]!) });
        }
      });
    return pins;
  }

  /**
   * The service behind app_proxy — the one whose version the store shows.
   * NetAlertX runs on host networking and has no proxy, so fall back to the
   * conventional `server`, then to the only service there is.
   */
  primaryService(): string {
    const text = readFileSync(this.compose, "utf8");
    const found = /^\s*APP_HOST:\s*\S+?_([A-Za-z0-9_.-]+)_\d+\s*$/m.exec(text);
    if (found) return found[1]!;
    const services = this.pins().map((pin) => pin.service);
    if (services.includes("server")) return "server";
    return services.length === 1 ? services[0]! : "";
  }
}

function discoverApps(selectors: string[]): App[] {
  const apps = readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(REPO_ROOT, entry.name, "umbrel-app.yml")) &&
        existsSync(join(REPO_ROOT, entry.name, "docker-compose.yml")),
    )
    .map((entry) => new App(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (selectors.length === 0) return apps;
  const chosen = apps.filter((app) => selectors.some((selector) => app.name.includes(selector)));
  if (chosen.length === 0) {
    die(`no app matches ${selectors.join(", ")}; have: ${apps.map((a) => a.name).join(", ")}`);
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

async function checkApp(app: App, registry: Registry, allowMajor: boolean): Promise<Update[]> {
  const updates: Update[] = [];

  for (const pin of app.pins()) {
    let policy = pin.ref.policy;
    if (policy === "skip") continue;
    if (allowMajor && policy !== "digest") policy = "major";

    try {
      const currentDigest = await registry.digest(pin.ref);
      if (currentDigest === null) {
        warn(`${app.name}/${pin.service}: ${pin.ref.name}:${pin.ref.tag} is gone from the registry`);
        continue;
      }
      if (pin.ref.digest && (await registry.digest(pin.ref, pin.ref.digest)) === null) {
        warn(`${app.name}/${pin.service}: the pinned digest for ${pin.ref.name} no longer resolves`);
      }

      // A digest-pinned image never moves its tag, but a newer one is still
      // worth naming: pgvector pg18 exists, it is just a migration somebody
      // has to do by hand rather than something to apply here.
      const ranked = newestTag(
        await registry.tags(pin.ref),
        pin.ref.tag,
        policy === "digest" ? "major" : policy,
      );
      const candidate = policy === "digest" ? null : ranked.candidate;
      const heldBack = ranked.newest && ranked.newest !== candidate ? ranked.newest : null;

      if (candidate === null) {
        // Same tag: an update only exists if the digest moved under it.
        if (pin.ref.digest && currentDigest !== pin.ref.digest) {
          updates.push({ pin, newRef: pin.ref.with(pin.ref.tag, currentDigest), heldBack });
        } else if (heldBack) {
          updates.push({ pin, newRef: pin.ref, heldBack });
        }
        continue;
      }

      const here = await registry.platforms(pin.ref, pin.ref.digest ?? pin.ref.tag);
      const there = await registry.platforms(pin.ref, candidate);
      const dropped = [...here].filter((platform) => !there.has(platform));
      if (dropped.length > 0) {
        warn(
          `${app.name}/${pin.service}: ${pin.ref.name}:${candidate} skipped, ` +
            `it drops ${dropped.sort().join(", ")}`,
        );
        continue;
      }

      const newDigest = await registry.digest(pin.ref, candidate);
      updates.push({ pin, newRef: pin.ref.with(candidate, newDigest), heldBack });
    } catch (error) {
      warn(`${app.name}/${pin.service}: could not check ${pin.ref.name} (${error})`);
    }
  }
  return updates;
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

/**
 * The store version to publish. It mirrors the primary image's tag when that
 * tag moved and the two were in step to begin with; otherwise it gains or
 * increments a `-N` store revision, which is what makes Umbrel offer an update
 * for a change that carries no upstream version — a digest refresh, or a new
 * sidecar pin.
 */
function nextVersion(app: App, updates: Update[]): { version: string; tracksUpstream: boolean } {
  const current = app.version;
  const primary = app.primaryService();

  for (const update of updates) {
    if (update.pin.service !== primary || !tagMoved(update)) continue;
    if (current === update.pin.ref.tag.replace(/^v/, "")) {
      return { version: update.newRef.tag.replace(/^v/, ""), tracksUpstream: true };
    }
    // Multica's primary service is its nginx gateway, whose tag has nothing to
    // do with Multica's version. A store revision is the honest answer there.
    warn(
      `${app.name}: version ${current} does not track the image tag ` +
        `${update.pin.ref.tag}; using a store revision instead`,
    );
    break;
  }

  const revision = /^(.*)-(\d+)$/.exec(current);
  return {
    version: revision ? `${revision[1]}-${Number(revision[2]) + 1}` : `${current}-1`,
    tracksUpstream: false,
  };
}

function releaseNotes(app: App, updates: Update[], version: string, tracksUpstream: boolean): string {
  const primary = app.primaryService();
  const sentences: string[] = [];

  for (const update of updates.filter(tagMoved)) {
    const subject =
      tracksUpstream && update.pin.service === primary ? app.title : update.pin.ref.name;
    sentences.push(`${subject} updated from ${update.pin.ref.tag} to ${update.newRef.tag}.`);
  }

  const refreshed = updates.filter((update) => !tagMoved(update));
  if (refreshed.length > 0) {
    const names = refreshed.map((update) => `${update.pin.ref.name}:${update.pin.ref.tag}`).join(", ");
    sentences.push(
      `Refreshed the pinned digest for ${names}; upstream re-published the ` +
        `same tag, so nothing else changed.`,
    );
  }

  return sentences.length > 0 ? sentences.join(" ") : `Store release ${version}.`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Put `notes` at the top of the folded `releaseNotes: >-` block, above what is
 * already there and separated by a `---` rule — the shape Multica's notes
 * already use by hand. Replacing the block instead would throw away the
 * packaging notes, which are the only record of why an app is set up the way
 * it is, and which Umbrel shows on the app's page and not just once.
 */
function rewriteNotes(text: string, notes: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith("releaseNotes:"));
  if (start === -1) {
    warn("no releaseNotes block to update");
    return text;
  }

  // The block runs to the first line that is neither blank nor indented.
  let end = start + 1;
  while (end < lines.length && (lines[end]!.trim() === "" || /^\s/.test(lines[end]!))) end++;
  // Trailing blank lines separate the block from the next key; leave them be.
  while (end > start + 1 && lines[end - 1]!.trim() === "") end--;

  const previous = lines.slice(start + 1, end);
  const body = wrap(notes, 74).map((line) => `  ${line}`);
  const block = previous.length > 0 ? [...body, "", "  ---", "", ...previous] : body;

  return [...lines.slice(0, start), "releaseNotes: >-", ...block, ...lines.slice(end)].join("\n");
}

function applyApp(app: App, updates: Update[], keepNotes: boolean): { version: string; touched: string[] } {
  const touched: string[] = [];

  const lines = readFileSync(app.compose, "utf8").split("\n");
  for (const update of updates) {
    lines[update.pin.line] = lines[update.pin.line]!.replace(
      String(update.pin.ref),
      String(update.newRef),
    );
  }
  writeFileSync(app.compose, lines.join("\n"));
  touched.push(app.compose);

  const { version, tracksUpstream } = nextVersion(app, updates);
  let manifest = readFileSync(app.manifest, "utf8");
  manifest = manifest.replace(/^version:\s*"?[^"\n]+?"?\s*$/m, `version: "${version}"`);
  if (!keepNotes) {
    manifest = rewriteNotes(manifest, releaseNotes(app, updates, version, tracksUpstream));
  }
  writeFileSync(app.manifest, manifest);
  touched.push(app.manifest);

  // Docs quote the full pin; AGENTS.md carries some of them too.
  for (const document of [join(app.directory, "README.md"), join(REPO_ROOT, "AGENTS.md")]) {
    if (!existsSync(document)) continue;
    const original = readFileSync(document, "utf8");
    let text = original;
    for (const update of updates) text = text.replaceAll(String(update.pin.ref), String(update.newRef));
    if (text !== original) {
      writeFileSync(document, text);
      touched.push(document);
    }
  }

  return { version, touched };
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function commitApp(app: App, updates: Update[], version: string, touched: string[]): void {
  const moved = updates.filter(tagMoved);
  const summary =
    moved.length > 0
      ? "update " + moved.map((u) => `${u.pin.ref.name} to ${u.newRef.tag}`).join(", ")
      : "refresh the pinned digest for " +
        [...new Set(updates.map((u) => u.pin.ref.name))].sort().join(", ");

  git("add", "--", ...touched.map((path) => relative(REPO_ROOT, path)));
  git("commit", "-m", `${app.title} ${version}: ${summary}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function report(updates: Update[]): void {
  for (const update of updates) {
    const { pin, newRef } = update;
    const change = tagMoved(update)
      ? `${pin.ref.tag} -> ${newRef.tag}`
      : newRef.digest !== pin.ref.digest
        ? `${pin.ref.tag} (digest moved)`
        : `${pin.ref.tag} (up to date)`;
    const note = update.heldBack ? `  [held back: ${update.heldBack}]` : "";
    console.log(`  ${pin.service.padEnd(10)} ${pin.ref.name.padEnd(38)} ${change}${note}`);
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      app: { type: "string", multiple: true, default: [] },
      apply: { type: "boolean", default: false },
      commit: { type: "boolean", default: false },
      push: { type: "boolean", default: false },
      "allow-major": { type: "boolean", default: false },
      "keep-notes": { type: "boolean", default: false },
      check: { type: "boolean", default: false },
    },
  });

  const apply = values.apply || values.commit || values.push;
  const commit = values.commit || values.push;

  if (commit && git("status", "--porcelain")) die("the working tree is dirty; commit or stash first");

  const registry = new Registry();
  const released: string[] = [];
  let stale = 0;
  let noted = 0;

  for (const app of discoverApps(values.app)) {
    const updates = await checkApp(app, registry, values["allow-major"]);
    if (updates.length === 0) continue;
    const actionable = updates.filter(isActionable);

    console.log(`${app.name} (${app.version})`);
    report(updates);
    stale += actionable.length;
    noted += updates.length - actionable.length;
    if (!apply || actionable.length === 0) continue;

    const { version, touched } = applyApp(app, actionable, values["keep-notes"]);
    console.log(`  -> ${app.name} ${app.version} -> ${version}`);
    if (commit) {
      commitApp(app, actionable, version, touched);
      released.push(`${app.title} ${version}`);
    }
  }

  if (stale === 0) {
    console.log(noted > 0 ? "Every pin is current, see the held-back notes above." : "Every pin is current.");
    return 0;
  }

  if (values.push && released.length > 0) {
    git("push");
    console.log(`Pushed: ${released.join(", ")}. Refresh the store in Umbrel.`);
  } else if (commit && released.length > 0) {
    console.log(`Committed (not pushed): ${released.join(", ")}.`);
  } else if (apply) {
    console.log("Files rewritten; review with `git diff` before committing.");
  }

  return values.check ? 1 : 0;
}

process.exitCode = await main();
