// Registration switch. When false the site shows public pages only: the Team Leader portal, staff back office and
// badge scanner are hidden, and their addresses show the "opens 18 January 2027" page instead.
// The build sets it, not a branch: the workflow that deploys main (the public site) and pull-request previews into main
// build with VITE_REGISTRATION_OPEN=false until registration opens. Every other build, including the dev site, is open.
export const registrationOpen: boolean = import.meta.env.VITE_REGISTRATION_OPEN !== 'false'

// Placeholder pages (Gallery, People, Sponsors, and the sponsor block on the home page) work the same way: the public
// site builds with VITE_SHOW_PLACEHOLDER_PAGES=false until launch, so they are hidden there and shown everywhere else.
export const placeholderPagesShown: boolean = import.meta.env.VITE_SHOW_PLACEHOLDER_PAGES !== 'false'

// The registration portal is its own site (iol2027-portal.web.app); the website links to it and the portal links back.
// Each deploy sets both addresses; the website default is the development website.
export const portalUrl: string = (import.meta.env.VITE_PORTAL_URL || 'https://iol2027-portal.web.app').replace(/\/$/, '')
export const publicSiteUrl: string = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://iol2027-dev.web.app').replace(/\/$/, '')
