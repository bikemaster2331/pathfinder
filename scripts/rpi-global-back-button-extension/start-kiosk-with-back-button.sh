#!/usr/bin/env bash
set -euo pipefail

EXT_DIR="/home/pi/pathfinder-main/scripts/rpi-global-back-button-extension"
APP_URL="http://localhost:5173/last"

if command -v unclutter >/dev/null 2>&1; then
  pkill -f "unclutter -idle 0 -root -grab" >/dev/null 2>&1 || true
  nohup unclutter -idle 0 -root -grab >/dev/null 2>&1 &
fi

chromium-browser \
  --kiosk "$APP_URL" \
  --ash-hide-cursor-on-touch \
  --touch-events=enabled \
  --disable-extensions-except="$EXT_DIR" \
  --load-extension="$EXT_DIR"
