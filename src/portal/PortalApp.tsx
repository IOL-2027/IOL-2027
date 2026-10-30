// The registration portal, under /portal on the website. Team Leaders sign in at /portal, organisers at
// /portal/staff, and check-in staff scan badges at /portal/check-in. Every page needs an account. Until registration
// opens it only says when it opens.
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { portalPath, portalUrl, registrationOpen } from '../launch'
import TeamLeaderPortal from '../registration/TeamLeaderPortal'
import { PageHead } from '../registration/ui'
import CheckIn from './CheckIn'
import mark from './iol2027-mark-light.png'

function Closed() {
  return (
    <div className="reg-page">
      <PageHead eyebrow="Team Leader portal" title="Registration opens on 18 January 2027."
        intro="The official contact for each accredited country or territory receives an invitation code by email. The Team Leader uses it here to create the country’s account." />
      <div className="reg-shell wrap"><div className="reg-account"><div className="reg-account-card">
        <h2>Until then</h2>
        <p className="reg-lede">Read how registration works, what it costs and the deadlines on the IOL 2027 website.</p>
        <div className="reg-account-actions"><a className="reg-btn reg-btn-primary" href="/registration">How registration works <ArrowRight size={18} aria-hidden="true" /></a></div>
      </div></div></div>
    </div>
  )
}

export default function PortalApp() {
  // The page within the portal: /portal/staff is /staff.
  const path = window.location.pathname.replace(/\/$/, '').slice(portalUrl.length) || '/'
  const page = !registrationOpen ? <Closed />
    : path === '/staff' ? <TeamLeaderPortal door="staff" />
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
          {registrationOpen && (path === '/staff' ? <> · <a href={portalPath()}>Team Leader sign-in</a></> : <> · <a href={portalPath('/staff')}>Organiser sign-in</a></>)}</p>
      </div></footer>
    </div>
  )
}
