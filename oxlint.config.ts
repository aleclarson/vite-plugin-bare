import { defineConfig } from "oxlint"

import { createOxlintConfig } from "@coreframe/oxc-config/oxlint"

export default defineConfig({
  ...createOxlintConfig({ react: false }),
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ["dist/**"],
})
