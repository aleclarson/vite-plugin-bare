import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vite integration fixtures create real servers and share process-level
    // ModuleRunner source-map hooks, so run files in one worker.
    fileParallelism: false,
  },
})
