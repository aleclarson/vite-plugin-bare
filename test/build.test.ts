import { existsSync, statSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

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

describe("production environment", () => {
  it.each([undefined, "custom"])("defines NODE_ENV with override %s", async (override) => {
    const root = await mkdtemp(join(tmpdir(), "vite-plugin-bare-env-"))

    try {
      await writeFile(join(root, "entry.js"), "export const mode = process.env.NODE_ENV")
      await writeFile(
        join(root, "vite.config.mjs"),
        `export default ${JSON.stringify({
          define: override ? { "process.env.NODE_ENV": JSON.stringify(override) } : {},
        })}`,
      )
      const result = await buildBareApp({
        root,
        config: { entry: "./entry.js" },
      })

      const code = await readFile(result.intermediateEntry, "utf8")

      expect(code).not.toContain("process.env.NODE_ENV")
      expect(code).toContain(JSON.stringify(override ?? "production"))
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      })
    }
  })
})
