import { value } from "./value.ts"

const generation = 1

interface DeviceContext {
  report(event: unknown): void
}

export function start(context: DeviceContext) {
  context.report({
    type: "start",
    generation,
    value,
    platform: Bare.platform,
    arch: Bare.arch,
    globals: {
      AbortController: typeof AbortController === "function",
      TextEncoder: typeof TextEncoder === "function",
      TextDecoder: typeof TextDecoder === "function",
      URL: typeof URL === "function",
      fetch: typeof fetch === "function",
      WebSocket: typeof WebSocket === "function",
    },
  })
}

export function dispose() {
  globalThis.__bareViteDeviceReport?.({
    type: "dispose",
    generation,
  })
}

if (import.meta.hot) {
  import.meta.hot.accept("./value.ts", (next) => {
    globalThis.__bareViteDeviceReport?.({
      type: "hmr",
      value: next.value,
    })
  })
}

declare global {
  var Bare: {
    platform: string
    arch: string
  }

  var __bareViteDeviceReport: ((event: unknown) => void) | undefined
}
