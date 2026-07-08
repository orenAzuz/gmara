#!/bin/bash
cd /home/orez/Music/gmara
export DISPLAY=:0
PROFILE="/tmp/claude-1000/-home-orez-Music/786a4cd5-1899-46c6-9860-ae939e291829/scratchpad/gmara-profile"
exec ./node_modules/.bin/electron . --user-data-dir="$PROFILE"
