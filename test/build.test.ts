import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { buildBareApp } from "../src/build/index.js"

describe("production pipeline", () => {
  it("loads the user config, runs Vite, and emits a Bare bundle", async () => {
    const root = resolve(import.meta.dirname, "fixtures/build")
    const result = await buildBareApp({
      root,
      outDir: "dist/test",
    })

    expect(result.artifact).toBe(resolve(root, "dist/test/bundle.bare"))
    expect(existsSync(result.artifact)).toBe(true)
    expect(statSync(result.artifact).size).toBeGreaterThan(0)
    expect(existsSync(`${result.intermediateEntry}.map`)).toBe(true)
  })

  it("accepts Bare config directly without loading a Vite config", async () => {
    const root = resolve(import.meta.dirname, "fixtures/build")
    const result = await buildBareApp({
      root,
      configFile: false,
      config: {
        entry: "./src/value.ts",
        build: { outDir: "dist/direct" },
      },
    })

    expect(result.artifact).toBe(resolve(root, "dist/direct/bundle.bare"))
    expect(existsSync(result.artifact)).toBe(true)
  })
})
