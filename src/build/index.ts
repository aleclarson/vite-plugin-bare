import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build, type Plugin } from 'vite'
import type { NormalizedBareViteConfig } from '../core/config.js'
import { createBareExternalPredicate } from '../core/modules.js'
import { loadBareViteConfig } from './config.js'
import { packBareOutput } from './pack.js'

export interface BuildBareAppOptions {
  root?: string
  configFile?: string
  outDir?: string
  hosts?: string[]
}

export interface BuildBareAppResult {
  artifact: string
  intermediateEntry: string
  hosts: string[]
}

export async function buildBareApp(
  options: BuildBareAppOptions = {},
): Promise<BuildBareAppResult> {
  const loaded = await loadBareViteConfig(options.root, options.configFile)
  const config = loaded.config
  const outDir = options.outDir ? resolve(config.root, options.outDir) : config.build.outDir
  const intermediateDir = join(outDir, '.vite')
  const hosts = options.hosts?.length ? options.hosts : config.build.hosts

  const result = await build({
    root: config.root,
    ...(loaded.configFile ? { configFile: loaded.configFile } : {}),
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

export * from './config.js'
export * from './pack.js'
