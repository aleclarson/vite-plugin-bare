import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build, type Plugin } from 'vite'
import {
  normalizeBareViteConfig,
  type BareViteConfig,
  type NormalizedBareViteConfig,
} from '../core/config.js'
import { createBareExternalPredicate } from '../core/modules.js'
import { loadBareViteConfig } from './config.js'
import { packBareOutput } from './pack.js'

/** Options that control programmatic production builds. */
export interface BuildBareAppOptions {
  /** Bare configuration. When omitted, it is read from `bare(...)` in Vite config. */
  config?: BareViteConfig
  /** Project root used to resolve a directly supplied config. */
  root?: string
  /** Vite config path, automatic discovery when omitted, or `false` to disable it. */
  configFile?: string | false
  /** Overrides `config.build.outDir`. */
  outDir?: string
  /** Overrides `config.build.hosts`. */
  hosts?: string[]
}

/** Paths and target hosts produced by a programmatic build. */
export interface BuildBareAppResult {
  artifact: string
  intermediateEntry: string
  hosts: string[]
}

/**
 * Run the Vite production build and package its output with Bare Pack.
 *
 * Supply `options.config` to avoid discovering Bare settings from the Vite
 * plugin. The Vite config itself still loads unless `configFile` is `false`.
 */
export async function buildBareApp(
  options: BuildBareAppOptions = {},
): Promise<BuildBareAppResult> {
  const loaded = options.config
    ? {
        config: normalizeBareViteConfig(options.config, options.root),
        configFile: options.configFile,
      }
    : await loadDiscoveredConfig(options.root, options.configFile)
  const { config } = loaded
  const outDir = options.outDir ? resolve(config.root, options.outDir) : config.build.outDir
  const intermediateDir = join(outDir, '.vite')
  const hosts = options.hosts?.length ? options.hosts : config.build.hosts

  const result = await build({
    root: config.root,
    ...(loaded.configFile === undefined
      ? {}
      : { configFile: loaded.configFile }),
    plugins: [bareBuildExternals(config)],
    build: {
      outDir: intermediateDir,
      emptyOutDir: true,
      sourcemap: true,
      ssr: config.entry,
      rolldownOptions: {
        external: createBareExternalPredicate(config),
        output: {
          entryFileNames: 'application.mjs',
          chunkFileNames: 'chunks/[name]-[hash].mjs',
        },
      },
    },
    ssr: {
      noExternal: true,
      resolve: { conditions: config.resolve.conditions },
    },
  })

  const output = firstOutput(result)
  const entry = output.output.find((item) => item.type === 'chunk' && item.isEntry)
  if (!entry) throw new Error('Vite build did not produce an entry chunk')

  const intermediateEntry = join(intermediateDir, entry.fileName)
  const artifact = join(outDir, 'bundle.bare')
  const bundle = await packBareOutput({
    entry: intermediateEntry,
    hosts,
    linked: hosts.some((host) => host.startsWith('ios') || host.startsWith('android')),
  })
  await mkdir(outDir, { recursive: true })
  await writeFile(artifact, bundle)
  return { artifact, intermediateEntry, hosts }
}

async function loadDiscoveredConfig(
  root: string | undefined,
  configFile: string | false | undefined,
) {
  if (configFile === false) {
    throw new Error(
      'configFile cannot be false when Bare config discovery is required; pass options.config directly',
    )
  }
  return loadBareViteConfig(root, configFile)
}

function bareBuildExternals(config: NormalizedBareViteConfig): Plugin {
  return {
    name: 'vite-plugin-bare:build-externals',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      if (createBareExternalPredicate(config)(source)) {
        return { id: source, external: true }
      }
    },
  }
}

function firstOutput(
  result: Awaited<ReturnType<typeof build>>,
): BuildOutput {
  if ('on' in result) throw new Error('Watch mode is not supported by bare-vite build')
  return (Array.isArray(result) ? result[0]! : result) as unknown as BuildOutput
}

interface BuildOutput {
  output: Array<{
    type: 'asset' | 'chunk'
    fileName: string
    isEntry?: boolean
  }>
}
