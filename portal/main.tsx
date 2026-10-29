// Entry point of the registration portal, served at /portal (vite.config.ts builds it with the website). The app
// itself is in src/portal.
import React from 'react'
import ReactDOM from 'react-dom/client'
import PortalApp from '../src/portal/PortalApp'
import '../src/brand.css'
import '../src/portal/portal.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PortalApp /></React.StrictMode>,
)
