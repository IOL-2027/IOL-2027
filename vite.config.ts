import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// One site, two apps: the public website (index.html) and the registration portal under /portal
// (portal/index.html, the app in src/portal). Firebase Hosting sends /portal and everything under it to the
// portal's page (firebase.json); this plugin does the same for `npm run dev` and `npm run preview`.
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url))

const toPortalPage: Connect.NextHandleFunction = (req, _res, next) => {
  const path = (req.url ?? '').split('?')[0]
  if (/^\/portal(\/|$)/.test(path) && !/\.\w+$/.test(path)) req.url = '/portal/index.html'
  next()
}

const portalPages = (): Plugin => ({
  name: 'portal-pages',
  configureServer: (server) => { server.middlewares.use(toPortalPage) },
  configurePreviewServer: (server) => { server.middlewares.use(toPortalPage) },
})

export default defineConfig({
  plugins: [react(), portalPages()],
  build: { rollupOptions: { input: { site: page('./index.html'), portal: page('./portal/index.html') } } },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
