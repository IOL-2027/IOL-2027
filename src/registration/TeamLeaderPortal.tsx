// The registration portal's sign-in (portal / for Team Leaders, /staff for organisers), then the Team Leader
// workspace or the staff back office. Either door signs in any account; the role decides what opens.
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Info, LogOut } from 'lucide-react'
import { publicSiteUrl } from '../launch'
import { api, ApiError, roleLabel, type User } from './api'
import { Entry, VerifyEmail } from './AuthForms'
import StaffHome from './StaffHome'
import Workspace from './Workspace'
import { Alert, messageOf } from './ui'
import './registration.css'

type PageState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; user: User | null }

// Until launch the portal runs on test data that may be reset; its build (VITE_TEST_ENVIRONMENT) and local development say so.
const testEnvironment = import.meta.env.VITE_TEST_ENVIRONMENT === 'true' || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

export default function TeamLeaderPortal({ door = 'team' }: { door?: 'team' | 'staff' }) {
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
  }, [])
  const sessionEnded = useCallback(() => {
    setNotice('Your session ended. Please sign in again.')
    setState({ status: 'ready', user: null })
  }, [])

  const user = state.status === 'ready' ? state.user : null
  const isTeamLeader = user?.role === 'team_leader'
  const organiserDoor = door === 'staff' && !user
  const title = organiserDoor ? 'Organiser sign-in.' : !user || isTeamLeader ? 'Set up your team.' : user.role === 'participant' ? 'Your registration.' : 'Registration back office.'
  const intro = organiserDoor
    ? 'For the IOL 2027 organising team. A super admin creates your account; set your password with the code from that email under “Forgot your password?”.'
    : !user || isTeamLeader
      ? 'Verify your invitation, create the Team Leader account, then register your teams in stages. Personal details can come later.'
      : user.role === 'participant' ? 'What your Team Leader has registered for you.' : `Signed in as ${roleLabel[user.role]}. You see only what this role needs.`

  return (
    <div className="reg-page">
      <header className="reg-intro">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="reg-breadcrumb"><a href={`${publicSiteUrl}/registration`}>Registration</a><span aria-hidden="true">/</span><span aria-current="page">{organiserDoor ? 'Organisers' : isTeamLeader || !user ? 'Team Leader' : 'Back office'}</span></nav>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
      </header>
      <div className="reg-shell wrap">
        {state.status === 'ready' && (
          <div className="reg-session">
            {testEnvironment && <p className="reg-proto"><Info size={16} aria-hidden="true" />Test environment: data here is for testing and may be reset.</p>}
            {user && <p className="reg-who"><span>Signed in as <strong>{user.fullName}</strong> · {roleLabel[user.role]}</span>
              <button type="button" className="reg-btn-link" onClick={signOut}><LogOut size={16} aria-hidden="true" />Sign out</button></p>}
          </div>
        )}

        {state.status === 'loading' && <p className="reg-loading" role="status">Loading…</p>}

        {state.status === 'unavailable' && (
          <div className="reg-account"><div className="reg-account-card">
            <h2>Registration opens on 18 January 2027</h2>
            <p className="reg-lede">Team Leader accounts are created with the invitation code each country receives by email. Until then, you can read how registration works.</p>
            <div className="reg-account-actions"><a className="reg-btn reg-btn-primary" href={`${publicSiteUrl}/registration`}>How registration works <ArrowRight size={18} aria-hidden="true" /></a></div>
            {state.message && <p className="reg-hint">{state.message}</p>}
          </div></div>
        )}

        {state.status === 'ready' && !user && (
          <Entry notice={notice} allowSignup={door === 'team'} initialCode={inviteCode} onSignedIn={(u) => { setNotice(undefined); setState({ status: 'ready', user: u }) }}
            onCreated={(u, code) => { setDevCode(code); setFromSignup(true); setState({ status: 'ready', user: u }) }} />
        )}

        {user && !user.emailVerified && (
          <div className="reg-account">
            <VerifyEmail user={user} developmentCode={devCode} showStepper={fromSignup} onSignOut={signOut}
              onVerified={(u) => { setDevCode(undefined); setState({ status: 'ready', user: u }) }} />
          </div>
        )}

        {user?.emailVerified && isTeamLeader && (user.delegationId
          ? <Workspace delegationId={user.delegationId} onSessionEnd={sessionEnded} />
          : <div className="reg-panel"><Alert>This Team Leader account is not linked to a delegation. Please contact the organisers.</Alert></div>)}

        {user?.emailVerified && !isTeamLeader && <StaffHome user={user} onSessionEnd={sessionEnded} />}
      </div>
    </div>
  )
}
