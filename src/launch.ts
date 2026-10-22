// Registration switch. When false the site shows public pages only: the Team Leader portal, staff back office and
// badge scanner are hidden, and their addresses show the "opens 18 January 2027" page instead.
// The build sets it, not a branch: the workflow that deploys main (the public site) and pull-request previews into main
// build with VITE_REGISTRATION_OPEN=false until registration opens. Every other build, including the dev site, is open.
export const registrationOpen: boolean = import.meta.env.VITE_REGISTRATION_OPEN !== 'false'
