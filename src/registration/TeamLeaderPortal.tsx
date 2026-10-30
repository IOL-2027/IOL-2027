// The registration portal's sign-in (portal / for Team Leaders, /staff for organisers), then the Team Leader
// workspace or the staff back office. Either door signs in any account; the role decides what opens.
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, CalendarDays, ClipboardList, Clock, LifeBuoy, MailQuestion, QrCode, Route, ShieldCheck } from 'lucide-react'
import { portalPath } from '../launch'
import { api, ApiError, type User } from './api'
import { Entry, VerifyEmail } from './AuthForms'
import StaffHome from './StaffHome'
import Workspace from './Workspace'
import { Alert, PageHead, SessionBar, messageOf } from './ui'
import './registration.css'

type Door = 'team' | 'staff'
type PageState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; user: User | null }

const heroCopy: Record<Door, { eyebrow: string; title: ReactNode; lede: string }> = {
  team: {
    eyebrow: 'Team Leader portal',
    title: <>Register your country for <em>IOL&nbsp;2027.</em></>,
    lede: 'One Team Leader registers the whole delegation: teams, payment, people and travel. Everything you save is kept, so it can be done over several sittings.',
  },
  staff: {
    eyebrow: 'Organisers',
    title: <>The back office for the <em>organising team.</em></>,
    lede: 'Invitation codes, payments, people, welfare and check-in for IOL 2027. Each role sees only what it needs.',
  },
}

type GuideItem = {
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>
  title: string; list?: string[]; body: ReactNode; links?: { href: string; label: string; external?: boolean }[]
}

// Kept to three short items each, so the sign-in card stays the first thing people see.
const guides: Record<Door, GuideItem[]> = {
  team: [
    {
      icon: Route, title: 'New to the portal?',
      body: 'See every step, from the invitation code to the QR badges. You can stop at any point and pick up where you left off.',
      links: [{ href: '/registration/how-to-register', label: 'How to register', external: true }],
    },
    {
      icon: ClipboardList, title: 'Have these ready',
      list: ['The invitation code from the organisers’ email', 'An email address your team can rely on', 'How many teams (up to two) and observers'],
      body: 'Payment, passport details and flights come later.',
      links: [{ href: '/registration/fees-deadlines', label: 'Fees and deadlines', external: true }],
    },
    {
      icon: MailQuestion, title: 'No invitation code?',
      body: <>Codes go by email from iol2027.th@gmail.com to the official contact of each accredited country or territory. Check the spam folder, or ask that contact. Still nothing? <a href="mailto:iol2027.th@gmail.com">Write to us</a>. Not accredited yet? Write to the IOL Board at <a href="mailto:contact@ioling.org">contact@ioling.org</a>.</>,
    },
  ],
  staff: [
    { icon: ShieldCheck, title: 'Each role has its own tools', body: 'Registration, Finance, Welfare, Check-in and Viewer accounts each open what they need, and nothing else. Ask a super admin if you need more.' },
    { icon: QrCode, title: 'Scanning badges?', body: 'Check-in staff scan badges at the arrival desk and at event checkpoints.', links: [{ href: portalPath('/check-in'), label: 'Open the badge scanner' }] },
    { icon: LifeBuoy, title: 'Something not working?', body: <>Write to the registration team at <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a>, with a screenshot if you can.</> },
  ],
}

function Hero({ door, session }: { door: Door; session: ReactNode }) {
  const copy = heroCopy[door]
  return (
    <header className="reg-hero">
      <div className="wrap">
        <div className="reg-head-top"><p className="reg-head-eyebrow">{copy.eyebrow}</p>{session}</div>
        <div className="reg-hero-main">
          <h1>{copy.title}</h1>
          <div className="reg-hero-side">
            <p>{copy.lede}</p>
            {door === 'team' && (
              <ul className="reg-hero-meta">
                <li><CalendarDays size={16} aria-hidden="true" />Registration 18 January – 30 April 2027</li>
                <li><Clock size={16} aria-hidden="true" />Early bird fee until 12 March</li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function Guide({ door }: { door: Door }) {
  return (
    <aside className="reg-guide" aria-labelledby="reg-guide-title">
      <h2 id="reg-guide-title">{door === 'staff' ? 'Good to know' : 'Before you start'}</h2>
      <ul>
        {guides[door].map((item) => {
          const Icon = item.icon
          return (
            <li key={item.title}>
              <span className="reg-guide-icon"><Icon size={20} aria-hidden="true" /></span>
              <div>
                <h3>{item.title}</h3>
                {item.list && <ul className="reg-guide-list">{item.list.map((line) => <li key={line}>{line}</li>)}</ul>}
                <p>{item.body}</p>
                {item.links?.map((link) => (
                  <a key={link.href} className="reg-guide-link" href={link.href} {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                    {link.label}{link.external ? <><ArrowUpRight size={15} aria-hidden="true" /><span className="reg-visually-hidden"> (opens the IOL 2027 website)</span></> : <ArrowRight size={15} aria-hidden="true" />}
                  </a>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export default function TeamLeaderPortal({ door = 'team' }: { door?: Door }) {
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [inviteCode] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? undefined)
  const [devCode, setDevCode] = useState<string>()
  const [fromSignup, setFromSignup] = useState(false)
  const [notice, setNotice] = useState<string>()

  const loadMe = useCallback(async () => {
    try {
      const result = await api<{ user: User | null }>('/api/auth/me')
      setState({ status: 'ready', user: result.user })
    } catch (e) {
      // 503 means this site has no registration server behind it (the public site before go-live).
      setState({ status: 'unavailable', message: e instanceof ApiError && e.status === 503 ? '' : messageOf(e) })
    }
  }, [])
  useEffect(() => { loadMe() }, [loadMe])

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* the session is cleared locally either way */ }
    setDevCode(undefined); setFromSignup(false); setNotice(undefined)
    setState({ status: 'ready', user: null })
    window.scrollTo({ top: 0 })
  }, [])
  const sessionEnded = useCallback(() => {
    setNotice('Your session ended. Please sign in again.')
    setState({ status: 'ready', user: null })
  }, [])

  const user = state.status === 'ready' ? state.user : null
  const session = <SessionBar user={user} onSignOut={signOut} />

  if (state.status === 'loading') {
    return (
      <div className="reg-page">
        <header className="reg-head reg-head-loading"><div className="wrap"><div className="reg-head-top"><p className="reg-head-eyebrow">{heroCopy[door].eyebrow}</p></div></div></header>
        <p className="reg-loading" role="status">Loading…</p>
      </div>
    )
  }

  if (user?.emailVerified && user.role === 'team_leader') {
    return (
      <div className="reg-page">
        {user.delegationId
          ? <Workspace delegationId={user.delegationId} onSessionEnd={sessionEnded} session={session} />
          : <>
            <PageHead eyebrow="Team Leader portal" title="Your registration" session={session} />
            <div className="reg-shell wrap"><div className="reg-panel"><Alert>This Team Leader account is not linked to a delegation. Please contact the organisers.</Alert></div></div>
          </>}
      </div>
    )
  }

  if (user?.emailVerified) return <div className="reg-page"><StaffHome user={user} onSessionEnd={sessionEnded} session={session} /></div>

  // Signed out, or partway through creating the account: the welcome band, the card, and a short guide.
  return (
    <div className="reg-page">
      <Hero door={door} session={session} />
      <div className="reg-landing wrap">
        <div className="reg-landing-main">
          {state.status === 'unavailable' && (
            <div className="reg-account reg-entry"><div className="reg-account-card">
              <h2>Registration opens on 18 January 2027</h2>
              <p className="reg-lede">Team Leader accounts are created with the invitation code each country receives by email. Until then, you can read how registration works.</p>
              <div className="reg-account-actions"><a className="reg-btn reg-btn-primary" href="/registration">How registration works <ArrowRight size={18} aria-hidden="true" /></a></div>
              {state.message && <p className="reg-hint">{state.message}</p>}
            </div></div>
          )}
          {state.status === 'ready' && !user && (
            <Entry notice={notice} allowSignup={door === 'team'} initialCode={inviteCode} onSignedIn={(u) => { setNotice(undefined); setState({ status: 'ready', user: u }) }}
              onCreated={(u, code) => { setDevCode(code); setFromSignup(true); setState({ status: 'ready', user: u }) }} />
          )}
          {user && !user.emailVerified && (
            <div className="reg-account reg-entry">
              <VerifyEmail user={user} developmentCode={devCode} fresh={fromSignup} onSignOut={signOut}
                onVerified={(u) => { setDevCode(undefined); setState({ status: 'ready', user: u }); window.scrollTo({ top: 0 }) }} />
            </div>
          )}
        </div>
        <Guide door={door} />
      </div>
    </div>
  )
}
