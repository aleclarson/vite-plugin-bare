import type { HotPayload } from "vite"
import type { ModuleRunner } from "vite/module-runner"

import { DEFAULT_RUNTIME_GLOBALS, type BareRuntimeGlobal } from "../core/runtime.js"
import { BareApplication } from "./application.js"
import {
  installBareErrorHandlers,
  type BareErrorEmitter,
  type SerializedRuntimeError,
} from "./errors.js"
import { installBareGlobals } from "./globals.js"
import { createBareViteTransport, type BareViteTransportOptions } from "./transport.js"

/** Inputs supplied by the host when its long-lived Bare worklet starts. */
export interface StartBareViteRuntimeOptions<Context = unknown> {
  /**
   * Full WebSocket URL printed by the Vite plugin and passed into the worklet by the host
   * application.
   */
  serverUrl: string
  /** Vite module URL for the application entry, such as `/src/application.ts`. */
  entry: string
  /** Value passed to the application's optional `start(context)` export. */
  context: Context
  /**
   * Bare process event emitter used to catch fatal runtime errors.
   *
   * @defaultValue `globalThis.Bare` when it exists.
   */
  bare?: BareErrorEmitter
  /**
   * Bare-backed Web APIs to install before importing the application.
   *
   * @defaultValue abort controller, encoding, URL, fetch, and WebSocket.
   */
  globals?: BareRuntimeGlobal[]
  /**
   * Receives startup, transport, application-restart, uncaught-exception, and unhandled-rejection
   * errors. The host can forward these over Flutter RPC.
   */
  reportError?: (error: SerializedRuntimeError | Error) => void
  /**
   * Receives lifecycle status identifiers such as `application-started` and
   * `application-restarted`.
   */
  reportStatus?: (status: string) => void
  /**
   * Low-level socket and reconnection overrides. The runtime owns the server URL and payload/error
   * hooks, so callers cannot replace those fields here.
   */
  transport?: Omit<BareViteTransportOptions, "url" | "onPayload" | "onError">
}

/**
 * Install Bare-backed globals, connect a Vite `ModuleRunner`, and start the app.
 *
 * @returns Handles for advanced inspection plus a `close` method that disposes the application
 *   without requiring the host to terminate the worklet.
 */
export async function startBareViteRuntime<Context = unknown>(
  options: StartBareViteRuntimeOptions<Context>,
): Promise<{
  runner: ModuleRunner
  application: BareApplication<Context>
  close(): Promise<void>
}> {
  const bare = options.bare ?? (globalThis as { Bare?: BareErrorEmitter }).Bare

  if (bare) installBareErrorHandlers(bare, (error) => options.reportError?.(error))

  await installBareGlobals(options.globals ?? DEFAULT_RUNTIME_GLOBALS)
  const { ESModulesEvaluator, ModuleRunner } = await import("vite/module-runner")

  let application: BareApplication<Context>
  let restartScheduled = false
  const onPayload = (payload: HotPayload) => {
    if (payload.type !== "full-reload" || restartScheduled || !application) return
    restartScheduled = true
    setTimeout(() => {
      void application
        .restart()
        .then(() => options.reportStatus?.("application-restarted"))
        .catch((error) => options.reportError?.(asError(error)))
        .finally(() => {
          restartScheduled = false
        })
    }, 0)
  }

  const transport = createBareViteTransport({
    ...options.transport,
    url: options.serverUrl,
    onPayload,
    onError: (error) => options.reportError?.(error),
  })

  const runner = new ModuleRunner(
    {
      transport,
      sourcemapInterceptor: "prepareStackTrace",
      hmr: true,
    },
    new ESModulesEvaluator(),
  )

  application = new BareApplication(runner, options.entry, options.context)
  await application.start()
  options.reportStatus?.("application-started")

  return {
    runner,
    application,
    async close() {
      await application.dispose()
      await runner.close()
    },
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
