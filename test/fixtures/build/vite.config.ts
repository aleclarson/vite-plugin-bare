import { defineConfig } from "vite"

import bare from "../../../src/index.js"

export default defineConfig({
  resolve: { alias: { "#value": "/src/value.ts" } },
  plugins: [bare({ entry: "./src/application.ts" })],
})
