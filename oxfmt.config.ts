import { defineConfig } from "oxfmt"

import oxfmt from "@coreframe/oxc-config/oxfmt"

export default defineConfig({
  ...oxfmt,
  ignorePatterns: ["dist/**"],
})
