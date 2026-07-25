#!/usr/bin/env bash
#
# Bump the Billow store package to the next version, commit, and push.
#
# The version appears in four places that must stay in sync:
#   - sparkles-billow/umbrel-app.yml   version: "X.Y.Z"
#   - sparkles-billow/docker-compose.yml   image: ghcr.io/chepetime/billow:vX.Y.Z
#   - sparkles-billow/README.md            ghcr.io/chepetime/billow:vX.Y.Z
#   - AGENTS.md                            image: ghcr.io/chepetime/billow:vX.Y.Z
#
# Usage:
#   scripts/bump-billow.sh                       # patch bump, commit + push
#   scripts/bump-billow.sh minor                 # minor bump (resets patch)
#   scripts/bump-billow.sh major                 # major bump (resets minor+patch)
#   scripts/bump-billow.sh 0.2.0                 # explicit version
#   scripts/bump-billow.sh -n "Fix sign-in bug"  # also rewrite releaseNotes
#   scripts/bump-billow.sh --no-push             # commit only
#   scripts/bump-billow.sh --dry-run             # show what would change

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

manifest="sparkles-billow/umbrel-app.yml"
compose="sparkles-billow/docker-compose.yml"
app_readme="sparkles-billow/README.md"
agents="AGENTS.md"
files=("$manifest" "$compose" "$app_readme" "$agents")

bump="patch"
notes=""
push=1
dry_run=0

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    major|minor|patch) bump="$1" ;;
    [0-9]*.[0-9]*.[0-9]*) bump="$1" ;;
    -n|--notes) shift; [ $# -gt 0 ] || die "--notes needs a value"; notes="$1" ;;
    --no-push) push=0 ;;
    --dry-run) dry_run=1 ;;
    -h|--help) sed -n '3,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

for f in "${files[@]}"; do
  [ -f "$f" ] || die "missing $f"
done

current="$(sed -n 's/^version: *"\([0-9][0-9.]*\)".*/\1/p' "$manifest" | head -1)"
[ -n "$current" ] || die "could not read version from $manifest"

case "$bump" in
  major|minor|patch)
    IFS=. read -r major minor patch <<<"$current"
    case "$bump" in
      major) major=$((major + 1)); minor=0; patch=0 ;;
      minor) minor=$((minor + 1)); patch=0 ;;
      patch) patch=$((patch + 1)) ;;
    esac
    next="$major.$minor.$patch"
    ;;
  *) next="$bump" ;;
esac

printf 'Billow %s -> %s\n' "$current" "$next"

# Warn about edits already in the working tree; the commit will sweep them in.
dirty="$(git diff --name-only -- "${files[@]}"; git diff --cached --name-only -- "${files[@]}")"
if [ -n "$dirty" ]; then
  printf 'note: uncommitted changes will be included:\n%s\n' \
    "$(printf '%s\n' "$dirty" | sort -u | sed 's/^/  /')"
fi

if [ "$dry_run" -eq 1 ]; then
  printf 'dry run: would update %s\n' "${files[*]}"
  [ -n "$notes" ] && printf 'dry run: would set releaseNotes to: %s\n' "$notes"
  printf 'dry run: would commit "Billow Release %s"' "$next"
  [ "$push" -eq 1 ] && printf ' and push'
  printf '\n'
  exit 0
fi

sed -i '' "s/^version: \"$current\"/version: \"$next\"/" "$manifest"
for f in "$compose" "$app_readme" "$agents"; do
  sed -i '' "s|ghcr.io/chepetime/billow:v$current|ghcr.io/chepetime/billow:v$next|g" "$f"
done

if [ -n "$notes" ]; then
  # Rewrite the folded `releaseNotes: >-` block: drop its indented body and
  # replace it with the new text, wrapped and indented two spaces.
  block="$(mktemp)"
  trap 'rm -f "$block"' EXIT
  printf '%s\n' "$notes" | fold -s -w 74 | sed 's/[[:space:]]*$//; s/^/  /' > "$block"
  awk -v blockfile="$block" '
    /^releaseNotes:/ {
      print "releaseNotes: >-"
      while ((getline line < blockfile) > 0) print line
      close(blockfile)
      skip = 1
      next
    }
    skip && /^[[:space:]]/ { next }
    { skip = 0; print }
  ' "$manifest" > "$manifest.tmp" && mv "$manifest.tmp" "$manifest"
fi

# Sanity check: no stale references to the old version anywhere.
if git grep -n "$current" -- "${files[@]}" >/dev/null 2>&1; then
  printf 'warning: %s still referenced:\n' "$current" >&2
  git grep -n "$current" -- "${files[@]}" >&2
fi

git add -- "${files[@]}"
git commit -m "Billow Release $next"

if [ "$push" -eq 1 ]; then
  git push
  printf 'Pushed Billow %s. Refresh the alt store in Umbrel.\n' "$next"
else
  printf 'Committed Billow %s (not pushed).\n' "$next"
fi
