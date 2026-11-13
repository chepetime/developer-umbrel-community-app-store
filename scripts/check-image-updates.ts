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
 * Commit subjects and release notes say what changed, not just that a digest
 * moved: the release page and commits between tags, a new build-number label,
 * upstream commits between two builds, or a plain rebuild date — see
 * `describe`. GITHUB_TOKEN, when set, lifts the GitHub API's anonymous limit.
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
  ["ghcr.io/chepetime/drip", "skip"], // released with the Drip source
  ["ghcr.io/multica-ai/*", "skip"], // released with the Multica source
  ["makeplane/*", "skip"], // released with Plane's own source, six images move in lockstep
  ["ghcr.io/croffasia/itsaplan-*", "skip"], // four images share a release, and the api one runs the migrations
  ["ghcr.io/tinyauthapp/tinyauth", "digest"], // rolling v5, no per-patch tags
  ["mirotalk/p2p", "digest"], // only `latest` is published, and the repo has no tags
  ["postgres", "digest"], // a major is a data-directory migration
  ["pgvector/pgvector", "digest"], // same, and it carries the extension
  ["redis", "digest"],
  ["valkey/valkey", "digest"], // same reasoning as redis
  ["rabbitmq", "digest"], // mnesia data dir, same reasoning as postgres
  ["minio/minio", "digest"], // date-based RELEASE tags, and object data to boot
  ["rustfs/rustfs", "digest"], // object store holding attachments; move by hand
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

  /**
   * Build date and labels of the image behind a tag or digest. For a
   * multi-platform index this reads linux/amd64 (else the first runtime),
   * which is enough: every platform of one push shares its labels and date.
   */
  async config(ref: Ref, reference: string): Promise<ImageConfig | null> {
    const [host, repo] = ref.registry;
    type Manifest = {
      manifests?: Array<{ digest: string; platform?: { os?: string; architecture?: string } }>;
      config?: { digest?: string };
    };
    const manifest = async (at: string): Promise<Manifest> => {
      const path = `/v2/${repo}/manifests/${at}`;
      const response = await this.#fetch(host, repo, path, "GET", MANIFEST_ACCEPT);
      if (!response.ok) throw new RegistryError(`${ref.name}: HTTP ${response.status} on ${path}`);
      return (await response.json()) as Manifest;
    };

    let body = await manifest(reference);
    if (body.manifests) {
      const runtimes = body.manifests.filter(
        (entry) =>
          entry.platform?.os && entry.platform.os !== "unknown" && entry.platform.architecture !== "unknown",
      );
      const chosen =
        runtimes.find((entry) => entry.platform?.os === "linux" && entry.platform.architecture === "amd64") ??
        runtimes[0];
      if (!chosen) return null;
      body = await manifest(chosen.digest);
    }
    const digest = body.config?.digest;
    if (!digest) return null;

    // Docker Hub and GHCR answer with a redirect to blob storage; fetch drops
    // the Authorization header on that cross-origin hop, as the CDN requires.
    const path = `/v2/${repo}/blobs/${digest}`;
    const response = await this.#fetch(host, repo, path, "GET", "*/*");
    if (!response.ok) throw new RegistryError(`${ref.name}: HTTP ${response.status} on ${path}`);
    const blob = (await response.json()) as {
      created?: string;
      config?: { Labels?: Record<string, string> | null };
    };
    return { digest, created: blob.created ?? null, labels: blob.config?.Labels ?? {} };
  }
}

type ImageConfig = { digest: string; created: string | null; labels: Record<string, string> };

// ---------------------------------------------------------------------------
// GitHub: what an image change contains
// ---------------------------------------------------------------------------

type Commit = { sha: string; subject: string };
type CommitRange = { commits: Commit[]; total: number; url: string };

/**
 * Read-only GitHub REST access, used only to say what a new image contains.
 * Anonymous is 60 requests an hour, enough for a local run; the workflow
 * passes GITHUB_TOKEN for its 1000. Every lookup is optional: a failure
 * degrades the message, never the release.
 */
class GitHub {
  #token = process.env.GITHUB_TOKEN;

  /** `owner/repo` from a github.com URL, or null. */
  static repoOf(url: string | null | undefined): string | null {
    const found = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(url ?? "");
    return found ? `${found[1]}/${found[2]}` : null;
  }

  async #get<T>(path: string): Promise<T | null> {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        ...(this.#token ? { Authorization: `Bearer ${this.#token}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 422) return null;
    if (!response.ok) throw new Error(`GitHub: HTTP ${response.status} on ${path}`);
    return (await response.json()) as T;
  }

  static #commits(
    raw: Array<{ sha: string; commit: { message: string }; parents?: unknown[] }>,
  ): Commit[] {
    return raw
      .filter((entry) => (entry.parents?.length ?? 1) < 2) // merges repeat their branch
      .map((entry) => ({ sha: entry.sha, subject: entry.commit.message.split("\n")[0]!.trim() }));
  }

  /** Commits between two revisions, oldest first. */
  async compare(repo: string, base: string, head: string): Promise<CommitRange | null> {
    const body = await this.#get<{
      html_url: string;
      total_commits: number;
      commits: Array<{ sha: string; commit: { message: string }; parents?: unknown[] }>;
    }>(`/repos/${repo}/compare/${base}...${head}`);
    if (!body) return null;
    const commits = GitHub.#commits(body.commits);
    return { commits, total: Math.max(body.total_commits, commits.length), url: body.html_url };
  }

  /** Commits on the default branch in a time window, oldest first. */
  async between(repo: string, since: string, until: string): Promise<CommitRange | null> {
    const query = new URLSearchParams({ since, until, per_page: "100" });
    const body = await this.#get<Array<{ sha: string; commit: { message: string }; parents?: unknown[] }>>(
      `/repos/${repo}/commits?${query}`,
    );
    if (!body) return null;
    const commits = GitHub.#commits(body).reverse();
    return { commits, total: commits.length, url: `https://github.com/${repo}/commits` };
  }

  /**
   * The release for an image tag, trying it with and without a `v` — image
   * tags and git tags disagree on that often (Maintainerr: `3.32.0` on GHCR,
   * `v3.32.0` on GitHub). Returns the git tag that matched.
   */
  async release(repo: string, tag: string): Promise<{ url: string; tag: string } | null> {
    const bare = tag.replace(/^v/, "");
    for (const candidate of [...new Set([tag, `v${bare}`, bare])]) {
      const body = await this.#get<{ html_url: string; tag_name: string }>(
        `/repos/${repo}/releases/tags/${encodeURIComponent(candidate)}`,
      );
      if (body) return { url: body.html_url, tag: body.tag_name };
    }
    return null;
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
    // A `-N` store revision on top of the tag still counts as in step:
    // packaging-only releases (a digest refresh, the storage.dataRoot move)
    // must not stop the version from following upstream afterwards.
    if (current.replace(/-\d+$/, "") === update.pin.ref.tag.replace(/^v/, "")) {
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

// ---------------------------------------------------------------------------
// Describing a change
// ---------------------------------------------------------------------------

/**
 * What one image move means, in three registers: a phrase for the commit
 * subject, a sentence for the release notes Umbrel shows on the app page, and
 * detail lines for the commit body.
 *
 * "The digest moved" is true and useless — MiroTalk's `latest` moves most
 * nights, and the notes used to say the same sentence every time. So this
 * asks the registry and GitHub what actually changed, best evidence first:
 *
 *   1. a new tag: link upstream's release page;
 *   2. a new `org.opencontainers.image.version` label under the same tag
 *      (linuxserver's `ls189` -> `ls190`): name the build;
 *   3. upstream commits: between the two `image.revision` labels, or, for
 *      the app's own image with no labels (MiroTalk), on the manifest's
 *      `repo:` between the two build dates;
 *   4. otherwise the build date, which for official images (redis,
 *      postgres) is what a same-tag rebuild is: base-image and package
 *      updates.
 */
type Change = {
  /** Phrase for the commit subject. */
  phrase: string;
  /** Sentence for the release notes; null when it merges with others (see releaseNotes). */
  note: string | null;
  /** Set on a same-tag rebuild with nothing else known: "redis:8-alpine (5 Nov 2026)". */
  rebuilt?: string;
  /** Set when only the index moved; the image itself is byte-identical. */
  republished?: string;
  details: string[];
};

type Context = { app: App; registry: Registry; github: GitHub; tracksUpstream: boolean };

/** Upstream bookkeeping: never a highlight, though still counted and listed in the commit body. */
const NOISE =
  /^(chore|ci|ci\/cd|build|docs|test|tests|style|release|revert|refactor|perf\(ci\))(\(.*?\))?!?:|^v?\d+(\.\d+)+$|^bump |^update dependenc|^\[?bot\]?|^merge |^bot /i;

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const short = (digest: string | null) => (digest ? digest.replace(/^sha256:/, "").slice(0, 12) : "none");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Commit subjects worth showing a user: security fixes, then features, then
 * fixes, newest first within each, with upstream's bookkeeping stripped —
 * MiroTalk prefixes every subject with `[mirotalk] - `, and `feat(ui): `
 * means nothing on an app page.
 */
function highlights(commits: Commit[], limit: number): string[] {
  const rank = (subject: string) =>
    /secur|cve|vulnerab/i.test(subject) ? 0 : /^feat/i.test(subject) ? 1 : /^fix/i.test(subject) ? 2 : 3;
  const seen = new Set<string>();
  return commits
    .map((commit, order) => ({ subject: commit.subject.replace(/^\[[^\]]+\]\s*-?\s*/, ""), order }))
    .filter((entry) => !NOISE.test(entry.subject))
    .sort((a, b) => rank(a.subject) - rank(b.subject) || b.order - a.order)
    .map(({ subject }) => {
      const text = subject
        .replace(/^[\w-]+(\([^)]*\))?!?:\s*/, "")
        .replace(/(\s*\(#\d+\))+$/, "")
        .replace(/\.$/, "")
        .trim();
      return text.charAt(0).toUpperCase() + text.slice(1);
    })
    .filter((text) => text && !seen.has(text.toLowerCase()) && seen.add(text.toLowerCase()))
    .slice(0, limit);
}

/** Cut at a word boundary, for the commit subject. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)}...`;
}

async function describe(context: Context, group: Update[]): Promise<Change> {
  const { app, registry, github } = context;
  const [first] = group as [Update, ...Update[]];
  const { pin, newRef } = first;
  const services = [...new Set(group.map((update) => update.pin.service))].join(", ");
  const isPrimary = group.some((update) => update.pin.service === app.primaryService());
  // The app's own image is called by the app's name; a sidecar by its image,
  // without the registry host.
  const subject = isPrimary ? app.title : pin.ref.name.replace(/^[^/]*\.[^/]*\//, "");
  const details = [
    `${pin.ref.name}:${pin.ref.tag} (${services})`,
    `  ${pin.ref.tag}@${short(pin.ref.digest)} -> ${newRef.tag}@${short(newRef.digest)}`,
  ];

  const lookup = async <T>(what: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      warn(`${app.name}/${services}: could not read ${what} (${error})`);
      return null;
    }
  };

  const [before, after] = await Promise.all([
    pin.ref.digest ? lookup("the old image config", () => registry.config(pin.ref, pin.ref.digest!)) : null,
    newRef.digest ? lookup("the new image config", () => registry.config(newRef, newRef.digest!)) : null,
  ]);
  const built = day(after?.created);
  if (built) details.push(`  built ${day(before?.created) ?? "?"} -> ${built}`);

  const source =
    GitHub.repoOf(after?.labels["org.opencontainers.image.source"]) ??
    (isPrimary ? GitHub.repoOf(readManifestField(app, "repo")) : null);

  // 1. A new tag.
  if (tagMoved(first)) {
    const from = pin.ref.tag.replace(/^v/, "");
    const to = newRef.tag.replace(/^v/, "");
    const release = source ? await lookup("the release page", () => github.release(source, newRef.tag)) : null;
    // The old tag spelled the way the new one matched on GitHub.
    const oldGitTag = release ? release.tag.replace(/^(v?).*$/, `$1${from}`) : null;
    const tagRange =
      source && release && oldGitTag
        ? await lookup("upstream commits", () => github.compare(source, oldGitTag, release.tag))
        : null;
    if (tagRange && tagRange.total > 0) {
      for (const commit of tagRange.commits.slice(-15)) details.push(`  - ${commit.subject} (${commit.sha.slice(0, 7)})`);
      if (tagRange.total > 15) details.push(`  - ...and ${tagRange.total - 15} earlier`);
    }
    if (release) details.push(`  ${release.url}`);

    const name = isPrimary && context.tracksUpstream ? app.title : subject;
    const total = tagRange?.total ?? 0;
    const shown = tagRange ? highlights(tagRange.commits, 3) : [];
    const commits = plural(total, "commit");

    // The commit subject already starts with "<App> <version>", so the app's
    // own upgrade says what is in it instead of repeating the number.
    let phrase = `update ${name} to ${to}`;
    if (isPrimary && context.tracksUpstream && total > 0) {
      phrase = shown[0]
        ? `${commits} since ${from}, incl. ${clip(shown[0].charAt(0).toLowerCase() + shown[0].slice(1), 60)}`
        : `${total === 1 ? "1 maintenance commit" : `${total} maintenance commits`} since ${from}`;
    }

    let note = `${name} updated from ${from} to ${to}.`;
    if (shown.length > 0) {
      note = `${name} updated from ${from} to ${to} (${commits}), including: ${shown.join("; ")}.`;
    } else if (total > 0) {
      note =
        `${name} updated from ${from} to ${to}, a maintenance release: its ${commits} ` +
        `are dependency, translation and build changes.`;
    }
    if (release) note += ` Release notes: ${release.url}`;
    return { phrase, note, details };
  }

  // Same image, new index: upstream re-pushed the tag (attestations, another
  // platform) without changing what runs here. Still worth taking — the old
  // digest can be garbage-collected — but nothing to tell a user about.
  if (before && after && before.digest === after.digest) {
    details.push("  image config unchanged; only the index was re-published");
    return {
      phrase: `refresh ${subject}`,
      note: null,
      republished: `${subject}:${pin.ref.tag}`,
      details,
    };
  }

  // 2. Same tag, new upstream build number.
  const versionLabel = "org.opencontainers.image.version";
  const oldVersion = before?.labels[versionLabel];
  const newVersion = after?.labels[versionLabel];

  // 3. Upstream commits.
  const oldRevision = before?.labels["org.opencontainers.image.revision"];
  const newRevision = after?.labels["org.opencontainers.image.revision"];
  let range: CommitRange | null = null;
  if (source && oldRevision && newRevision && oldRevision !== newRevision) {
    range = await lookup("upstream commits", () => github.compare(source, oldRevision, newRevision));
  } else if (source && isPrimary && !newRevision && before?.created && after?.created) {
    range = await lookup("upstream commits", () => github.between(source, before.created!, after.created!));
  }
  if (range && range.total > 0) {
    for (const commit of range.commits.slice(-15)) details.push(`  - ${commit.subject} (${commit.sha.slice(0, 7)})`);
    if (range.total > 15) details.push(`  - ...and ${range.total - 15} earlier`);
    details.push(`  ${range.url}`);
  }

  if (newVersion && oldVersion && newVersion !== oldVersion) {
    return {
      phrase: `rebuild ${isPrimary ? "" : `${subject} `}as ${newVersion}`,
      note:
        `${isPrimary ? `The ${app.title} image` : subject} was rebuilt upstream as ` +
        `${newVersion} (was ${oldVersion})` +
        (built ? `, published ${built}.` : "."),
      details,
    };
  }

  if (range && range.total > 0) {
    const shown = highlights(range.commits, 3);
    const rest = range.total - shown.length;
    const changes = plural(range.total, "upstream change");
    return {
      phrase: isPrimary
        ? `${changes}` + (shown[0] ? `, incl. ${clip(shown[0].charAt(0).toLowerCase() + shown[0].slice(1), 60)}` : "")
        : `pick up ${changes} to ${subject}`,
      note:
        `Picks up ${changes} to ${subject}` +
        (built ? ` (build of ${built})` : "") +
        `: ${shown.join("; ")}` +
        (rest > 0 ? `; and ${rest} more.` : "."),
      details,
    };
  }

  // 4. Nothing but a new build.
  return {
    phrase: `refresh ${subject}`,
    note: null,
    rebuilt: `${subject}:${pin.ref.tag}` + (built ? ` (${built})` : ""),
    details,
  };
}

/** One description per distinct image move: Plane pins plane-backend four times. */
async function describeAll(context: Context, updates: Update[]): Promise<Change[]> {
  const groups = new Map<string, Update[]>();
  for (const update of updates.filter(isActionable)) {
    const key = `${update.pin.ref} -> ${update.newRef}`;
    groups.set(key, [...(groups.get(key) ?? []), update]);
  }
  // Tag moves first: they are the news.
  const ordered = [...groups.values()].sort(
    (a, b) => Number(tagMoved(b[0]!)) - Number(tagMoved(a[0]!)),
  );
  const changes = await Promise.all(ordered.map((group) => describe(context, group)));
  // Anything with its own sentence before the plain refreshes, so the
  // subject leads with the news and the refreshes merge at the end.
  return changes.sort((a, b) => Number(b.note !== null) - Number(a.note !== null));
}

function readManifestField(app: App, field: string): string | null {
  const found = new RegExp(`^${field}:\\s*(.+?)\\s*$`, "m").exec(readFileSync(app.manifest, "utf8"));
  return found ? found[1]!.replace(/^["']|["']$/g, "") : null;
}

/**
 * The notes Umbrel shows on the app page. Plain rebuilds share one sentence,
 * so a night that refreshes three sidecars does not say the same thing three
 * times.
 */
function releaseNotes(changes: Change[], version: string): string {
  const sentences = changes.flatMap((change) => (change.note ? [change.note] : []));
  const list = (items: string[]) =>
    items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

  const rebuilt = changes.flatMap((change) => (change.rebuilt ? [change.rebuilt] : []));
  if (rebuilt.length > 0) {
    sentences.push(
      `Picks up upstream's rebuild of ${list(rebuilt)}, with no version change; ` +
        `that is usually base-image and security updates.`,
    );
  }
  const republished = changes.flatMap((change) => (change.republished ? [change.republished] : []));
  if (republished.length > 0 && sentences.length === 0) {
    sentences.push(
      `Upstream re-published ${list(republished)} without changing the image, ` +
        `so nothing in the app changes.`,
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
 * Replace the folded `releaseNotes: >-` block with `notes`.
 *
 * This used to prepend above the previous entries, separated by a `---` rule,
 * on the reasoning that the packaging notes are the only record of why an app
 * is set up the way it is. In practice that reasoning did not hold: this
 * script writes the *same* sentence every time an upstream tag is
 * re-published, so the block grew into a wall with the digest-refresh note
 * repeated verbatim, and the one entry a user actually wants — what changed in
 * the version being offered to them — buried under it.
 *
 * Umbrel shows these notes on the app page every time, not once, so the block
 * is read repeatedly and length costs something. Why an app is packaged the
 * way it is belongs in the compose file's comments, which is where it already
 * lives; git history keeps the superseded entries.
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

  const block = wrap(notes, 74).map((line) => `  ${line}`);

  return [...lines.slice(0, start), "releaseNotes: >-", ...block, ...lines.slice(end)].join("\n");
}

function applyApp(app: App, updates: Update[], version: string, notes: string | null): string[] {
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

  let manifest = readFileSync(app.manifest, "utf8");
  manifest = manifest.replace(/^version:\s*"?[^"\n]+?"?\s*$/m, `version: "${version}"`);
  if (notes !== null) manifest = rewriteNotes(manifest, notes);
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

  return touched;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

/**
 * `<App> <version>: <what changed>`, then one block per image with the
 * digests, build dates, upstream commits and a link. The subject is what
 * `git log --oneline` and the GitHub commit list show, so it carries the
 * substance; the body is for whoever has to check the claim.
 */
function commitApp(app: App, version: string, changes: Change[], touched: string[]): void {
  // "refresh redis, refresh pgvector" reads as "refresh redis, pgvector".
  const phrases: string[] = [];
  for (const { phrase } of changes) {
    const previous = phrases.at(-1);
    if (previous?.startsWith("refresh ") && phrase.startsWith("refresh ")) {
      phrases[phrases.length - 1] = `${previous}, ${phrase.slice("refresh ".length)}`;
    } else {
      phrases.push(phrase);
    }
  }
  const subject = `${app.title} ${version}: ${phrases.join(", ")}`;
  const body = changes.map((change) => change.details.join("\n")).join("\n\n");

  git("add", "--", ...touched.map((path) => relative(REPO_ROOT, path)));
  git("commit", "-m", subject, ...(body ? ["-m", body] : []));
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
  const github = new GitHub();
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
    if (actionable.length === 0) continue;

    const { version, tracksUpstream } = nextVersion(app, actionable);
    const changes = await describeAll({ app, registry, github, tracksUpstream }, actionable);
    for (const change of changes) console.log(`  = ${change.phrase}`);
    if (!apply) continue;

    const notes = values["keep-notes"] ? null : releaseNotes(changes, version);
    const previous = app.version;
    const touched = applyApp(app, actionable, version, notes);
    console.log(`  -> ${app.name} ${previous} -> ${version}`);
    if (commit) {
      commitApp(app, version, changes, touched);
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
