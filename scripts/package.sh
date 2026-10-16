#!/bin/sh
# Builds the Chrome Web Store upload from the committed files, leaving out store material and tooling.
set -eu
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain -- . ':!store' ':!scripts')" ]; then
  echo "Commit or stash your extension changes first; the zip is built from the last commit." >&2
  exit 1
fi
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
mkdir -p dist
out="dist/worldlet-$version.zip"
rm -f "$out"
git archive --format=zip -o "$out" HEAD -- . ':!store' ':!scripts' ':!.gitignore'
echo "$out"
unzip -l "$out" | tail -1
