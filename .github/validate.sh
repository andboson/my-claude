#!/usr/bin/env bash
# Validates the marketplace, every plugin it lists, their skills and mod tests.
# Needs claude, jq and yq (mikefarah).
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

git ls-files -z '*.json' | xargs -0 -n1 jq empty

claude plugin validate --strict .

plugins=$(jq -er '.plugins[] | "\(.name) \(.source)"' .claude-plugin/marketplace.json)

while read -r name source; do
  # `claude plugin validate` passes a marketplace entry that points nowhere
  manifest=$source/.claude-plugin/plugin.json
  [ -f "$manifest" ] || fail "$name: no $manifest"
  [ "$(jq -r .name "$manifest")" = "$name" ] || fail "$manifest: name is not '$name'"

  claude plugin validate --strict "$source" </dev/null

  # ...and it passes frontmatter that is not valid YAML
  for skill in "$source"/skills/*/SKILL.md; do
    [ -f "$skill" ] || continue
    dir=$(basename "$(dirname "$skill")")
    got=$(yq --front-matter=extract '.name' "$skill") || fail "$skill: bad frontmatter"
    [ "$got" = "$dir" ] || fail "$skill: name '$got' is not '$dir'"
    yq --front-matter=extract -e '.description' "$skill" >/dev/null || fail "$skill: no description"
  done

  if [ -n "$(find "$source" -name '*.test.ts' -o -name '*.test.tsx')" ]; then
    claude plugin test "$source" </dev/null
  fi
done <<<"$plugins"

echo "all checks passed"
