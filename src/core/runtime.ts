/** A Web API installed into the stable Bare runtime shell. */
export type BareRuntimeGlobal = "fetch" | "websocket" | "url" | "encoding" | "abort-controller"

export const DEFAULT_RUNTIME_GLOBALS: BareRuntimeGlobal[] = [
  "abort-controller",
  "encoding",
  "url",
  "fetch",
  "websocket",
]
