import { EventEmitter } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createServer, type ViteDevServer } from "vite"
import { createNodeImportMeta, ESModulesEvaluator, ModuleRunner } from "vite/module-runner"
import { afterEach, describe, expect, it } from "vitest"
import WebSocket from "ws"

import bare from "../src/index.js"
import { createBareViteTransport, type BareSocket } from "../src/runtime/transport.js"

class NodeSocketAdapter extends EventEmitter implements BareSocket {
  destroyed = false
  readonly socket: WebSocket
  readonly #pending: string[] = []

  constructor(url: string) {
    super()
    this.socket = new WebSocket(url)
    this.socket.on("open", () => {
      for (const message of this.#pending.splice(0)) this.socket.send(message)
    })
    this.socket.on("message", (data) => this.emit("data", data))
    this.socket.on("error", (error) => this.emit("error", error))
    this.socket.on("close", () => {
      this.destroyed = true
      this.emit("close")
    })
  }

  write(data: string): boolean {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data)
    else this.#pending.push(data)
    return true
  }

  end(): void {
    this.socket.close()
  }
}

describe("Bare feasibility spike", () => {
  let server: ViteDevServer | undefined

  afterEach(async () => server?.close())

  it("executes transformed TypeScript and a bare-* external over the dedicated socket", async () => {
    server = await createServer({
      root: import.meta.dirname.replace(/\/test$/, ""),
      logLevel: "silent",
      plugins: [bare({ entry: "./test/fixtures/spike/application.ts" })],
    })
    await server.listen()
    const address = server.httpServer?.address()

    if (!address || typeof address === "string") throw new Error("Missing Vite port")
    const transport = createBareViteTransport({
      url: `ws://127.0.0.1:${address.port}/__bare_vite?environment=bare`,
      createSocket: (url) => new NodeSocketAdapter(url),
      reconnectDelay: 10,
    })

    const runner = new ModuleRunner(
      {
        transport,
        createImportMeta: createNodeImportMeta,
      },
      new ESModulesEvaluator(),
    )

    const application = await runner.import<{ externalResolved: boolean }>(
      "/test/fixtures/spike/application.ts",
    )

    expect(application.externalResolved).toBe(true)
    await runner.close()
  })

  it("applies accepted HMR without reconnecting the runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "vite-plugin-bare-hmr-"))
    const entry = join(root, "application.ts")
    const valueFile = join(root, "value.ts")

    await writeFile(
      entry,
      `import { value } from './value.ts'\n` +
        `export let current = value\n` +
        `if (import.meta.hot) import.meta.hot.accept('./value.ts', (next) => { current = next.value })\n`,
    )
    await writeFile(valueFile, "export const value = 1\n")

    try {
      server = await createServer({
        root,
        logLevel: "silent",
        plugins: [bare({ entry: "./application.ts" })],
      })
      await server.listen()
      const address = server.httpServer?.address()

      if (!address || typeof address === "string") throw new Error("Missing Vite port")
      let connections = 0
      const payloads: unknown[] = []
      const transport = createBareViteTransport({
        url: `ws://127.0.0.1:${address.port}/__bare_vite?environment=bare`,
        createSocket: (url) => {
          connections += 1
          return new NodeSocketAdapter(url)
        },
        onPayload: (payload) => {
          payloads.push(payload)
        },
      })

      const runner = new ModuleRunner(
        {
          transport,
          createImportMeta: createNodeImportMeta,
        },
        new ESModulesEvaluator(),
      )

      let application = await runner.import<{ current: number }>("/application.ts")

      expect(application.current).toBe(1)

      // Let the initial watcher scan settle. A slow platform can report the
      // fixture's creation as a reload, in which case refresh the namespace
      // before creating the one change this assertion intends to observe.
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (
        payloads.some(
          (payload) =>
            !!payload &&
            typeof payload === "object" &&
            "type" in payload &&
            payload.type === "full-reload",
        )
      ) {
        application = await runner.import<{ current: number }>("/application.ts")
      }

      payloads.length = 0
      await writeFile(valueFile, "export const value = 2\n")
      await expect.poll(() => application.current, { timeout: 3_000 }).toBe(2)
      expect(connections).toBe(1)
      await runner.close()
    } finally {
      await server?.close()
      server = undefined
      await rm(root, {
        recursive: true,
        force: true,
      })
    }
  })
})
