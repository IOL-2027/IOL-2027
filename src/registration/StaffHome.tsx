import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check, CircleAlert, Download, QrCode } from 'lucide-react'
import { api, ApiError, roleLabel, type Role, type User } from './api'

type Count = { status: string; count: number }
type Dashboard = { registration: Count[]; payment: Count[]; travel: Count[]; people: Count[]; proofsWaiting: number }
type DelegationRow = { id: string; countryTerritory: string; primaryTeamLeaderName: string; teamLeaderEmail: string; numberOfTeams: number; numberOfObservers: number; registrationStatus: string; paymentStatus: string; people: number }
type PaymentRow = { id: string; countryTerritory: string; paymentReference: string; amountDue: string; currency: string; status: string; proofAttachmentId: string | null; proofFilename: string | null; reviewNote: string | null; reviewedByName: string | null; updatedAt: string }
type WelfareRow = { id: string; displayName: string; role: string; countryTerritory: string; foodAllergyNotes: string | null; medicalAccessibilityNotes: string | null; emergencyContact: string | null; roomTypePreference: string | null }
type EmailRow = { id: string; recipientEmail: string; purpose: string; status: string; errorMessage: string | null; createdAt: string }
type AccountRow = { id: string; email: string; fullName: string; role: Role; lastLoginAt: string | null }
type ParticipantRecord = { displayName: string; countryTerritory: string; teamName: string | null; role: string; badgeStatus: string | null; tshirtSize: string | null; poloSize: string | null; examLanguage: string | null }

const human = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => { setError(''); api<T>(path).then(setData).catch((e: ApiError) => setError(e.message)) }, [path])
  useEffect(load, [load])
  return { data, error, reload: load }
}

function Panel({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="reg-panel reg-staff-panel" aria-labelledby={`${id}-title`} id={id}>
      <header className="reg-panel-head"><h2 id={`${id}-title`}>{title}</h2>{intro && <p>{intro}</p>}</header>
      {children}
    </section>
  )
}

function Problem({ message }: { message: string }) {
  return message ? <p className="reg-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{message}</p> : null
}

function DashboardPanel() {
  const { data, error } = useLoad<Dashboard>('/api/admin/dashboard')
  const total = (rows: Count[] = []) => rows.reduce((sum, r) => sum + r.count, 0)
  const group = (title: string, rows: Count[] = []) => (
    <div className="reg-stat-group">
      <h3>{title}</h3>
      <dl>{rows.length ? rows.map((r) => <div key={r.status}><dt>{human(r.status)}</dt><dd>{r.count}</dd></div>) : <div><dt>None yet</dt><dd>0</dd></div>}</dl>
    </div>
  )
  return (
    <Panel id="dashboard" title="Overview" intro="Live totals across all countries.">
      <Problem message={error} />
      {data && <>
        <div className="reg-stats">
          <div><strong>{total(data.registration)}</strong><span>Countries registered</span></div>
          <div><strong>{total(data.people)}</strong><span>People</span></div>
          <div><strong>{data.proofsWaiting}</strong><span>Proofs waiting for Finance</span></div>
        </div>
        <div className="reg-stat-groups">{group('Registration', data.registration)}{group('Payment', data.payment)}{group('Travel', data.travel)}{group('People by role', data.people)}</div>
      </>}
    </Panel>
  )
}

function DelegationsPanel() {
  const { data, error } = useLoad<{ delegations: DelegationRow[] }>('/api/admin/delegations')
  return (
    <Panel id="delegations" title="Countries" intro="Every delegation and where it is in registration.">
      <Problem message={error} />
      {data && <div className="reg-table-wrap" role="region" aria-label="Countries table" tabIndex={0}><table className="reg-table">
        <thead><tr><th scope="col">Country</th><th scope="col">Team Leader</th><th scope="col">Teams</th><th scope="col">People</th><th scope="col">Registration</th><th scope="col">Payment</th></tr></thead>
        <tbody>{data.delegations.map((d) => (
          <tr key={d.id}><th scope="row">{d.countryTerritory}</th><td>{d.primaryTeamLeaderName}<small>{d.teamLeaderEmail}</small></td><td>{d.numberOfTeams}</td><td>{d.people}</td><td>{human(d.registrationStatus)}</td><td>{human(d.paymentStatus)}</td></tr>
        ))}</tbody>
      </table></div>}
    </Panel>
  )
}

function PaymentsPanel({ canReview }: { canReview: boolean }) {
  const [filter, setFilter] = useState('awaiting_review')
  const { data, error, reload } = useLoad<{ payments: PaymentRow[] }>(`/api/admin/payments${filter ? `?status=${filter}` : ''}`)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState('')
  const [done, setDone] = useState('')
  const act = async (payment: PaymentRow, action: 'approve' | 'reject') => {
    setActionError(''); setDone('')
    try {
      await api(`/api/admin/payments/${payment.id}/${action}`, { method: 'POST', body: { note: notes[payment.id] ?? '' } })
      setDone(`${payment.countryTerritory}: payment ${action === 'approve' ? 'approved' : 'returned to the Team Leader'}.`)
      reload()
    } catch (e) { setActionError((e as ApiError).message) }
  }
  return (
    <Panel id="payments" title="Payments" intro={canReview ? 'Check each proof against the สอวน bank statement, then approve it or return it with a reason.' : 'Read-only. Approving payments is a Finance task.'}>
      <div className="reg-filter" role="group" aria-label="Show payments">
        {[['awaiting_review', 'Waiting for review'], ['approved', 'Approved'], ['rejected', 'Returned'], ['', 'All']].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : undefined} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <Problem message={error || actionError} />
      <p className="reg-status-line" role="status">{done}</p>
      {data && (data.payments.length === 0 ? <p className="reg-aside">Nothing here right now.</p> : (
        <ul className="reg-pay-list">{data.payments.map((p) => (
          <li key={p.id}>
            <div className="reg-pay-main">
              <strong>{p.countryTerritory}</strong>
              <span>{p.paymentReference} · {p.currency} {Number(p.amountDue).toLocaleString('en-US')}</span>
              <span>{human(p.status)}{p.reviewedByName ? ` by ${p.reviewedByName}` : ''} · {when(p.updatedAt)}</span>
              {p.reviewNote && <span>Note: {p.reviewNote}</span>}
            </div>
            {p.proofAttachmentId && <a className="reg-btn-link" href={`/api/registration/attachments/${p.proofAttachmentId}`}><Download size={16} aria-hidden="true" />{p.proofFilename ?? 'Proof'}</a>}
            {canReview && p.status === 'awaiting_review' && (
              <div className="reg-pay-actions">
                <label className="reg-visually-hidden" htmlFor={`note-${p.id}`}>Reason, required to return a proof</label>
                <input id={`note-${p.id}`} className="reg-control" placeholder="Reason (needed to return it)" value={notes[p.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} />
                <button type="button" className="reg-btn reg-btn-primary" onClick={() => act(p, 'approve')}><Check size={16} aria-hidden="true" />Approve</button>
                <button type="button" className="reg-btn reg-btn-secondary" onClick={() => act(p, 'reject')}>Return</button>
              </div>
            )}
          </li>
        ))}</ul>
      ))}
    </Panel>
  )
}

function WelfarePanel() {
  const { data, error } = useLoad<{ people: WelfareRow[] }>('/api/admin/welfare')
  return (
    <Panel id="welfare" title="Welfare" intro="Food, medical and emergency information for everyone. Passport data is not shown to this role.">
      <Problem message={error} />
      {data && <div className="reg-table-wrap" role="region" aria-label="Welfare table" tabIndex={0}><table className="reg-table">
        <thead><tr><th scope="col">Person</th><th scope="col">Country</th><th scope="col">Food</th><th scope="col">Medical / access</th><th scope="col">Emergency contact</th></tr></thead>
        <tbody>{data.people.map((p) => (
          <tr key={p.id}><th scope="row">{p.displayName}<small>{human(p.role)}</small></th><td>{p.countryTerritory}</td><td>{p.foodAllergyNotes ?? '—'}</td><td>{p.medicalAccessibilityNotes ?? '—'}</td><td>{p.emergencyContact ?? '—'}</td></tr>
        ))}</tbody>
      </table></div>}
    </Panel>
  )
}

function EmailPanel() {
  const { data, error } = useLoad<{ deliveries: EmailRow[] }>('/api/admin/email-deliveries')
  return (
    <Panel id="email" title="Email log" intro="Every email the system tried to send. “Queued” means no email provider is switched on yet.">
      <Problem message={error} />
      {data && <div className="reg-table-wrap" role="region" aria-label="Email log table" tabIndex={0}><table className="reg-table">
        <thead><tr><th scope="col">When</th><th scope="col">To</th><th scope="col">Purpose</th><th scope="col">Status</th></tr></thead>
        <tbody>{data.deliveries.map((d) => (
          <tr key={d.id}><td>{when(d.createdAt)}</td><td>{d.recipientEmail}</td><td>{human(d.purpose)}</td><td>{human(d.status)}{d.errorMessage && <small>{d.errorMessage}</small>}</td></tr>
        ))}</tbody>
      </table></div>}
    </Panel>
  )
}

function AccountsPanel({ me }: { me: User }) {
  const { data, error, reload } = useLoad<{ accounts: AccountRow[]; roles: Role[] }>('/api/admin/accounts')
  const [message, setMessage] = useState('')
  const change = async (account: AccountRow, role: Role) => {
    setMessage('')
    try { await api(`/api/admin/accounts/${account.id}`, { method: 'PATCH', body: { role } }); setMessage(`${account.email} is now ${roleLabel[role]}. They have been signed out.`); reload() }
    catch (e) { setMessage((e as ApiError).message) }
  }
  return (
    <Panel id="accounts" title="Accounts and roles" intro="Changing a role signs that person out, so the new permissions apply immediately.">
      <Problem message={error} />
      <p className="reg-status-line" role="status">{message}</p>
      {data && <div className="reg-table-wrap" role="region" aria-label="Accounts table" tabIndex={0}><table className="reg-table">
        <thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Last sign-in</th></tr></thead>
        <tbody>{data.accounts.map((a) => (
          <tr key={a.id}><th scope="row">{a.fullName}<small>{a.email}</small></th>
            <td>{a.id === me.id ? roleLabel[a.role] : (
              <><label className="reg-visually-hidden" htmlFor={`role-${a.id}`}>Role for {a.email}</label>
                <select id={`role-${a.id}`} className="reg-control reg-control-compact" value={a.role} onChange={(e) => change(a, e.target.value as Role)}>
                  {data.roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                </select></>
            )}</td>
            <td>{when(a.lastLoginAt)}</td></tr>
        ))}</tbody>
      </table></div>}
    </Panel>
  )
}

function ParticipantPanel() {
  const { data, error } = useLoad<{ member: ParticipantRecord }>('/api/participant/me')
  return (
    <Panel id="me" title="Your registration" intro="Your Team Leader manages these details. Ask them if anything is wrong.">
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
    <Panel id="checkin" title="Check-in" intro="Scan badges at the arrival desk and event checkpoints. Name search is coming for badges that will not scan.">
      <a className="reg-btn reg-btn-primary" href="/registration/check-in"><QrCode size={18} aria-hidden="true" />Open the badge scanner</a>
    </Panel>
  )
}

export default function StaffHome({ user }: { user: User }) {
  const role = user.role
  const is = (...roles: Role[]) => roles.includes(role) || role === 'super_admin'
  return (
    <div className="reg-staff">
      {role === 'participant' && <ParticipantPanel />}
      {(role === 'content_editor' || role === 'results_staff') && <ComingPanel role={role} />}
      {role === 'checkin_staff' && <CheckinPanel />}
      {is('registration_admin', 'finance_admin', 'viewer') && <DashboardPanel />}
      {is('finance_admin') && <PaymentsPanel canReview />}
      {role === 'registration_admin' && <PaymentsPanel canReview={false} />}
      {is('registration_admin', 'finance_admin', 'welfare_staff') && <DelegationsPanel />}
      {is('welfare_staff') && <WelfarePanel />}
      {is('registration_admin') && <EmailPanel />}
      {role === 'super_admin' && <AccountsPanel me={user} />}
    </div>
  )
}
