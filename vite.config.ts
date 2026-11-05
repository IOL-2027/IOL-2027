import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// One site, two apps: the public website (index.html) and the registration portal under /portal
// (portal/index.html, the app in src/portal). Firebase Hosting sends /portal and everything under it to the
// portal's page (firebase.json); this plugin does the same for `npm run dev` and `npm run preview`.
//
// Until registration opens, the public site is built with VITE_REGISTRATION_OPEN=false (src/launch.ts) and has no
// portal at all: the portal is left out of the build, and its page is the website's own, so /portal shows the
// website's "Page not found".
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url))
const registrationOpen = process.env.VITE_REGISTRATION_OPEN !== 'false'

const toPortalPage: Connect.NextHandleFunction = (req, _res, next) => {
  const path = (req.url ?? '').split('?')[0]
  if (/^\/portal(\/|$)/.test(path) && !/\.\w+$/.test(path)) req.url = '/portal/index.html'
  next()
}

const portalPages = (): Plugin => ({
  name: 'portal-pages',
  configureServer: (server) => { if (registrationOpen) server.middlewares.use(toPortalPage) },
  configurePreviewServer: (server) => { if (registrationOpen) server.middlewares.use(toPortalPage) },
  // Closed: firebase.json still sends /portal to portal/index.html, so that page is a copy of the website's.
  closeBundle() {
    if (registrationOpen) return
    const dist = page('./dist')
    mkdirSync(`${dist}/portal`, { recursive: true })
    copyFileSync(`${dist}/index.html`, `${dist}/portal/index.html`)
  },
})

export default defineConfig({
  plugins: [react(), portalPages()],
  build: { rollupOptions: { input: registrationOpen ? { site: page('./index.html'), portal: page('./portal/index.html') } : { site: page('./index.html') } } },
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
