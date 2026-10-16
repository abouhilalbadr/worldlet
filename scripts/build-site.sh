#!/bin/sh
# Copies the 3D engine, font and images from the extension into the website folder.
# The copies are generated (git-ignored); run this before every site deploy.
set -eu
cd "$(dirname "$0")/.."
site=store/worldlet-site
rm -rf "$site/engine" "$site/assets"
mkdir -p "$site/engine/js" "$site/assets/shots" "$site/assets/fonts" "$site/assets/scenes"
cp -R lib "$site/engine/lib"
cp js/world.js js/weather.js js/custom-scene.js "$site/engine/js/"
cp -R js/scenes "$site/engine/js/scenes"
cp fonts/nunito-latin-wght-normal.woff2 fonts/OFL.txt "$site/assets/fonts/"
cp icons/icon48.png icons/icon128.png "$site/assets/"
cp icons/scenes/*.jpg "$site/assets/scenes/"
for f in store/screenshots/*.png; do
  sips -s format jpeg -s formatOptions 82 "$f" --out "$site/assets/shots/$(basename "$f" .png).jpg" >/dev/null
done
sips -s format jpeg -s formatOptions 82 store/promo/island.png --out "$site/assets/hero.jpg" >/dev/null
sips -s format jpeg -s formatOptions 85 store/promo/promo-marquee-1400x560.png --out "$site/assets/og.jpg" >/dev/null
echo "Site assets ready in $site"
