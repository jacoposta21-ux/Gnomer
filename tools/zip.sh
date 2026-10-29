#!/bin/sh
# Packs the game for CrazyGames: index.html sits at the root of the zip.
# Usage: sh tools/zip.sh   ->   grim-acres.zip
set -e
cd "$(dirname "$0")/.."
rm -f grim-acres.zip
zip -r -q grim-acres.zip index.html js strings assets -x '*.DS_Store'
echo "Created grim-acres.zip: $(du -h grim-acres.zip | cut -f1), $(unzip -l grim-acres.zip | tail -1 | awk '{print $2}') files"
