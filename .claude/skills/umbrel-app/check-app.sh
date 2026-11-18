#!/usr/bin/env bash
# Lint one or more app packages against the store's silent-failure rules.
# Usage: .claude/skills/umbrel-app/check-app.sh chepetime-foo [chepetime-bar ...]
#        .claude/skills/umbrel-app/check-app.sh --all
# Exit 1 if any check fails. Every rule here is explained in AGENTS.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

if [[ "${1:-}" == "--all" ]]; then set -- chepetime-*/; fi
[[ $# -gt 0 ]] || { echo "usage: $0 <app-dir>... | --all" >&2; exit 2; }

failed=0
for dir in "$@"; do
  dir=${dir%/}
  m=$dir/umbrel-app.yml c=$dir/docker-compose.yml
  errs=()
  err() { errs+=("$1"); }

  [[ -f $m && -f $c ]] || { echo "FAIL $dir: missing umbrel-app.yml or docker-compose.yml"; failed=1; continue; }

  id=$(sed -n 's/^id: *//p' "$m" | tr -d '"')
  [[ $id == "$dir" ]] || err "id '$id' does not equal directory name"
  [[ $id == chepetime-* ]] || err "id must start with the store id 'chepetime-'"
  [[ $id =~ ^[a-zA-Z0-9_-]+$ ]] || err "id has characters outside [a-zA-Z0-9-_]"

  grep -q '^gallery:' "$m" || err "gallery: missing (use gallery: [])"
  grep -q '^version: "' "$m" || err "version: missing or unquoted"
  grep -q '^releaseNotes:' "$m" || err "releaseNotes: missing"

  port=$(sed -n 's/^port: *//p' "$m")
  if [[ -z $port ]]; then err "port: missing"
  else
    (( port >= 40000 && port <= 49999 )) && ! git cat-file -e "HEAD:$m" 2>/dev/null \
      && err "port $port is in 40000-49999, reserved for VMs on umbreld 2.0 (allocate 362xx)"
    dupes=$(grep -l "^port: *$port\$" chepetime-*/umbrel-app.yml | grep -v "^$m\$")
    [[ -z $dupes ]] || err "port $port also used by: $dupes"
  fi

  icon=$(sed -n 's/^icon: *//p' "$m")
  case $icon in
    */master/$dir/*) [[ -f $dir/${icon##*/} ]] || err "icon points at $dir/${icon##*/}, which does not exist" ;;
    *) err "icon must be served from this repo (see AGENTS.md 'App icons')" ;;
  esac

  while read -r img; do
    [[ $img == *@sha256:* ]] || err "image not pinned by digest: $img"
    # A rolling tag is acceptable only when upstream publishes nothing else
    # and POLICIES holds the image at `digest` (MiroTalk's `latest`).
    repo=${img%%@*}; repo=${repo%:*}
    [[ $img =~ :(latest|main|master|dev)(@|$) ]] \
      && ! grep -qF "[\"$repo\", \"digest\"]" scripts/check-image-updates.ts \
      && err "image pinned to a rolling tag: $img"
  done < <(sed -n 's/^ *image: *//p' "$c")

  grep -q "APP_HOST: *$id[_-]" "$c" || grep -q 'network_mode: host' "$c" \
    || err "app_proxy APP_HOST must be a qualified container name (${id}_<service>_1)"

  if grep -q '^  dataRoot: data' "$m"; then
    bad=$(grep -oE '\$\{APP_DATA_DIR\}/[^:"]+:' "$c" | grep -vE '^\$\{APP_DATA_DIR\}/(data|hooks)(/|:)' | sort -u)
    [[ -z $bad ]] || err "state mounted outside data/ while dataRoot is set: $bad"
  fi

  for h in "$dir"/hooks/pre-* "$dir"/hooks/post-*; do
    [[ -e $h ]] || continue
    mode=$(git ls-files -s "$h" | cut -d' ' -f1)
    [[ -z $mode || $mode == 100755 ]] || err "$h is $mode in git; hooks must be 100755"
    [[ -x $h ]] || err "$h is not executable"
  done

  [[ -f $dir/README.md ]] || err "README.md missing"
  grep -q "$id" AGENTS.md || err "not listed in AGENTS.md"
  grep -q "$id" README.md || err "not listed in the root README.md"

  if ((${#errs[@]})); then
    failed=1
    echo "FAIL $dir"; printf '  - %s\n' "${errs[@]}"
  else
    echo "ok   $dir"
  fi
done
exit $failed
