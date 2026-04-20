#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/pi/pathfinder-main}"
APP_URL="${APP_URL:-http://localhost:5173/last}"
if [[ $# -ge 1 && -n "${1:-}" ]]; then
  APP_URL="$1"
fi

KIOSK_SCRIPT="${KIOSK_SCRIPT:-$PROJECT_ROOT/scripts/rpi-global-back-button-extension/start-kiosk-with-back-button.sh}"
AUTOSTART_FILE="${AUTOSTART_FILE:-$HOME/.config/lxsession/LXDE-pi/autostart}"

if [[ ! -f "$KIOSK_SCRIPT" ]]; then
  echo "[ERROR] Kiosk launcher not found: $KIOSK_SCRIPT" >&2
  exit 1
fi

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "[ERROR] Root privileges are required, and sudo is not available." >&2
  exit 1
}

install_unclutter_package() {
  run_as_root apt-get update
  if ! run_as_root apt-get install -y unclutter-xfixes; then
    echo "[WARN] Failed to install unclutter-xfixes; falling back to legacy unclutter." >&2
    run_as_root apt-get install -y unclutter
  fi
}

ensure_line() {
  local line="$1"
  if [[ ! -f "$AUTOSTART_FILE" ]]; then
    printf '%s\n' "$line" > "$AUTOSTART_FILE"
    return
  fi

  if ! grep -Fqx "$line" "$AUTOSTART_FILE"; then
    printf '%s\n' "$line" >> "$AUTOSTART_FILE"
  fi
}

install_unclutter_package

mkdir -p "$(dirname "$AUTOSTART_FILE")"
touch "$AUTOSTART_FILE"

START_LINE="@bash $KIOSK_SCRIPT $APP_URL"
ensure_line "$START_LINE"

echo "[OK] Installed cursor-hider dependency and updated LXDE autostart."
echo "[OK] Autostart command: $START_LINE"
echo "[NEXT] Reboot or log out/in to apply changes."
