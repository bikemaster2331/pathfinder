# Pathfinder Global Back Button (Raspberry Pi)

This extension adds a **Back to PDF** button on pages that are not part of Pathfinder.

## What it fixes
- If a PDF map link sends the current tab to Google Maps, the user can tap **Back to PDF** to return.
- The button appears globally on non-Pathfinder pages.
- Cursor is forced hidden on every page (including Google Maps).
- The button is suppressed on Pathfinder pages and on the **"Pathfinder is loading"** splash screen.

## Files
- `manifest.json`
- `content.js`

## Install on Raspberry Pi Chromium
1. Copy this folder to the Pi.
2. Launch Chromium with the extension flags:

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
- Optional but recommended on Raspberry Pi kiosk: install `unclutter` so the OS cursor stays hidden.
