import type { BareRuntimeGlobal } from '../core/runtime.js'

const installers: Record<BareRuntimeGlobal, () => Promise<unknown>> = {
  'abort-controller': () => import('bare-abort-controller/global'),
  encoding: () => import('bare-encoding/global'),
  fetch: () => import('bare-fetch/global'),
  url: () => import('bare-url/global'),
  websocket: () => import('bare-ws/global'),
}

export async function installBareGlobals(globals: readonly BareRuntimeGlobal[]): Promise<void> {
  for (const name of globals) await installers[name]()
}
