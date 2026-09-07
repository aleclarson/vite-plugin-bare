import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "build/index": "src/build/index.ts",
    cli: "src/cli.ts",
  },
  format: "esm",
  platform: "node",
  fixedExtension: false,
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: {
    sourcemap: true,
  },
  deps: {
    skipNodeModulesBundle: true,
  },
})
