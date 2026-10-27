// The staff back office: a section list on the left, one section at a time on the right, opening on a home page
// with what is waiting and quick actions. Each role sees only its sections; the API enforces the same rules (docs/ROLES.md).
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { BarChart3, Banknote, CreditCard, Download, Globe2, HeartPulse, History, House, IdCardLanyard, Inbox, Mail, QrCode, ShieldCheck, UserCog, Users } from 'lucide-react'
import { roleLabel, type Role, type User } from './api'
import Workspace from './Workspace'
import { PageHead, daysBetween } from './ui'
import Accounts from './staff/Accounts'
import Badges from './staff/Badges'
import Home from './staff/Home'
import Invites from './staff/Invites'
import Overview from './staff/Overview'
import Payments from './staff/Payments'
import { Countries, People, Welfare } from './staff/People'
import { Activity, EmailLog, Exports } from './staff/Records'
import { ConsentSettingsPanel, FeeSettingsPanel, InvoiceSettingsPanel } from './staff/Settings'
import { Panel, Problem, human, useLoad } from './staff/common'

type ParticipantRecord = { displayName: string; countryTerritory: string; teamName: string | null; role: string; badgeStatus: string | null; tshirtSize: string | null; poloSize: string | null; examLanguage: string | null }

function ParticipantPanel() {
  const { data, error } = useLoad<{ member: ParticipantRecord }>('/api/participant/me')
  return (
    <Panel id="me" title="Your details" intro="Your Team Leader manages these details. Ask them if anything is wrong.">
      <Problem message={error} />
      {data && <dl className="reg-facts">
        {[['Name', data.member.displayName], ['Country', data.member.countryTerritory], ['Team', data.member.teamName ?? 'Not assigned yet'], ['Exam language', data.member.examLanguage ?? '—'],
          ['T-shirt / polo', `${data.member.tshirtSize ?? '—'} / ${data.member.poloSize ?? '—'}`], ['QR badge', data.member.badgeStatus ? human(data.member.badgeStatus) : 'Not issued yet']].map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>}
    </Panel>
  )
}

function ComingPanel({ role }: { role: Role }) {
  const tools = role === 'content_editor' ? 'News and the gallery' : 'Score entry and results publishing'
  return (
    <Panel id="coming" title="Your tools are on the way" intro={`${tools} are planned for a later sprint (see the implementation plan). Your account and role already work.`}>
      <p className="reg-aside">For security, this role cannot see any participant data.</p>
    </Panel>
  )
}

function CheckinPanel() {
  return (
    <Panel id="checkin" title="Check-in" intro="Scan badges at the arrival desk and event checkpoints. To look someone up by name, use People.">
      <a className="reg-btn reg-btn-primary" href="/check-in"><QrCode size={18} aria-hidden="true" />Open the badge scanner</a>
    </Panel>
  )
}

type SectionDef = { id: string; label: string; group: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>; roles: Role[] }

// Super admins see every section; `roles` lists who else does.
const sectionDefs: SectionDef[] = [
  { id: 'home', label: 'Home', group: 'Registration', icon: House, roles: ['registration_admin', 'finance_admin', 'checkin_staff', 'welfare_staff', 'viewer'] },
  { id: 'overview', label: 'Statistics', group: 'Registration', icon: BarChart3, roles: ['registration_admin', 'finance_admin', 'viewer'] },
  { id: 'countries', label: 'Countries', group: 'Registration', icon: Globe2, roles: ['registration_admin', 'finance_admin', 'welfare_staff'] },
  { id: 'people', label: 'People', group: 'Registration', icon: Users, roles: ['registration_admin', 'finance_admin', 'checkin_staff'] },
  { id: 'invites', label: 'Invitation codes', group: 'Registration', icon: Mail, roles: ['registration_admin'] },
  { id: 'badges', label: 'Badges', group: 'Registration', icon: IdCardLanyard, roles: ['registration_admin'] },
  { id: 'welfare', label: 'Welfare', group: 'Registration', icon: HeartPulse, roles: ['welfare_staff'] },
  { id: 'checkin', label: 'Check-in', group: 'Registration', icon: QrCode, roles: ['checkin_staff'] },
  { id: 'payments', label: 'Payments', group: 'Finance', icon: CreditCard, roles: ['finance_admin', 'registration_admin'] },
  { id: 'fees', label: 'Fees and invoice', group: 'Finance', icon: Banknote, roles: ['finance_admin', 'registration_admin'] },
  { id: 'exports', label: 'Exports', group: 'Records', icon: Download, roles: ['registration_admin', 'finance_admin', 'checkin_staff', 'welfare_staff'] },
  { id: 'activity', label: 'Activity log', group: 'Records', icon: History, roles: ['registration_admin'] },
  { id: 'email', label: 'Email log', group: 'Records', icon: Inbox, roles: ['registration_admin'] },
  { id: 'consent', label: 'Guardian consent', group: 'Settings', icon: ShieldCheck, roles: ['registration_admin'] },
  { id: 'accounts', label: 'Accounts', group: 'Settings', icon: UserCog, roles: [] },
]

const readHash = () => window.location.hash.replace(/^#/, '')

/** The next milestone, counted in Bangkok days, for the corner of the back-office header. */
function milestone() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const days = (iso: string) => daysBetween(today, iso)
  if (today < '2027-01-18') return { count: days('2027-01-18'), label: 'until registration opens', date: '18 January 2027' }
  if (today <= '2027-04-30') return { count: days('2027-04-30'), label: 'left to register', date: 'Registration closes 30 April 2027' }
  if (today < '2027-07-21') return { count: days('2027-07-21'), label: 'until the Olympiad', date: '21–28 July 2027, Bangkok' }
  if (today <= '2027-07-28') return { count: null, label: 'Olympiad week', date: '21–28 July 2027, Bangkok' }
  return { count: null, label: 'IOL 2027 has ended', date: 'Bangkok, 21–28 July 2027' }
}

function Milestone() {
  const m = milestone()
  return (
    <div className="reg-head-count">
      {m.count !== null ? <p><strong>{m.count}</strong> {m.count === 1 ? 'day' : 'days'} {m.label}</p> : <p><strong>{m.label}</strong></p>}
      <small>{m.date}</small>
    </div>
  )
}

export default function StaffHome({ user, onSessionEnd, session }: { user: User; onSessionEnd: () => void; session?: ReactNode }) {
  const role = user.role
  const isSuper = role === 'super_admin'
  const visible = sectionDefs.filter((s) => isSuper || s.roles.includes(role))
  const [active, setActive] = useState(() => (visible.some((s) => s.id === readHash()) ? readHash() : visible[0]?.id))
  const [navOpen, setNavOpen] = useState(false)
  const [openDelegation, setOpenDelegation] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (active) window.history.replaceState(null, '', `#${active}`)
    document.getElementById(`${active}-title`)?.focus({ preventScroll: true })
    const top = topRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) topRef.current?.scrollIntoView({ block: 'start' })
  }, [active])

  const head = role === 'participant'
    ? <PageHead eyebrow="Participant" title="Your registration" session={session} />
    : <PageHead eyebrow={`Back office · ${roleLabel[role]}`} title={`Hello, ${user.fullName}.`} intro="You see only the tools and data this role needs." session={session} aside={<Milestone />} />
  const page = (body: ReactNode) => <>{head}<div className="reg-shell wrap">{body}</div></>

  if (role === 'participant') return page(<div className="reg-staff"><ParticipantPanel /></div>)
  if (role === 'content_editor' || role === 'results_staff') return page(<div className="reg-staff"><ComingPanel role={role} /></div>)

  const canOpen = role === 'registration_admin' || isSuper
  const openCountry = canOpen ? (id: string) => { setOpenDelegation(id); window.scrollTo({ top: 0 }) } : undefined
  if (openDelegation) {
    return <Workspace delegationId={openDelegation} onSessionEnd={onSessionEnd} session={session} staff={{ roleLabel: roleLabel[role], onBack: () => { setOpenDelegation(null); window.scrollTo({ top: 0 }) } }} />
  }

  const go = (id: string) => { setActive(id); setNavOpen(false) }
  const panels: Record<string, () => ReactNode> = {
    home: () => <Home role={role} sections={visible.map((s) => s.id)} onGo={go} />,
    overview: () => <Overview onGo={visible.some((s) => s.id === 'payments') ? go : undefined} />,
    countries: () => <Countries onOpen={openCountry} />,
    people: () => <People onOpen={openCountry} />,
    invites: () => <Invites />,
    badges: () => <Badges />,
    welfare: () => <Welfare />,
    checkin: () => <CheckinPanel />,
    payments: () => <Payments canReview={role === 'finance_admin' || isSuper} />,
    fees: () => <><FeeSettingsPanel canEdit={role === 'finance_admin' || isSuper} /><InvoiceSettingsPanel canEdit={role === 'finance_admin' || isSuper} /></>,
    exports: () => <Exports />,
    activity: () => <Activity />,
    email: () => <EmailLog />,
    consent: () => <ConsentSettingsPanel canEdit={role === 'registration_admin' || isSuper} />,
    accounts: () => <Accounts me={user} />,
  }
  const current = visible.find((s) => s.id === active) ?? visible[0]
  if (!current) return page(<div className="reg-staff"><Panel id="none" title="Nothing to show" intro="Your role has no back-office tools yet."><span /></Panel></div>)
  if (visible.length === 1) return page(<div className="reg-staff">{panels[current.id]()}</div>)
  const groups = [...new Set(visible.map((s) => s.group))]

  return page(
    <div className="reg-staff-layout" ref={topRef}>
      <nav className={`reg-rail reg-staff-rail${navOpen ? ' is-open' : ''}`} aria-label="Back office">
        <button type="button" className="reg-rail-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
          <span>Back office</span>
          <strong>{current.label}</strong>
        </button>
        {groups.map((group) => (
          <div key={group} className="reg-staff-group">
            <p className="reg-rail-group" id={`staff-group-${group}`}>{group}</p>
            <ul aria-labelledby={`staff-group-${group}`}>
              {visible.filter((s) => s.group === group).map((s) => {
                const Icon = s.icon
                return (
                  <li key={s.id}>
                    <button type="button" className={`reg-rail-item${s.id === current.id ? ' is-current' : ''}`} aria-current={s.id === current.id ? 'page' : undefined} onClick={() => go(s.id)}>
                      <span className="reg-rail-icon"><Icon size={17} aria-hidden="true" /></span>
                      <span className="reg-rail-text"><span>{s.label}</span></span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="reg-staff-main" key={current.id}>{panels[current.id]()}</div>
    </div>
  )
}
