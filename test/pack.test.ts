import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { packBareOutput } from "../src/build/pack.js"

describe("Bare packing", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vite-plugin-bare-pack-"))
  })

  afterEach(async () => {
    await rm(root, {
      recursive: true,
      force: true,
    })
  })

  async function put(path: string, source: string) {
    const filename = join(root, path)

    await mkdir(dirname(filename), { recursive: true })
    await writeFile(filename, source)
  }

  async function packed(entry = "main.cjs", hosts?: string[], linked?: boolean) {
    const bundle = await packBareOutput({
      entry: join(root, entry),
      ...(hosts ? { hosts } : {}),
      ...(linked === undefined ? {} : { linked }),
    })

    return Buffer.from(bundle).toString()
  }

  it("finds a symlinked package's private pnpm dependencies", async () => {
    await put("main.cjs", "module.exports = require('owner')")
    const store = "node_modules/.pnpm/owner@1/node_modules"

    await put(`${store}/owner/package.json`, '{"name":"owner","main":"index.js"}')
    await put(`${store}/owner/index.js`, "module.exports = require('child')")
    await put(`${store}/child/package.json`, '{"name":"child","main":"index.js"}')
    await put(`${store}/child/index.js`, 'module.exports = "private-child"')
    await symlink(".pnpm/owner@1/node_modules/owner", join(root, "node_modules/owner"))

    expect(await packed()).toContain('module.exports = "private-child"')
  })

  it("skips directory candidates and resolves their index", async () => {
    await put("main.cjs", "module.exports = require('./dep')")
    await put("dep/index.js", 'module.exports = "directory-index"')

    expect(await packed()).toContain('module.exports = "directory-index"')
  })

  it.each(["import", "require"])("selects Bare and %s export conditions", async (kind) => {
    await put(
      "main.cjs",
      kind === "require" ? "module.exports = require('dep')" : 'import value from "dep"',
    )
    await put(
      "node_modules/dep/package.json",
      JSON.stringify({
        name: "dep",
        exports: {
          bare: {
            import: "./import.mjs",
            require: "./require.cjs",
          },
          default: "./wrong.js",
        },
      }),
    )
    await put("node_modules/dep/import.mjs", 'export default "bare-import"')
    await put("node_modules/dep/require.cjs", 'module.exports = "bare-require"')
    await put("node_modules/dep/wrong.js", 'module.exports = "wrong-condition"')

    const bundle = await packed()

    expect(bundle).toContain(`bare-${kind}`)
    expect(bundle).not.toContain("wrong-condition")
    expect(bundle).not.toContain(`bare-${kind === "import" ? "require" : "import"}`)
  })

  it.each(["ios-arm64", "android-arm64"])("keeps %s addons linked", async (host) => {
    await put("main.cjs", "module.exports = require.addon('.')")
    await put("package.json", '{"name":"native-fixture"}')

    expect(await packed("main.cjs", [host], true)).toContain("linked:")
  })
})
