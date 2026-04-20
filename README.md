# Pathfinder
> Awesome AI-powered IoT map board for tourists

Pathfinder is an innovative project that leverages Raspberry Pi and AI technologies to deliver real-time tourist information, smart itineraries, and interactive maps. Designed for tourist destinations, it makes travel easier, more informative, and engaging—bringing every location to life with the help of smart data.

## Installing / Getting started

To get Pathfinder up and running on your Raspberry Pi, begin by cloning the repo and installing dependencies:

```shell
git clone https://github.com/bikemaster2331/pathfinder.git
cd pathfinder/
npm install
npm start
```

Running the above commands will start the Pathfinder server and web interface. Access it from your browser or connect to your IoT map board.

### Raspberry Pi Kiosk Cursor Hiding (System-Wide)

For touchscreen kiosk deployments where cursor must stay hidden even on external sites (for example, Google Maps), run:

```shell
chmod +x scripts/rpi-global-back-button-extension/start-kiosk-with-back-button.sh
chmod +x scripts/rpi-global-back-button-extension/setup-rpi-kiosk-autostart.sh
./scripts/rpi-global-back-button-extension/setup-rpi-kiosk-autostart.sh
```

This installs cursor-hiding dependencies (`unclutter-xfixes` with fallback) and adds kiosk launch to LXDE autostart.

### Wireless PDF Retrieval (Kiosk to Phone, Offline-Capable)

Pathfinder now supports a seamless **Send to phone** flow on `/last`:

- A QR code and short link are shown beside the PDF controls.
- The link stays active until the user taps **Finish & Home**.
- Retrieval works on local network and can fall back to Pi hotspot access.

Optional environment variables for deployment:

- `PATHFINDER_SHARE_BASE_URL`
  - Forces the primary share URL base (for example: `http://192.168.1.20:8000`).
- `PATHFINDER_HOTSPOT_HOST`
  - Fallback hotspot host/IP for alternate links (default: `192.168.4.1`).

Notes:
- This repository patch handles **application-level sharing** only.
- Hotspot service provisioning (hostapd/dnsmasq/system setup) remains deployment-specific.

### Initial Configuration

You might need to perform initial configuration for API keys, map data sources, and device settings. For example:

- Set up environment variables (such as MAP_API_KEY, OPENAI_KEY, etc.)
- Configure `config.json` for IoT device and network specifics
- Run `npm i` for any extra dependencies

## Developing

To begin development:

```shell
git clone https://github.com/bikemaster2331/pathfinder.git
cd pathfinder/
npm install
```

- Cloning fetches all source code
- `npm install` sets up dependencies
- Edit code in `/src` and run `npm start` to see your changes live

### Building

If you make code changes or want a production build:

```shell
npm run build
```

- This bundles the project and prepares deployment artifacts

### Deploying / Publishing

To deploy to your own server or IoT device:

```shell
npm run deploy
```

- This command uploads/builds for your configured device or server.
- For Vercel hosting: Deploy using `vercel --prod`

## Features

- Real-time tourist information powered by AI
- Smart itinerary suggestions and planning
- Interactive maps with IoT hardware integration (Raspberry Pi)
- Customizable for different tourist sites
- Web interface for easy access and management

## Configuration

Pathfinder accepts various configuration options:

#### MAP_API_KEY
Type: `String`  
Default: `''`
Set your map provider API key for enhanced map data and features.

#### OPENAI_KEY
Type: `String`  
Default: `''`
(Optional) Add your OpenAI API key for AI-powered recommendations.

#### DEVICE_NAME
Type: `String`  
Default: `'PathfinderPi'`
Give a custom name to the IoT board deployment.

Example:
```bash
export MAP_API_KEY="your_map_api_key"
export OPENAI_KEY="your_openai_api_key"
npm start
```

Copy and adjust as many arguments as your installation requires.

## Contributing

If you'd like to contribute, please fork the repository and use a feature branch. Pull requests are warmly welcome.

See the project's guidelines for code style and contribution rules (additionally, check for a `CONTRIBUTING.md` file).

## Links

- Project homepage: https://pathfinder-lilac.vercel.app
- Repository: https://github.com/bikemaster2331/pathfinder/
- Issue tracker: https://github.com/bikemaster2331/pathfinder/issues
  - For security bugs or sensitive issues, contact bikemaster2331 directly via GitHub.

## Licensing

The code in this project is licensed under Apache License 2.0.
See the LICENSE file for the full license text.
