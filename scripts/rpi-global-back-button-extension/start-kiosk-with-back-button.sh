#!/usr/bin/env bash
set -euo pipefail

EXT_DIR="/home/pi/pathfinder-main/scripts/rpi-global-back-button-extension"
APP_URL="http://localhost:5173/last"

chromium-browser \
  --kiosk "$APP_URL" \
  --disable-extensions-except="$EXT_DIR" \
  --load-extension="$EXT_DIR"
