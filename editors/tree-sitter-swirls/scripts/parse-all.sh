#!/bin/sh
# Parse every real .swirls file in the repository and fail if any of them
# produces an ERROR or MISSING node.
#
#   scripts/parse-all.sh              cookbook, examples and fixtures
#   scripts/parse-all.sh DIR...       the same, plus every .swirls file under DIR
#
# Left out on purpose:
#   *.ts.swirls            TypeScript modules referenced by `@ts "path"`, not the DSL
#   invalid-syntax.swirls  packages/language/src/__fixtures__: malformed on purpose,
#                          for the compiler's error recovery tests
set -eu

grammar_dir=$(cd "$(dirname "$0")/.." && pwd)
repo_root=$(cd "$grammar_dir/../.." && pwd)

tree_sitter="$grammar_dir/node_modules/.bin/tree-sitter"
if [ ! -x "$tree_sitter" ]; then
  echo "tree-sitter CLI not found; run \`npm install\` in $grammar_dir" >&2
  exit 1
fi

paths=$(mktemp)
trap 'rm -f "$paths"' EXIT

find \
  "$repo_root/cookbook" \
  "$repo_root/packages/language/examples" \
  "$repo_root/packages/language/src/__fixtures__" \
  "$repo_root/packages/lsp/src/__fixtures__" \
  "$@" \
  -type f -name '*.swirls' \
  ! -name '*.ts.swirls' \
  ! -name 'invalid-syntax.swirls' \
  | sort > "$paths"

if [ ! -s "$paths" ]; then
  echo "no .swirls files found under $repo_root" >&2
  exit 1
fi

cd "$grammar_dir"

# `parse` exits non-zero when any file has an ERROR or MISSING node, and
# --quiet limits the output to those files.
if "$tree_sitter" parse --quiet --stat --paths "$paths"; then
  exit 0
fi

echo "some files did not parse cleanly (listed above)" >&2
exit 1
