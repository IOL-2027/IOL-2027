// Registration switch. When false the site shows public pages only: the Team Leader portal, staff back office and
// badge scanner are hidden, and their addresses show the "opens 18 January 2027" page instead.
// The build sets it, not a branch: the workflow that deploys main (the public site) and pull-request previews into main
// build with VITE_REGISTRATION_OPEN=false until registration opens. Every other build, including the dev site, is open.
export const registrationOpen: boolean = import.meta.env.VITE_REGISTRATION_OPEN !== 'false'

// Placeholder pages (People, Sponsors, and the sponsor block on the home page) work the same way: the public site
// builds with VITE_SHOW_PLACEHOLDER_PAGES=false until launch, so they are hidden there and shown everywhere else.
export const placeholderPagesShown: boolean = import.meta.env.VITE_SHOW_PLACEHOLDER_PAGES !== 'false'

// The registration portal is part of this site, under /portal (its own site until 30 Oct 2026). Every page in it
// needs an account; before registration opens it only says when it opens.
export const portalUrl = '/portal'
/** A page of the portal: portalPath('/staff') is /portal/staff. */
export const portalPath = (path = '/') => `${portalUrl}${path === '/' ? '' : path}`
