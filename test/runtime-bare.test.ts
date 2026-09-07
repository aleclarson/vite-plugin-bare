import type { ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import bare from '../src/index.js'
import { buildBareApp } from '../src/build/index.js'

interface BareTestEvent {
  type: string
  [key: string]: unknown
}

const require = createRequire(import.meta.url)
const spawnBare = require('bare-runtime/spawn') as (
  referrer: string,
  options: {
    args: string[]
    cwd?: string
    stdio: ['ignore', 'pipe', 'pipe']
  },
) => ChildProcess

describe('Bare runtime integration', () => {
  let server: ViteDevServer | undefined
  let child: ChildProcess | undefined

  afterEach(async () => {
    child?.kill()
    await server?.close()
  })

  it('starts the compiled runtime and applies HMR inside Bare', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vite-plugin-bare-runtime-'))
    const entry = join(root, 'application.ts')
    const valueFile = join(root, 'value.ts')

    await writeFile(entry, applicationSource(1))
    await writeFile(valueFile, 'export const value = 1\n')

    try {
      server = await createServer({
        root,
        logLevel: 'silent',
        plugins: [bare({ entry: './application.ts' })],
      })
      await server.listen()
      const address = server.httpServer?.address()
      if (!address || typeof address === 'string') throw new Error('Missing Vite port')

      const runner = resolve(import.meta.dirname, 'fixtures/runtime/runner.mjs')
      const events: BareTestEvent[] = []
      const stderr: string[] = []
      child = spawnBare('bare', {
        args: [
          runner,
          `ws://127.0.0.1:${address.port}/__bare_vite?environment=bare`,
          '/application.ts',
        ],
        cwd: resolve(import.meta.dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      if (!child.stdout || !child.stderr) throw new Error('Bare stdio was not piped')

      createInterface({ input: child.stdout }).on('line', (line) => {
        if (line.startsWith('BARE_TEST:')) {
          events.push(JSON.parse(line.slice('BARE_TEST:'.length)) as BareTestEvent)
        }
      })
      child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

      await expect
        .poll(() => findEvent(events, 'start', { generation: 1 }), {
          timeout: 10_000,
          message: 'Bare did not start',
        })
        .toMatchObject({
          type: 'start',
          generation: 1,
          value: 1,
          context: { runtime: 'bare' },
          globals: {
            AbortController: true,
            TextDecoder: true,
            URL: true,
            fetch: true,
            WebSocket: true,
          },
        })

      await writeFile(valueFile, 'export const value = 2\n')
      await expect
        .poll(() => findEvent(events, 'hmr', { value: 2 }), { timeout: 5_000 })
        .toMatchObject({ type: 'hmr', value: 2 })

      await writeFile(entry, applicationSource(2))
      await expect
        .poll(() => findEvent(events, 'start', { generation: 2 }), { timeout: 5_000 })
        .toMatchObject({ type: 'start', generation: 2, value: 2 })
      expect(findEvent(events, 'dispose', { generation: 1 })).toBeTruthy()
      expect(findEvent(events, 'status', { status: 'application-restarted' })).toBeTruthy()
      expect(events.find((event) => event.type === 'error')).toBeUndefined()
    } finally {
      child?.kill()
      child = undefined
      await server?.close()
      server = undefined
      await rm(root, { recursive: true, force: true })
    }
  })

  it('executes the production bundle inside Bare', async () => {
    const root = resolve(import.meta.dirname, 'fixtures/build')
    const result = await buildBareApp({
      root,
      configFile: false,
      outDir: 'dist/runtime-test',
      config: { entry: './src/production.ts' },
    })
    const loader = resolve(import.meta.dirname, 'fixtures/runtime/load-bundle.mjs')
    // `.bare` is our artifact name; Bare's module loader identifies bundle
    // source from the virtual filename supplied by an embedder.
    const bundleUrl = pathToFileURL(`${result.artifact}.bundle`).href

    const execution = spawnBare('bare', {
      args: [loader, result.artifact, bundleUrl],
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child = execution
    const { stdout, stderr, code } = await collectProcess(execution)
    child = undefined

    expect(code, stderr).toBe(0)
    expect(stdout).toContain('BARE_PRODUCTION:{"value":1,"dynamic":2}')
  })
})

function applicationSource(generation: number): string {
  return `import { value } from './value.ts'\n` +
    `const report = globalThis.__bareViteTestReport\n` +
    `export function start(context) {\n` +
    `  report({ type: 'start', generation: ${generation}, value, context, globals: {\n` +
    `    AbortController: typeof AbortController === 'function',\n` +
    `    TextDecoder: typeof TextDecoder === 'function',\n` +
    `    URL: typeof URL === 'function',\n` +
    `    fetch: typeof fetch === 'function',\n` +
    `    WebSocket: typeof WebSocket === 'function',\n` +
    `  } })\n` +
    `}\n` +
    `export function dispose() { report({ type: 'dispose', generation: ${generation} }) }\n` +
    `if (import.meta.hot) import.meta.hot.accept('./value.ts', (next) => {\n` +
    `  report({ type: 'hmr', value: next.value })\n` +
    `})\n`
}

function findEvent(
  events: BareTestEvent[],
  type: string,
  fields: Record<string, unknown>,
): BareTestEvent | undefined {
  return events.find(
    (event) =>
      event.type === type &&
      Object.entries(fields).every(([key, value]) => event[key] === value),
  )
}

function collectProcess(child: ChildProcess): Promise<{
  stdout: string
  stderr: string
  code: number | null
}> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    child.once('error', reject)
    child.once('close', (code) => resolve({ stdout, stderr, code }))
  })
}
