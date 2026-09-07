# vite-plugin-bare

`vite-plugin-bare` runs a Vite module graph in a long-lived
[Bare](https://github.com/holepunchto/bare) worklet during development.
`bare-vite` separately builds the application with Vite and packages the result
with Bare Pack for production.

The Vite Environment API is still evolving. This package keeps its use behind
`BareDevEnvironment` and `BareHotChannel` so API changes remain localized.

Install Vite, the plugin, and the Bare implementations used by the default
runtime shell:

```sh
npm install vite vite-plugin-bare bare-fetch bare-ws bare-url bare-encoding bare-abort-controller
```

Node 20.19 or newer is required to run Vite and `bare-vite`. A BareKit host is
required to run the development shell on a device.

## Configure Vite

```ts
import { defineConfig } from 'vite'
import bare from 'vite-plugin-bare'

export default defineConfig({
  plugins: [
    bare({
      entry: './src/application.ts',
    }),
  ],
})
```

The plugin only applies to `vite serve`. It creates a `bare` environment and a
dedicated `ws://<host>:<port>/__bare_vite?environment=bare` endpoint on Vite's
HTTP server. The endpoint URL is printed when Vite starts. Pass this URL from
the Flutter/BareKit host into the worklet; do not compile it into app source.

Set an address explicitly when LAN discovery chooses the wrong interface:

```ts
bare({
  entry: './src/application.ts',
  devServer: { host: '192.168.1.100' },
})
```

## Start the Bare runtime

The host application owns worklet creation and Flutter RPC. Once the worklet
has received the server URL, start the stable runtime shell:

```ts
import { startBareViteRuntime } from 'vite-plugin-bare/runtime'

const runtime = await startBareViteRuntime({
  serverUrl,
  entry: '/src/application.ts',
  context: { sendToFlutter },
  reportError: sendErrorToFlutter,
})
```

The shell installs the configured Bare-backed Web globals, catches Bare
`uncaughtException` and `unhandledRejection` events, and keeps the WebSocket and
`ModuleRunner` alive across application restarts. Normal `import.meta.hot`
boundaries use Vite HMR. A Vite full reload calls the optional application
lifecycle in this order:

```ts
export async function dispose() {}
export async function start(context) {}
```

Changes to `bare-*` runtime dependencies emit
`bare:worklet-restart-required`; the Flutter host decides how to restart the
worklet.

## Production

```sh
bare-vite build
bare-vite build --host ios-arm64 --host android-arm64 --out-dir dist/bare
```

The command loads the same `bare(...)` options from the user's Vite config,
runs Vite programmatically, leaves Bare runtime packages external to the Vite
bundle, and passes the intermediate module graph to Bare Pack. The final
artifact is `bundle.bare` in the configured output directory. Vite owns normal
JavaScript dependencies and transforms; Bare Pack owns Bare modules, native
addons, assets, and host-specific linking.

Production builds are also available as a public API. Pass `config` to bypass
Bare config discovery from `vite.config`; Vite still loads that file for its
plugins, aliases, and defines unless `configFile` is explicitly `false`.

```ts
import { buildBareApp } from 'vite-plugin-bare'

const result = await buildBareApp({
  root: process.cwd(),
  config: {
    entry: './src/application.ts',
    build: { outDir: 'dist/bare', hosts: ['ios-arm64'] },
  },
})

console.log(result.artifact)
```

The same function is available from `vite-plugin-bare/build` when a dedicated
production-only import is preferable. For a build with no Vite config file:

```ts
await buildBareApp({
  configFile: false,
  config: { entry: './src/application.ts' },
})
```

## Configuration

```ts
interface BareViteConfig {
  entry: string
  runtime?: {
    globals?: Array<'fetch' | 'websocket' | 'url' | 'encoding' | 'abort-controller'>
    modules?: string[]
  }
  resolve?: { conditions?: string[] }
  devServer?: { host?: string; port?: number }
  build?: { outDir?: string; hosts?: string[] }
}
```

`runtime.modules` is the escape hatch for runtime/native packages that do not
follow the `bare-*` naming convention. Shared core helpers perform config
normalization, resolution conditions, and external classification in both dev
and production.

`runtime.globals` is additive: configured values are merged with the default
abort controller, encoding, URL, fetch, and WebSocket globals and then
deduplicated.

## Validation

The automated feasibility spike executes transformed TypeScript through the
custom WebSocket transport, resolves a `bare-*` external through Vite's default
`ESModulesEvaluator`, and applies accepted HMR without replacing the runner or
connection. Physical iOS/Android BareKit validation remains required in a host
application because this repository does not contain a Flutter shell or device
harness.

Run the repository checks with:

```sh
npm run check
npm test
npm run build
```
