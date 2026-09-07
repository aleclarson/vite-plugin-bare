import oxfmt from "@coreframe/oxc-config/oxfmt"
import { defineConfig } from "oxfmt"

export default defineConfig({
  ...oxfmt,
  ignorePatterns: ["dist/**"],
})
