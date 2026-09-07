import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import {
  DEFAULT_RUNTIME_GLOBALS,
  type BareRuntimeGlobal,
} from './runtime.js'

export type { BareRuntimeGlobal } from './runtime.js'

/** Shared user configuration consumed by the dev plugin and production CLI. */
export interface BareViteConfig {
  /** Application module, resolved relative to the Vite root. */
  entry: string
  /** Stable worklet-shell globals and additional native/runtime modules. */
  runtime?: {
    /**
     * Additional Web APIs installed before application startup. These are
     * merged with and deduplicated against the default runtime globals.
     *
     * @defaultValue abort controller, encoding, URL, fetch, and WebSocket.
     */
    globals?: BareRuntimeGlobal[]
    /**
     * Additional package names treated as stable Bare runtime dependencies.
     * Use this for native packages that do not follow the `bare-*` convention.
     *
     * @defaultValue `[]`
     */
    modules?: string[]
  }
  /** Conditions appended to the default Bare resolution conditions. */
  resolve?: {
    /**
     * Extra package-export conditions after `bare`, `worklet`, and `module`.
     *
     * @defaultValue `[]`
     */
    conditions?: string[]
  }
  /** Address advertised to a physical device during development. */
  devServer?: {
    /**
     * LAN hostname or IP address advertised in the worklet WebSocket URL.
     *
     * @defaultValue The first discoverable non-internal IPv4 address.
     */
    host?: string
    /**
     * Vite HTTP server port.
     *
     * @defaultValue Vite's configured port, normally `5173`.
     */
    port?: number
  }
  /** Production artifact location and Bare Pack target hosts. */
  build?: {
    /**
     * Output directory relative to the Vite project root.
     *
     * @defaultValue `dist/bare`
     */
    outDir?: string
    /**
     * Bare Pack target identifiers, such as `ios-arm64` or `android-arm64`.
     *
     * @defaultValue Bare Pack's current host.
     */
    hosts?: string[]
  }
}

export interface NormalizedBareViteConfig {
  root: string
  entry: string
  runtime: {
    globals: BareRuntimeGlobal[]
    modules: string[]
  }
  resolve: {
    conditions: string[]
  }
  devServer: {
    host?: string
    port?: number
  }
  build: {
    outDir: string
    hosts: string[]
  }
}

export const DEFAULT_BARE_CONDITIONS = ['bare', 'worklet', 'module']
export function normalizeBareViteConfig(
  config: BareViteConfig,
  root = process.cwd(),
): NormalizedBareViteConfig {
  if (!config.entry || !config.entry.trim()) {
    throw new Error('vite-plugin-bare requires a non-empty entry path')
  }

  const resolvedRoot = resolve(root)
  return {
    root: resolvedRoot,
    entry: resolve(resolvedRoot, config.entry),
    runtime: {
      globals: [
        ...new Set([
          ...DEFAULT_RUNTIME_GLOBALS,
          ...(config.runtime?.globals ?? []),
        ]),
      ],
      modules: [...(config.runtime?.modules ?? [])],
    },
    resolve: {
      conditions: [
        ...new Set([
          ...DEFAULT_BARE_CONDITIONS,
          ...(config.resolve?.conditions ?? []),
        ]),
      ],
    },
    devServer: {
      ...(config.devServer?.host ? { host: config.devServer.host } : {}),
      ...(config.devServer?.port ? { port: config.devServer.port } : {}),
    },
    build: {
      outDir: resolve(resolvedRoot, config.build?.outDir ?? 'dist/bare'),
      hosts: [...(config.build?.hosts ?? [])],
    },
  }
}

export function discoverLanHost(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (
        address.family === 'IPv4' &&
        !address.internal &&
        isIP(address.address) === 4
      ) {
        return address.address
      }
    }
  }
  return undefined
}
