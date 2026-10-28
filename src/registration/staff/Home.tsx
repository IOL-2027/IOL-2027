// The back-office home: what is waiting for this role, shortcuts to its everyday tools, and (for roles that may
// see them) the headline numbers and the latest activity. Every count comes from an endpoint the role can already read.
import type { ComponentType, ReactNode } from 'react'
import { ArrowRight, Banknote, Check, CreditCard, Download, Globe2, HeartPulse, Mail, QrCode, Search, UserCog } from 'lucide-react'
import type { Role } from '../api'
import { eventText } from './Records'
import { Panel, Problem, useLoad, when } from './common'

type Count = { status: string; count: number }
type Dashboard = { registration: Count[]; invites: Count[]; stages: Count[]; proofsWaiting: number; invitesNotSent: number; emailsFailed: number }
type AuditEvent = { id: string; eventType: string; createdAt: string; actorName: string | null; countryTerritory: string | null }
type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>
type Action = { label: string; go?: string; href?: string }
type Task = { key: string; count: number; text: string; clear: string; action: Action }

const total = (rows: Count[] = []) => rows.reduce((sum, r) => sum + r.count, 0)
const countOf = (rows: Count[] = [], status: string) => rows.find((r) => r.status === status)?.count ?? 0
const scanningRoles: Role[] = ['checkin_staff', 'registration_admin', 'super_admin']

// In the order they are offered; each shows only when the role has that section (or, for the scanner, may scan).
const shortcuts: { key: string; icon: Icon; title: (role: Role) => string; detail: string; go?: string; href?: string }[] = [
  { key: 'invites', icon: Mail, title: () => 'Create invitation codes', detail: 'Add countries and email each one its code.', go: 'invites' },
  { key: 'payments', icon: CreditCard, title: (role) => (role === 'registration_admin' ? 'See payments' : 'Review payments'), detail: 'Proofs of transfer, approvals and e-receipts.', go: 'payments' },
  { key: 'people', icon: Search, title: () => 'Find a person', detail: 'Anyone, by name, country or stage.', go: 'people' },
  { key: 'scanner', icon: QrCode, title: () => 'Open the badge scanner', detail: 'Scan badges at arrival and checkpoints.', href: '/check-in' },
  { key: 'welfare', icon: HeartPulse, title: () => 'Welfare list', detail: 'Food, medical and rooming notes.', go: 'welfare' },
  { key: 'exports', icon: Download, title: () => 'Download lists', detail: 'Spreadsheets of people, travel and more.', go: 'exports' },
  { key: 'accounts', icon: UserCog, title: () => 'Staff accounts', detail: 'Add organisers and set their roles.', go: 'accounts' },
  { key: 'countries', icon: Globe2, title: () => 'Countries', detail: 'Every delegation and how far it has got.', go: 'countries' },
  { key: 'fees', icon: Banknote, title: () => 'Fees and invoice', detail: 'The amounts, due dates and bank account on invoices.', go: 'fees' },
]

function ActionLink({ action, onGo, className, children }: { action: Action; onGo: (id: string) => void; className: string; children: ReactNode }) {
  return action.href
    ? <a className={className} href={action.href}>{children}</a>
    : <button type="button" className={className} onClick={() => onGo(action.go!)}>{children}</button>
}

export default function Home({ role, sections, onGo }: { role: Role; sections: string[]; onGo: (id: string) => void }) {
  const isSuper = role === 'super_admin'
  const can = (...roles: Role[]) => isSuper || roles.includes(role)
  const seesTotals = can('registration_admin', 'finance_admin', 'viewer')
  const dashboard = useLoad<Dashboard>(seesTotals ? '/api/admin/dashboard' : null)
  const scans = useLoad<{ people: { stage: string }[] }>(role === 'checkin_staff' ? '/api/admin/people' : null)
  const welfare = useLoad<{ people: { foodAllergyNotes?: string | null; medicalAccessibilityNotes?: string | null }[] }>(role === 'welfare_staff' ? '/api/admin/welfare' : null)
  const activity = useLoad<{ events: AuditEvent[] }>(can('registration_admin') ? '/api/admin/audit?limit=5' : null)

  const d = dashboard.data
  const tasks: Task[] = []
  if (d && can('finance_admin')) {
    tasks.push({ key: 'proofs', count: d.proofsWaiting, text: d.proofsWaiting === 1 ? 'proof of payment waiting for review' : 'proofs of payment waiting for review', clear: 'No proofs of payment waiting', action: { label: 'Review payments', go: 'payments' } })
  }
  if (d && can('registration_admin')) {
    tasks.push({ key: 'invites', count: d.invitesNotSent, text: d.invitesNotSent === 1 ? 'invitation code not sent yet' : 'invitation codes not sent yet', clear: 'Every invitation code has been sent', action: { label: 'Send the codes', go: 'invites' } })
    tasks.push({ key: 'emails', count: d.emailsFailed, text: d.emailsFailed === 1 ? 'email could not be sent' : 'emails could not be sent', clear: 'No emails waiting to be sent again', action: { label: 'Open the email log', go: 'email' } })
  }
  if (scans.data) {
    const waiting = scans.data.people.filter((p) => p.stage === 'badge_issued').length
    tasks.push({ key: 'checkin', count: waiting, text: waiting === 1 ? 'person with a badge, not checked in yet' : 'people with a badge, not checked in yet', clear: 'Nobody is waiting to check in', action: { label: 'Open the badge scanner', href: '/check-in' } })
  }
  if (welfare.data) {
    const notes = welfare.data.people.filter((p) => p.foodAllergyNotes || p.medicalAccessibilityNotes).length
    tasks.push({ key: 'welfare', count: notes, text: notes === 1 ? 'person with food or medical notes to read' : 'people with food or medical notes to read', clear: 'No food or medical notes yet', action: { label: 'Open the welfare list', go: 'welfare' } })
  }
  const loading = ([[dashboard, seesTotals], [scans, role === 'checkin_staff'], [welfare, role === 'welfare_staff']] as const)
    .some(([load, active]) => active && load.data === null && !load.error)
  const actions = shortcuts.filter((s) => (s.key === 'scanner' ? scanningRoles.includes(role) : sections.includes(s.go!))).slice(0, 6)
  const side = seesTotals || can('registration_admin')

  return (
    <Panel id="home" title="Home" intro="What is waiting for you, and the quickest way to everything else.">
      <Problem message={dashboard.error || scans.error || welfare.error} />
      <div className={`reg-dash${side ? ' has-side' : ''}`}>
        <div className="reg-dash-main">
          {(tasks.length > 0 || loading) && (
            <section aria-labelledby="dash-attention">
              <h3 id="dash-attention" className="reg-dash-head">Needs your attention</h3>
              {loading && <p className="reg-loading reg-dash-loading" role="status">Loading…</p>}
              <ul className="reg-tasks">
                {tasks.map((task) => (
                  <li key={task.key} className={task.count ? 'is-waiting' : 'is-clear'}>
                    {task.count
                      ? <><strong className="reg-task-count">{task.count}</strong><span className="reg-task-text">{task.text}</span>
                        <ActionLink action={task.action} onGo={onGo} className="reg-btn reg-btn-secondary reg-task-go">{task.action.label} <ArrowRight size={16} aria-hidden="true" /></ActionLink></>
                      : <><span className="reg-task-ok" aria-hidden="true"><Check size={16} strokeWidth={3} /></span><span className="reg-task-text">{task.clear}</span></>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actions.length > 0 && (
            <section aria-labelledby="dash-actions">
              <h3 id="dash-actions" className="reg-dash-head">Quick actions</h3>
              <ul className="reg-shortcuts">
                {actions.map((a) => {
                  const Icon = a.icon
                  return (
                    <li key={a.key}>
                      <ActionLink action={{ label: a.title(role), go: a.go, href: a.href }} onGo={onGo} className="reg-shortcut">
                        <span className="reg-shortcut-icon"><Icon size={19} aria-hidden="true" /></span>
                        <span className="reg-shortcut-text"><strong>{a.title(role)}</strong><small>{a.detail}</small></span>
                        <ArrowRight size={17} aria-hidden="true" className="reg-shortcut-arrow" />
                      </ActionLink>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>

        {side && (
          <div className="reg-dash-side">
            {d && (
              <section aria-labelledby="dash-glance">
                <div className="reg-dash-headrow">
                  <h3 id="dash-glance" className="reg-dash-head">At a glance</h3>
                  {sections.includes('overview') && <button type="button" className="reg-btn-link" onClick={() => onGo('overview')}>All statistics</button>}
                </div>
                <dl className="reg-glance">
                  <div><dt>Countries with an account<small>{countOf(d.registration, 'submitted')} submitted</small></dt><dd>{total(d.registration)}</dd></div>
                  <div><dt>People entered<small>{countOf(d.stages, 'paid') + countOf(d.stages, 'badge_issued') + countOf(d.stages, 'checked_in')} paid</small></dt><dd>{total(d.stages)}</dd></div>
                  <div><dt>Invitation codes not used yet<small>{countOf(d.invites, 'used')} used</small></dt><dd>{countOf(d.invites, 'active')}</dd></div>
                  <div><dt>Proofs waiting for Finance<small>{d.proofsWaiting ? 'Finance reviews these' : 'None waiting'}</small></dt><dd>{d.proofsWaiting}</dd></div>
                </dl>
              </section>
            )}
            {can('registration_admin') && (
              <section aria-labelledby="dash-activity">
                <div className="reg-dash-headrow">
                  <h3 id="dash-activity" className="reg-dash-head">Latest activity</h3>
                  <button type="button" className="reg-btn-link" onClick={() => onGo('activity')}>Activity log</button>
                </div>
                <Problem message={activity.error} />
                {activity.data && (activity.data.events.length === 0
                  ? <p className="reg-hint">Nothing has happened yet.</p>
                  : <ol className="reg-activity">
                    {activity.data.events.map((e) => (
                      <li key={e.id}>
                        <p><strong>{e.actorName ?? 'Someone'}</strong> {(eventText[e.eventType] ?? e.eventType.replace(/_/g, ' ')).replace(/^\w/, (c) => c.toLowerCase())}{e.countryTerritory ? <span> · {e.countryTerritory}</span> : null}</p>
                        <time dateTime={e.createdAt}>{when(e.createdAt)}</time>
                      </li>
                    ))}
                  </ol>)}
              </section>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
