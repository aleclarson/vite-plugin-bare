import { relative, sep } from "node:path"

import type { Plugin, UserConfig, ViteDevServer } from "vite"

import {
  discoverLanHost,
  normalizeBareViteConfig,
  type BareViteConfig,
  type NormalizedBareViteConfig,
} from "../core/config.js"
import { BARE_ENVIRONMENT, BARE_PLUGIN_CONFIG, BARE_WS_PATH } from "../core/constants.js"
import { createBareEnvironmentOptions } from "../core/environment.js"
import { isBareRuntimeModule } from "../core/modules.js"
import { BareDevEnvironment } from "./environment.js"
import { BareHotChannel } from "./hot-channel.js"

interface BareVitePlugin extends Plugin {
  [BARE_PLUGIN_CONFIG]: BareViteConfig
}

/**
 * Create the development-only Vite plugin and its remote Bare environment.
 *
 * @param options - Configuration shared with the `bare-vite build` command.
 */
export default function bare(options: BareViteConfig): Plugin {
  let normalized: NormalizedBareViteConfig
  let channel: BareHotChannel

  const plugin: BareVitePlugin = {
    name: "vite-plugin-bare",
    apply: "serve",
    [BARE_PLUGIN_CONFIG]: options,

    applyToEnvironment(environment) {
      return environment.name === BARE_ENVIRONMENT
    },

    config(userConfig): UserConfig {
      normalized = normalizeBareViteConfig(options, userConfig.root ?? process.cwd())
      channel = new BareHotChannel()
      const environment = createBareEnvironmentOptions(normalized)

      return {
        appType: "custom",
        server: {
          host: normalized.devServer.host ?? true,
          ...(normalized.devServer.port ? { port: normalized.devServer.port } : {}),
        },
        environments: {
          [BARE_ENVIRONMENT]: {
            ...environment,
            dev: {
              ...environment.dev,
              createEnvironment(name, config, context) {
                return new BareDevEnvironment(name, config, {
                  ...context,
                  hot: true,
                  transport: channel,
                  options: environment,
                })
              },
            },
          },
        },
      }
    },

    configEnvironment(name) {
      if (name === BARE_ENVIRONMENT) return createBareEnvironmentOptions(normalized)
    },

    resolveId(source) {
      if (
        this.environment?.name === BARE_ENVIRONMENT &&
        isBareRuntimeModule(source, normalized.runtime.modules)
      ) {
        return {
          id: source,
          external: true,
        }
      }
    },

    configureServer(server) {
      attachChannel(server, channel)
      server.httpServer?.once("listening", () => {
        const url = resolveBareDevServerUrl(server, normalized)

        server.config.logger.info(`  Bare runner: ${url}`)
      })
    },

    hotUpdate(context) {
      if (this.environment.name !== BARE_ENVIRONMENT) return
      if (requiresWorkletRestart(context.file, normalized)) {
        this.environment.hot.send("bare:worklet-restart-required", {
          files: [context.file],
          reason: "A stable Bare runtime module changed",
        })
        return []
      }
    },
  }

  return plugin
}

function attachChannel(server: ViteDevServer, channel: BareHotChannel): void {
  if (!server.httpServer) {
    throw new Error("vite-plugin-bare requires Vite to own an HTTP server")
  }

  channel.attach(server.httpServer)
}

function requiresWorkletRestart(file: string, config: NormalizedBareViteConfig): boolean {
  const normalizedFile = file.split(sep).join("/")
  const nodeModules = normalizedFile.match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/)

  if (nodeModules?.[1] && isBareRuntimeModule(nodeModules[1], config.runtime.modules)) {
    return true
  }

  return false
}

function resolveBareDevServerUrl(server: ViteDevServer, config: NormalizedBareViteConfig): string {
  const address = server.httpServer?.address()
  const port =
    typeof address === "object" && address ? address.port : (config.devServer.port ?? 5173)

  const host = config.devServer.host ?? discoverLanHost() ?? "127.0.0.1"
  const rootRelativeEntry = `/${relative(config.root, config.entry).split(sep).join("/")}`
  const url = new URL(`ws://${host}:${port}${BARE_WS_PATH}`)

  url.searchParams.set("environment", BARE_ENVIRONMENT)
  url.searchParams.set("entry", rootRelativeEntry)
  return url.toString()
}
