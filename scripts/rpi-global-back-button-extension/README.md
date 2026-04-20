# Pathfinder Global Back Button (Raspberry Pi)

This extension adds a **Back to PDF** button on pages that are not part of Pathfinder.

## What it fixes
- If a PDF map link sends the current tab to Google Maps, the user can tap **Back to PDF** to return.
- The button appears globally on non-Pathfinder pages.
- Cursor is forced hidden on every page (including Google Maps).
- Cursor hiding is enforced via CSS + inline pointer-event enforcement to resist site-level cursor overrides.
- The button is suppressed on Pathfinder pages and on startup splash screens such as **"Pathfinder is loading"** and **"Pathfinder is starting"**.
- Back action now resolves to the last known `/last?...pdf=...` app page instead of raw browser history to avoid JSON endpoint dead-ends.
- Seamless return path is preserved: if browser history already points to `/last`, it uses native `history.back()` first to avoid unnecessary PDF reload/regeneration.
- App-page detection now also uses Pathfinder storage/title signals, so the global back button stays hidden on in-app routes like `/itinerary` across Pi host/IP variations.

## Files
- `manifest.json`
- `content.js`

## Install on Raspberry Pi Chromium
1. Copy this folder to the Pi.
2. Make launcher scripts executable:

```bash
chmod +x /home/pi/pathfinder-main/scripts/rpi-global-back-button-extension/start-kiosk-with-back-button.sh
chmod +x /home/pi/pathfinder-main/scripts/rpi-global-back-button-extension/setup-rpi-kiosk-autostart.sh
```

3. Run the setup script once to install cursor-hiding dependencies and register kiosk startup in LXDE autostart:

```bash
/home/pi/pathfinder-main/scripts/rpi-global-back-button-extension/setup-rpi-kiosk-autostart.sh
```

4. Reboot the Pi (or log out/in), then launch normally through autostart.
5. Manual launch (optional) with the extension flags:

```bash
chromium-browser \
  --kiosk http://localhost:5173/last \
  --disable-extensions-except=/home/pi/pathfinder-main/scripts/rpi-global-back-button-extension \
  --load-extension=/home/pi/pathfinder-main/scripts/rpi-global-back-button-extension
```

## Notes
- Default return URL is `http://localhost:5173/last`.
- You can edit `DEFAULT_RETURN_URL` in `content.js` if your app runs elsewhere.
- Allowed Pathfinder hosts are in `PATHFINDER_HOST_ALLOWLIST`.
- The setup script installs `unclutter-xfixes` (fallback: `unclutter`) for OS-level cursor hiding.
- The kiosk launcher starts Chromium with touch-centric cursor flags and enables global cursor hiding before opening the app.
