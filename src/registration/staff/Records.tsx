import { useState } from 'react'
import { Download, RotateCw } from 'lucide-react'
import { api, roleLabel, type Role } from '../api'
import { Done, FilterField, Note, PAGE_SIZE, Pager, Panel, Problem, TableWrap, errorText, human, useLoad, when } from './common'

// In the order they are listed. Each file has one row per thing and plain values: dates as YYYY-MM-DD, times in
// Bangkok time, yes or no, so it can be filtered, cleaned or charted as it is.
const exportInfo: Record<string, { title: string; description: string }> = {
  summary: { title: 'Summary by country', description: 'One row per country with numbers only: teams, observers, single rooms, people entered, statuses, amount due, badges and check-ins. No names. Good for charts.' },
  people: { title: 'People, every detail', description: 'Everyone with every detail, including passports, health notes and status. Handle as confidential.' },
  people_status: { title: 'People and progress', description: 'Everyone’s name, country, team, role, registration stage, badge and first check-in. No personal details.' },
  delegations: { title: 'Countries', description: 'One row per country: fee rate, Team Leader and contacts, counts, registration, payment and travel status, stay dates.' },
  payments: { title: 'Payments', description: 'One row per payment: references, receipt numbers, amounts, fee rate and tier, and who reviewed it.' },
  invoices: { title: 'Invoices', description: 'One row per invoice. A payment split between payers has a row for each payer and amount.' },
  travel: { title: 'Travel', description: 'Arrival and departure trips in date order, with how many people and who is on each.' },
  checkins: { title: 'Check-ins', description: 'Every badge scan: time, checkpoint, result, person and who scanned.' },
  rooming: { title: 'Rooming', description: 'One row per person: gender for rooming, single room, contestants’ room preference, under 18 or not, and stay dates.' },
  welfare: { title: 'Food, health and emergency contacts', description: 'One row per person. No passport data.' },
  contestants: { title: 'Contestants and languages', description: 'Every contestant with their team and their individual and team contest languages, for the Problem Committee and results.' },
}
const exportOrder = Object.keys(exportInfo)

export function Exports() {
  const { data, error } = useLoad<{ kinds: string[] }>('/api/admin/exports')
  return (
    <Panel id="exports" title="Exports" intro="Spreadsheet downloads (CSV, opens in Excel, Google Sheets or any data tool). You see the files your role needs. Every download is recorded in the activity log.">
      <Problem message={error} />
      {data && (data.kinds.length === 0 ? <Note>Your role has no exports.</Note> : (
        <ul className="reg-export-list">
          {[...data.kinds].sort((a, b) => exportOrder.indexOf(a) - exportOrder.indexOf(b)).map((kind) => (
            <li key={kind}>
              <div><strong>{exportInfo[kind]?.title ?? human(kind)}</strong><span>{exportInfo[kind]?.description}</span></div>
              <a className="reg-btn reg-btn-secondary" href={`/api/admin/exports/${kind}`} download><Download size={16} aria-hidden="true" />Download<span className="reg-visually-hidden"> {exportInfo[kind]?.title ?? kind}</span></a>
            </li>
          ))}
        </ul>
      ))}
      <Note>Personal data in these files is covered by Thailand’s PDPA. Keep downloads on organiser devices and delete them when you are done.</Note>
    </Panel>
  )
}

type AuditEvent = {
  id: string; eventType: string; entityType: string; details: Record<string, unknown>; createdAt: string
  actorName: string | null; actorEmail: string | null; actorRole: string | null; countryTerritory: string | null
}

export const eventText: Record<string, string> = {
  team_leader_account_created: 'Created the Team Leader account', delegation_updated: 'Changed the registration', invoice_saved: 'Saved invoice details',
  team_updated: 'Changed a team', member_added: 'Added a person', member_updated: 'Changed a person', member_removed: 'Removed a person',
  travel_saved: 'Saved a trip', payment_proof_uploaded: 'Uploaded proof of payment', payment_approved: 'Approved a payment', payment_rejected: 'Returned a proof',
  registration_submitted: 'Submitted the registration', guardian_consent_uploaded: 'Uploaded a consent form', badge_issued: 'Issued a badge',
  invite_created: 'Created an invitation code', invite_sent: 'Sent an invitation', invite_revoked: 'Revoked an invitation code', invite_reactivated: 'Reactivated an invitation code',
  invite_updated: 'Changed an invitation contact', export_downloaded: 'Downloaded an export', settings_updated: 'Changed settings', role_changed: 'Changed a role',
  account_created: 'Created a staff account', account_disabled: 'Disabled an account', account_enabled: 'Enabled an account', password_reset: 'Reset their password',
  badges_issued: 'Issued badges', badge_new_qr: 'Gave a badge a new QR code', badges_print_file: 'Downloaded a badge print file', badges_marked_printed: 'Marked badges as printed',
  event_staff_added: 'Added staff badges', event_staff_updated: 'Changed a staff badge', event_staff_removed: 'Removed a staff badge',
  email_retried: 'Tried an email again',
}

const settingName: Record<string, string> = { fees: 'Fees', guardianConsent: 'Guardian consent policy', invoice: 'Invoice and bank account', badges: 'Badge print cut-off' }

function summary(event: AuditEvent) {
  const d = event.details ?? {}
  if (Array.isArray(d.fields)) return (d.fields as string[]).map((f) => human(f.replace(/([A-Z])/g, '_$1').toLowerCase())).join(', ')
  if (event.eventType === 'export_downloaded') return `${exportInfo[String(d.kind)]?.title ?? human(String(d.kind))}, ${d.rows} ${d.rows === 1 ? 'row' : 'rows'}`
  if (event.eventType === 'payment_rejected') return String(d.note ?? '')
  if (event.eventType === 'payment_approved' && d.receiptNumber) return `Receipt ${d.receiptNumber}`
  if (event.eventType === 'settings_updated') return settingName[String(d.key)] ?? human(String(d.key ?? ''))
  if (event.eventType === 'role_changed' || event.eventType === 'account_created') return roleLabel[d.role as Role] ?? human(String(d.role ?? ''))
  if (event.eventType === 'invite_created') return String(d.country ?? '')
  if (event.eventType === 'invite_sent') return d.emailSent ? 'Email sent' : 'Recorded; email switched off'
  if (d.originalFilename) return String(d.originalFilename)
  return ''
}

/** Moving to another page of a log brings its panel back into view. */
const showPage = (panelId: string, setOffset: (offset: number) => void) => (offset: number) => {
  setOffset(offset)
  const panel = document.getElementById(panelId)
  if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' })
}

export function Activity() {
  const [eventType, setEventType] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error } = useLoad<{ events: AuditEvent[]; total: number }>(`/api/admin/audit?limit=${PAGE_SIZE}&offset=${offset}${eventType ? `&eventType=${eventType}` : ''}`)
  return (
    <Panel id="activity" title="Activity log" intro="Who changed what, and when. Newest first, 50 at a time.">
      <div className="reg-filter-bar">
        <FilterField id="activity-type" label="Show">
          <select id="activity-type" className="reg-control reg-control-compact" value={eventType} onChange={(e) => { setEventType(e.target.value); setOffset(0) }}>
            <option value="">Everything</option>
            {Object.entries(eventText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FilterField>
      </div>
      <Problem message={error} />
      {data && (data.events.length === 0 ? <Note>Nothing recorded yet.</Note> : (
        <TableWrap label="Activity log">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Country</th><th scope="col">Detail</th></tr></thead>
          <tbody>{data.events.map((e) => (
            <tr key={e.id}>
              <td className="reg-nowrap">{when(e.createdAt)}</td>
              <td>{e.actorName ?? <span className="reg-muted">Account since removed</span>}{e.actorRole && <small>{roleLabel[e.actorRole as Role] ?? human(e.actorRole)}</small>}</td>
              <td>{eventText[e.eventType] ?? human(e.eventType)}</td>
              <td>{e.countryTerritory ?? '—'}</td>
              <td>{summary(e) || '—'}</td>
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
      {data && <Pager offset={offset} count={data.events.length} total={data.total} onPage={showPage('activity', setOffset)} />}
    </Panel>
  )
}

type EmailRow = {
  id: string; recipientEmail: string; purpose: string; subject: string | null; status: string; errorMessage: string | null
  attempts: number; nextAttemptAt: string | null; canRetry: boolean; createdAt: string
}

const purposeText: Record<string, string> = {
  account_verification: 'Email check code', password_reset: 'Password reset code', account_setup: 'Staff account set-up code',
  invite_code: 'Invitation code', payment_proof_received: 'Proof received', finance_proof_alert: 'Proof alert to Finance',
  payment_confirmed: 'Payment confirmed', registration_submitted: 'Registration submitted, with invoice',
  badges_issued: 'Badges', badges_updated: 'Badge update', daily_summary: 'Daily summary',
}
const statusText: Record<string, string> = { queued: 'Queued', sending: 'Sending', sent: 'Sent', retrying: 'Trying again', failed: 'Failed', skipped: 'Skipped' }

export function EmailLog() {
  const [offset, setOffset] = useState(0)
  const [show, setShow] = useState('')
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  const [problem, setProblem] = useState('')
  const { data, error, reload } = useLoad<{ deliveries: EmailRow[]; total: number }>(`/api/admin/email-deliveries?limit=${PAGE_SIZE}&offset=${offset}${show ? `&show=${show}` : ''}`)
  const retry = async (row: EmailRow) => {
    setBusy(row.id); setDone(''); setProblem('')
    try {
      const { delivery } = await api<{ delivery: EmailRow }>(`/api/admin/email-deliveries/${row.id}/retry`, { method: 'POST' })
      if (delivery.status === 'sent') setDone(`Sent to ${delivery.recipientEmail}.`)
      else setProblem(`Not sent: ${delivery.errorMessage ?? 'unknown error'}.${delivery.status === 'retrying' ? ` It will be tried again ${when(delivery.nextAttemptAt)}.` : ''}`)
      reload()
    } catch (e) {
      setProblem(errorText(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <Panel id="email" title="Email log" intro="Every email the system tried to send, newest first. When sending fails, the emails that go out on their own (payment, registration, badges, the daily summary) are tried again for about a day and a half, then marked Failed with Try again. Codes and invitations are not: whoever sent them sees the error. Skipped is a test address (.test); Queued means email is switched off on this server.">
      <div className="reg-filter-bar">
        <FilterField id="email-show" label="Show">
          <select id="email-show" className="reg-control reg-control-compact" value={show} onChange={(e) => { setShow(e.target.value); setOffset(0) }}>
            <option value="">Everything</option>
            <option value="unsent">Not sent: trying again or failed</option>
          </select>
        </FilterField>
      </div>
      <Problem message={error || problem} />
      <Done message={done} />
      {data && (data.deliveries.length === 0 ? <Note>{show ? 'Every email went out.' : 'No emails yet.'}</Note> : (
        <TableWrap label="Email log">
          <thead><tr><th scope="col">When</th><th scope="col">To</th><th scope="col">Email</th><th scope="col">Status</th></tr></thead>
          <tbody>{data.deliveries.map((d) => (
            <tr key={d.id}>
              <td className="reg-nowrap">{when(d.createdAt)}</td>
              <td>{d.recipientEmail}</td>
              <td>{purposeText[d.purpose] ?? human(d.purpose)}{d.subject && <small>{d.subject}</small>}</td>
              <td className="reg-email-status">
                {statusText[d.status] ?? human(d.status)}
                {d.status === 'retrying' && <small>Attempt {d.attempts} failed. Next try {when(d.nextAttemptAt)}.</small>}
                {d.errorMessage && <small>{d.errorMessage}</small>}
                {d.canRetry && <button type="button" className="reg-btn-link" disabled={busy === d.id} onClick={() => void retry(d)}><RotateCw size={15} aria-hidden="true" />{busy === d.id ? 'Sending…' : 'Try again'}</button>}
              </td>
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
      {data && <Pager offset={offset} count={data.deliveries.length} total={data.total} onPage={showPage('email', setOffset)} />}
    </Panel>
  )
}
