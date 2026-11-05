// The registration portal, under /portal on the website. Team Leaders sign in at /portal, organisers at
// /portal/staff, and check-in staff scan badges at /portal/check-in. Every page needs an account. Until registration
// opens the public site is built without it (vite.config.ts).
import { ArrowLeft } from 'lucide-react'
import { portalPath, portalUrl } from '../launch'
import TeamLeaderPortal from '../registration/TeamLeaderPortal'
import CheckIn from './CheckIn'
import mark from './iol2027-mark-light.png'

export default function PortalApp() {
  // The page within the portal: /portal/staff is /staff.
  const path = window.location.pathname.replace(/\/$/, '').slice(portalUrl.length) || '/'
  const page = path === '/staff' ? <TeamLeaderPortal door="staff" />
    : path === '/check-in' ? <CheckIn />
    : <TeamLeaderPortal door="team" />
  return (
    <div className="portal">
      <header className="portal-bar"><div className="wrap portal-bar-inner">
        <a className="portal-brand" href={portalPath()}><img src={mark} alt="" width={34} height={40} /><span><strong>IOL 2027</strong><small>Registration portal</small></span></a>
        <a className="portal-site-link" href="/"><ArrowLeft size={15} aria-hidden="true" /> <span className="portal-site-long">IOL 2027 website</span><span className="portal-site-short">Website</span></a>
      </div></header>
      <main>{page}</main>
      <footer className="portal-footer"><div className="wrap">
        <p>The 24th International Linguistics Olympiad · Bangkok, 21–28 July 2027</p>
        <p>Questions: <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a> · <a href="/privacy">Privacy</a>
          {path === '/staff' ? <> · <a href={portalPath()}>Team Leader sign-in</a></> : <> · <a href={portalPath('/staff')}>Organiser sign-in</a></>}</p>
      </div></footer>
    </div>
  )
}
