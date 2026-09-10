# OpenFlight Mobile

An [Expo](https://expo.dev/) (React Native) companion app for OpenFlight. It
connects to the OpenFlight server over Socket.IO and mirrors the web UI's live
shot data. The goal (see [ROADMAP.md](ROADMAP.md)) is a **complete standalone
interface** so a builder can run the Pi headless and skip the kiosk touchscreen.

The app lives in its own repo and is **self-contained** — it has no build-time
dependency on the server. The `Shot` type and socket event names are
deliberately mirrored from the Python wire contract in
[open-flight/openflight](https://github.com/open-flight/openflight) (`src/openflight/server.py`'s `shot_to_dict()` and
its SocketIO events) rather than shared with the web `ui/`.

## Prerequisites

- **Node.js** — the version pinned in this repo's `.node-version` (currently
  **v24**), and npm.
- **Expo Go on your phone** — the app targets **Expo SDK 57**, which is what
  both app stores currently ship, so a plain store install matches. Each Expo Go
  build supports exactly one SDK version; a mismatch is rejected with *"Project
  is incompatible with this version of Expo Go."* See
  [Keeping Expo Go and the SDK in sync](#keeping-expo-go-and-the-sdk-in-sync).
- **An Expo account**, signed in on *both* the CLI and Expo Go — see
  [Run it](#run-it). Expo Go requires this on iOS as of SDK 57.
- **Xcode 26.4 or newer**, only if you build natively or run the iOS Simulator.
  Expo SDK 57 requires it; older Xcode versions fail to build. Not needed to run
  the app in Expo Go on a physical phone.
- **A running OpenFlight server** to connect to (see
  [Connecting to the server](#connecting-to-the-server)).
- Your **phone and computer on the same Wi-Fi / LAN**.

## Install (first time only)

```bash
npm install
```

## Run the dev server

Once dependencies are installed:

```bash
npm start        # equivalently: npx expo start
```

This just starts Metro (it doesn't reinstall). It launches the bundler and
prints a **QR code** in the terminal.

## Testing on a phone with Expo Go

### Keeping Expo Go and the SDK in sync

Each Expo Go build supports exactly one SDK version. Both stores ship only the
**latest** build and offer no version picker, and a physical iPhone cannot
install an older one at all. The project therefore tracks the current SDK; a pin
would mean the app stops running on any phone whose Expo Go has auto-updated.

| Target | How to get Expo Go |
| --- | --- |
| **iPhone (physical)** | App Store — always the latest build. Older versions cannot be installed. |
| **Android (device or emulator)** | Play Store for the latest, or pick a specific SDK at [expo.dev/go](https://expo.dev/go) and sideload the APK (one Expo Go SDK per device at a time). |
| **iOS Simulator** | [expo.dev/go](https://expo.dev/go) — any SDK, so a simulator is the escape hatch when a device's Expo Go has outrun the project. |

When Expo ships a new SDK, phones auto-update and the project must follow. Per
[AGENTS.md](AGENTS.md) that is a dedicated PR: `npx expo install expo@^NN.0.0`,
then `npx expo install --fix`, with `npx expo-doctor` clean before committing.

> For anything beyond quick local testing, use a
> [development build](https://docs.expo.dev/develop/development-builds/introduction/)
> instead: a binary compiled for our exact SDK, independent of whatever Expo Go
> version the stores ship.

### Run it

1. Install Expo Go from your platform's store (see above).
2. Make sure your **phone and dev machine are on the same Wi-Fi network**.
3. **Sign in to the same Expo account on both ends.** As of SDK 57, Expo Go on
   iOS refuses to open a project unless the CLI and the app are both logged in
   as the same user:
   - **Terminal** — `npx expo login`, then follow the browser link.
   - **Expo Go** — Home tab, tap the avatar in the top-right, sign in.

   Expo Go names which side is missing if either is not signed in. This applies
   to Expo Go only; simulators and development builds are unaffected.
4. Start the dev server: `npm start`.
5. Scan the QR code:
   - **iOS** — open the built-in **Camera** app and point it at the QR; tap the
     Expo banner.
   - **Android** — open **Expo Go** and use its **Scan QR code** option.
6. The app downloads the JS bundle from Metro and opens on your phone. Saving a
   file hot-reloads it.

### If the QR / LAN connection fails

Some networks (guest Wi-Fi, corporate APs with client isolation) block the
phone from reaching Metro on your machine. Use a tunnel instead:

```bash
npx expo start --tunnel
```

Tunnel mode routes through Expo's servers (slower, needs `@expo/ngrok`) but
works across network boundaries.

### After changing `babel.config.js` or the entry point

Metro caches aggressively. Clear it so changes take effect:

```bash
npx expo start -c
```

### Simulator / emulator (optional)

If you have Xcode or Android Studio set up, you can skip the phone:

```bash
npm run ios       # iOS Simulator
npm run android   # Android emulator
```

## Connecting to the server

The app talks to the OpenFlight Python server's Socket.IO endpoint on **port
8080**.

1. Start a server for the app to reach. The server lives in
   [open-flight/openflight](https://github.com/open-flight/openflight). For development without hardware, run the mock
   server from a checkout of that repo:

   ```bash
   make dev        # scripts/start-kiosk.sh --mock
   ```

   Or run the real server on the Pi (`make start`).

2. Find the server machine's LAN IP:

   ```bash
   ipconfig getifaddr en0   # macOS
   hostname -I              # Linux / Raspberry Pi
   ```

3. In the app's connection screen, enter `http://<server-ip>:8080` (e.g.
   `http://192.168.1.100:8080`). A successful connection is remembered for next
   launch. The default guess is `http://192.168.1.100:8080` — change it to your
   server's address.

The phone and the server must be on the same LAN. There is a **Simulate**
action to generate a fake shot end-to-end once connected.

## Tests

```bash
npm test          # Jest (jest-expo)
npm run test:watch
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Expo Go refuses to open the project and asks you to log in | Sign in to the **same** Expo account on both sides: `npx expo login` in the terminal, and the avatar icon on Expo Go's Home tab. Required on iOS as of SDK 57. |
| "Project is incompatible with this version of Expo Go" | Expo Go and the project disagree on SDK version. If Expo Go is *newer*, the project needs an SDK upgrade PR — see [Keeping Expo Go and the SDK in sync](#keeping-expo-go-and-the-sdk-in-sync). If it is older, update Expo Go from the store. |
| App loads but can't connect to the server | Confirm phone + server share the LAN, the server is running on port 8080, the IP is correct, and no firewall blocks 8080. |
| QR scan does nothing / times out | Use `npx expo start --tunnel`. |
| Stale code after editing babel/entry config | `npx expo start -c` to clear the Metro cache. |
