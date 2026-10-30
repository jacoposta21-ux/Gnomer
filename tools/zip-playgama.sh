#!/bin/sh
# Packs the game for Playgama: same files, but the CrazyGames SDK tag is swapped for the
# Playgama Bridge (vendor/playgama). index.html sits at the root of the zip.
# Usage: sh tools/zip-playgama.sh   ->   grim-acres-playgama.zip
set -e
cd "$(dirname "$0")/.."
OUT="$PWD/grim-acres-playgama.zip"
TMP=$(mktemp -d)
cp -R index.html js strings assets "$TMP"/
cp vendor/playgama/playgama-bridge.js vendor/playgama/playgama-bridge-config.json "$TMP"/
sed -i.bak 's#<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>#<script src="playgama-bridge.js"></script>#' "$TMP/index.html"
rm -f "$TMP/index.html.bak"
grep -q 'playgama-bridge.js' "$TMP/index.html"
rm -f "$OUT"
(cd "$TMP" && zip -r -q "$OUT" . -x '*.DS_Store')
rm -rf "$TMP"
echo "Created grim-acres-playgama.zip: $(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files"
