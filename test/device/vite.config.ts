import { defineConfig } from 'vite'
import bare from '../../src/index.js'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [bare({ entry: './app/application.ts' })],
})
