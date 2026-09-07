# BareKit device validation

This harness runs the compiled `vite-plugin-bare` runtime inside a real BareKit
worklet. It provides small native iOS and Android hosts so device validation
does not depend on a Flutter application.

The harness is manual and is not part of CI.

## Prerequisites

- Node.js 20.19 or newer and npm
- `unzip`
- For iOS: Xcode and [XcodeGen](https://github.com/yonaskolb/XcodeGen)
- For Android: Android Studio, an Android SDK with API 35, and JDK 17
- A physical device on the same network as the development machine

The first preparation downloads the BareKit 2.4.3 prebuild archive, which is
about 415 MB. Generated bundles, native libraries, build products, and the
Xcode project are ignored by Git.

## Prepare the hosts

From the repository root, run:

```sh
npm install
npm run device:prepare
```

This command builds the package with tsdown, packs development and production
fixtures for all supported iOS and Android architectures, links their native
addons, and generates `ios/BareViteDevice.xcodeproj`.

To regenerate only the JavaScript bundles while working on the fixture, use:

```sh
npm run device:prepare -- --bundles-only
```

## Start development mode

Run Vite on the local network:

```sh
npm run device:dev
```

Copy the printed `ws://.../__bare_vite?environment=bare` URL. Use the machine's
LAN address; `0.0.0.0` and `localhost` cannot be reached from a physical device.

### iOS

1. Open `test/device/ios/BareViteDevice.xcodeproj` in Xcode.
2. Select the `BareViteDevice` target, choose a signing team, and select the
   connected iPhone or iPad.
3. Run the application and allow local-network access when prompted.

### Android

1. Open the `test/device/android` directory in Android Studio.
2. Configure Gradle to use JDK 17 if necessary.
3. Select the connected device and run the `app` configuration.

The equivalent command-line build is:

```sh
JAVA_HOME=/path/to/jdk-17 ANDROID_HOME=/path/to/android-sdk \
  gradle -p test/device/android assembleDebug
```

## Exercise the runtime

Paste the Vite WebSocket URL into the host and select **Start development**.
The on-screen log should contain a `start` event with `generation: 1`,
`value: 1`, and all global checks set to `true`:

```json
{
  "type": "start",
  "generation": 1,
  "value": 1,
  "platform": "...",
  "arch": "...",
  "globals": {
    "AbortController": true,
    "TextEncoder": true,
    "TextDecoder": true,
    "URL": true,
    "fetch": true,
    "WebSocket": true
  }
}
```

Then perform these checks:

1. Change `test/device/app/value.ts` from `1` to `2`. The same worklet should report
   `{"type":"hmr","value":2}`.
2. Change `generation` in `test/device/app/application.ts` from `1` to `2`. The log should
   show `dispose`, a new `start` event, and an `application-restarted` status.
3. Stop Vite and select **Start production**. The bundled fixture should report
   `{"type":"production-start","platform":"...","arch":"..."}` without a
   development server.

Device logs use the `BareViteDevice` tag. Read them in the Xcode console or on
Android with:

```sh
adb logcat -s BareViteDevice
```

If development mode cannot connect, confirm the device and development machine
are on the same network, allow the host process through the firewall, and
verify that the URL contains the machine's reachable LAN address. Android
cleartext traffic and iOS local-network access are enabled by these test hosts.

This harness validates BareKit, linked native addons, runtime globals, Vite
transport, HMR, application restart, and the production artifact. A consumer's
Flutter-to-worklet RPC layer remains separate and should be tested in that
consumer application.

## Scripted simulator startup

The native hosts also expose opt-in startup controls for repeatable simulator
checks. Normal interactive startup is unchanged.

On iOS, set `BARE_VITE_DEVICE_MODE` to `development` or `production` in the
launched process environment. Development mode also accepts
`BARE_VITE_SERVER_URL`.

On Android, pass the same values as `mode` and `serverUrl` string extras:

```sh
adb shell am start -n dev.alloc.vitebare.device/.MainActivity \
  --es mode development \
  --es serverUrl 'ws://10.0.2.2:5173/__bare_vite?environment=bare'
```
