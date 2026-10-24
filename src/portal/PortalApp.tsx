// The registration portal (iol2027-portal.web.app). Team Leaders sign in at /, organisers at /staff, and
// check-in staff scan badges at /check-in. Until registration opens it only says when it opens.
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { publicSiteUrl, registrationOpen } from '../launch'
import TeamLeaderPortal from '../registration/TeamLeaderPortal'
import CheckIn from './CheckIn'
import mark from './iol2027-mark.png'

function Closed() {
  return (
    <div className="reg-page">
      <header className="reg-intro"><div className="wrap">
        <h1>Registration opens on 18 January 2027.</h1>
        <p>The official contact for each accredited country or territory receives an invitation code by email. The Team Leader uses it here to create the country’s account.</p>
      </div></header>
      <div className="reg-shell wrap"><div className="reg-account"><div className="reg-account-card">
        <h2>Until then</h2>
        <p className="reg-lede">Read how registration works, what it costs and the deadlines on the IOL 2027 website.</p>
        <div className="reg-account-actions"><a className="reg-btn reg-btn-primary" href={`${publicSiteUrl}/registration`}>How registration works <ArrowRight size={18} aria-hidden="true" /></a></div>
      </div></div></div>
    </div>
  )
}

export default function PortalApp() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const page = !registrationOpen ? <Closed />
    : path === '/staff' ? <TeamLeaderPortal door="staff" />
    : path === '/check-in' ? <CheckIn />
    : <TeamLeaderPortal door="team" />
  return (
    <div className="portal">
      <header className="portal-bar"><div className="wrap portal-bar-inner">
        <a className="portal-brand" href="/"><img src={mark} alt="" width={34} height={40} /><span><strong>IOL 2027</strong><small>Registration portal</small></span></a>
        <a className="portal-site-link" href={publicSiteUrl}>IOL 2027 website <ArrowUpRight size={15} aria-hidden="true" /></a>
      </div></header>
      <main>{page}</main>
      <footer className="portal-footer"><div className="wrap">
        <p>The 24th International Linguistics Olympiad · Bangkok, 21–28 July 2027</p>
        <p>Questions: <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a> · <a href={`${publicSiteUrl}/privacy`}>Privacy</a>
          {registrationOpen && (path === '/staff' ? <> · <a href="/">Team Leader sign-in</a></> : <> · <a href="/staff">Organiser sign-in</a></>)}</p>
      </div></footer>
    </div>
  )
}
