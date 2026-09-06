/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const APP_VERSION = pkg.version as string

function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-sw-build-hash',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      const swPath = resolve(outDir, 'sw.js')
      try {
        const content = readFileSync(swPath, 'utf-8')
        const hash = `gimme-${Date.now().toString(36)}`
        writeFileSync(swPath, content.replace('__BUILD_HASH__', hash))
      } catch {}
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  // Root path now that we serve from Vercel at gimme.gg, instead of GitHub Pages
  // at usclogan-sudo.github.io/golf-tracker/ (retired June 2026). All static asset
  // references update automatically because they all go through this base.
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_PLATFORM__: JSON.stringify('web'),
  },
  test: {
    globals: true,
  },
})
