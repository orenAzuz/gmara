#!/bin/bash
set -e
cd /home/orez/Music/gmara
rm -rf web-build
mkdir -p web-build/assets
cp src/index.html src/*.js src/*.css web-build/
cp -r assets/fonts web-build/assets/fonts
sed -i 's|\.\./assets/fonts|assets/fonts|g' web-build/styles.css
echo "web-build ready ($(ls web-build | wc -l) files + fonts)"
