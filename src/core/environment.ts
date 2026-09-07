import type { EnvironmentOptions } from "vite"

import type { NormalizedBareViteConfig } from "./config.js"

export function createBareEnvironmentOptions(config: NormalizedBareViteConfig): EnvironmentOptions {
  return {
    consumer: "server",
    resolve: {
      conditions: config.resolve.conditions,
    },
    dev: {
      moduleRunnerTransform: true,
      sourcemap: { js: true },
    },
  }
}
