#!/bin/bash
set +e
cd /home/orez/Music/gmara
export DISPLAY=:0
PROFILE="/tmp/gmara-dev-profile"
pkill -9 -f "Music/gmara/node_modules/electron" 2>/dev/null
rm -f "$PROFILE"/Singleton* 2>/dev/null
exec ./node_modules/.bin/electron . --user-data-dir="$PROFILE"
