import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The registration portal (iol2027-portal.web.app) is its own small app: portal/index.html built into
// dist-portal. It reuses src/registration, so the public site (vite.config.ts) no longer carries it.
const repo = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: 'portal',
  envDir: repo,
  publicDir: false,
  plugins: [react()],
  build: { outDir: `${repo}dist-portal`, emptyOutDir: true },
  server: {
    port: 5181,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  preview: { port: 5181 },
})
