import { resolve } from 'node:path'
import {
  loadConfigFromFile,
  type ConfigEnv,
  type PluginOption,
  type UserConfig,
} from 'vite'
import { BARE_PLUGIN_CONFIG } from '../core/constants.js'
import {
  normalizeBareViteConfig,
  type BareViteConfig,
  type NormalizedBareViteConfig,
} from '../core/config.js'

interface ConfiguredBarePlugin {
  [BARE_PLUGIN_CONFIG]: BareViteConfig
}

export async function loadBareViteConfig(
  root = process.cwd(),
  configFile?: string,
): Promise<{
  config: NormalizedBareViteConfig
  configFile?: string
  viteConfig: UserConfig
}> {
  const environment: ConfigEnv = {
    command: 'build',
    mode: 'production',
    isSsrBuild: true,
    isPreview: false,
  }
  const loaded = await loadConfigFromFile(
    environment,
    configFile,
    resolve(root),
  )
  if (!loaded) {
    throw new Error(`No Vite config found from ${resolve(root)}`)
  }

  const barePlugin = findBarePlugin(loaded.config.plugins ?? [])
  if (!barePlugin) {
    throw new Error(
      'No vite-plugin-bare instance found in the Vite config. Add bare({ entry: ... }) to plugins.',
    )
  }
  const resolvedRoot = resolve(root, loaded.config.root ?? '.')
  return {
    config: normalizeBareViteConfig(barePlugin[BARE_PLUGIN_CONFIG], resolvedRoot),
    configFile: loaded.path,
    viteConfig: loaded.config,
  }
}

function findBarePlugin(plugins: readonly PluginOption[]): ConfiguredBarePlugin | undefined {
  for (const value of plugins) {
    if (Array.isArray(value)) {
      const nested = findBarePlugin(value)
      if (nested) return nested
    } else if (
      value &&
      typeof value === 'object' &&
      BARE_PLUGIN_CONFIG in value
    ) {
      return value as ConfiguredBarePlugin
    }
  }
  return undefined
}

