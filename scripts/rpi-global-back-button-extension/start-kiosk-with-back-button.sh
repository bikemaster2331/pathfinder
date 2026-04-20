#!/usr/bin/env bash
set -euo pipefail

EXT_DIR="${EXT_DIR:-/home/pi/pathfinder-main/scripts/rpi-global-back-button-extension}"
APP_URL="${APP_URL:-http://localhost:5173/last}"
if [[ $# -ge 1 && -n "${1:-}" ]]; then
  APP_URL="$1"
fi

if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium"
else
  echo "[ERROR] Chromium binary not found (expected 'chromium-browser' or 'chromium')." >&2
  exit 1
fi

start_cursor_hider() {
  if ! command -v unclutter >/dev/null 2>&1; then
    echo "[WARN] 'unclutter' is not installed. Install unclutter-xfixes for global cursor hiding." >&2
    return
  fi

  pkill -x unclutter >/dev/null 2>&1 || true

  local unclutter_help
  unclutter_help="$(unclutter --help 2>&1 || true)"
  if printf '%s' "$unclutter_help" | grep -qi -- '--start-hidden'; then
    # Preferred: unclutter-xfixes style options.
    nohup unclutter --start-hidden --hide-on-touch --timeout 0 --jitter 0 >/dev/null 2>&1 &
  else
    # Fallback: legacy unclutter options.
    nohup unclutter -idle 0 -root -grab >/dev/null 2>&1 &
  fi
}

start_cursor_hider

"$CHROMIUM_BIN" \
  --kiosk "$APP_URL" \
  --ash-hide-cursor-on-touch \
  --touch-events=enabled \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=PullToRefresh \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions-except="$EXT_DIR" \
  --load-extension="$EXT_DIR"
