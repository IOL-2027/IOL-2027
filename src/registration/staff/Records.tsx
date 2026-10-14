import { useState } from 'react'
import { Download } from 'lucide-react'
import { roleLabel, type Role } from '../api'
import { FilterField, Note, Panel, Problem, TableWrap, human, useLoad, when } from './common'

const exportInfo: Record<string, { title: string; description: string }> = {
  people: { title: 'People', description: 'Everyone with every detail, including passports, health notes and status. Handle as confidential.' },
  delegations: { title: 'Countries', description: 'One row per country: Team Leader, counts, registration, payment and travel status, stay dates.' },
  payments: { title: 'Payments', description: 'References, receipt numbers, amounts, invoice details and who reviewed each payment.' },
  travel: { title: 'Travel', description: 'Arrival and departure trips in date order, with the people on each.' },
  checkins: { title: 'Check-ins', description: 'Every badge scan: time, checkpoint, result, person and who scanned.' },
  welfare: { title: 'Welfare', description: 'Food, medical, emergency contacts and rooming. No passport data.' },
}

export function Exports() {
  const { data, error } = useLoad<{ kinds: string[] }>('/api/admin/exports')
  return (
    <Panel id="exports" title="Exports" intro="Spreadsheet downloads (CSV, opens in Excel or Google Sheets). Each has country, team and role columns to filter by. Every download is recorded in the activity log.">
      <Problem message={error} />
      {data && (data.kinds.length === 0 ? <Note>Your role has no exports.</Note> : (
        <ul className="reg-export-list">
          {data.kinds.map((kind) => (
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

const eventText: Record<string, string> = {
  team_leader_account_created: 'Created the Team Leader account', delegation_updated: 'Changed the registration', invoice_saved: 'Saved invoice details',
  team_updated: 'Changed a team', member_added: 'Added a person', member_updated: 'Changed a person', member_removed: 'Removed a person',
  travel_saved: 'Saved a trip', payment_proof_uploaded: 'Uploaded proof of payment', payment_approved: 'Approved a payment', payment_rejected: 'Returned a proof',
  registration_submitted: 'Submitted the registration', guardian_consent_uploaded: 'Uploaded a consent form', badge_issued: 'Issued a badge',
  invite_created: 'Created an invitation code', invite_sent: 'Sent an invitation', invite_revoked: 'Revoked an invitation code', invite_reactivated: 'Reactivated an invitation code',
  invite_updated: 'Changed an invitation contact', export_downloaded: 'Downloaded an export', settings_updated: 'Changed settings', role_changed: 'Changed a role',
  account_created: 'Created a staff account', account_disabled: 'Disabled an account', account_enabled: 'Enabled an account', password_reset: 'Reset their password',
}

const settingName: Record<string, string> = { fees: 'Fees', guardianConsent: 'Guardian consent policy' }

function summary(event: AuditEvent) {
  const d = event.details ?? {}
  if (Array.isArray(d.fields)) return (d.fields as string[]).map((f) => human(f.replace(/([A-Z])/g, '_$1').toLowerCase())).join(', ')
  if (event.eventType === 'export_downloaded') return `${human(String(d.kind))}, ${d.rows} ${d.rows === 1 ? 'row' : 'rows'}`
  if (event.eventType === 'payment_rejected') return String(d.note ?? '')
  if (event.eventType === 'payment_approved' && d.receiptNumber) return `Receipt ${d.receiptNumber}`
  if (event.eventType === 'settings_updated') return settingName[String(d.key)] ?? human(String(d.key ?? ''))
  if (event.eventType === 'role_changed' || event.eventType === 'account_created') return roleLabel[d.role as Role] ?? human(String(d.role ?? ''))
  if (event.eventType === 'invite_created') return String(d.country ?? '')
  if (event.eventType === 'invite_sent') return d.emailSent ? 'Email sent' : 'Recorded; email switched off'
  if (d.originalFilename) return String(d.originalFilename)
  return ''
}

export function Activity() {
  const [eventType, setEventType] = useState('')
  const { data, error } = useLoad<{ events: AuditEvent[] }>(`/api/admin/audit${eventType ? `?eventType=${eventType}` : ''}`)
  return (
    <Panel id="activity" title="Activity log" intro="Who changed what, and when. The latest 300 entries.">
      <div className="reg-filter-bar">
        <FilterField id="activity-type" label="Show">
          <select id="activity-type" className="reg-control reg-control-compact" value={eventType} onChange={(e) => setEventType(e.target.value)}>
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
              <td>{when(e.createdAt)}</td>
              <td>{e.actorName ?? <span className="reg-muted">Account since removed</span>}{e.actorRole && <small>{roleLabel[e.actorRole as Role] ?? human(e.actorRole)}</small>}</td>
              <td>{eventText[e.eventType] ?? human(e.eventType)}</td>
              <td>{e.countryTerritory ?? '—'}</td>
              <td>{summary(e) || '—'}</td>
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
    </Panel>
  )
}

type EmailRow = { id: string; recipientEmail: string; purpose: string; status: string; errorMessage: string | null; createdAt: string }

export function EmailLog() {
  const { data, error } = useLoad<{ deliveries: EmailRow[] }>('/api/admin/email-deliveries')
  return (
    <Panel id="email" title="Email log" intro="Every email the system tried to send. “Queued” means no email provider is switched on yet, so it was recorded but not sent.">
      <Problem message={error} />
      {data && <TableWrap label="Email log">
        <thead><tr><th scope="col">When</th><th scope="col">To</th><th scope="col">Purpose</th><th scope="col">Status</th></tr></thead>
        <tbody>{data.deliveries.map((d) => (
          <tr key={d.id}><td>{when(d.createdAt)}</td><td>{d.recipientEmail}</td><td>{human(d.purpose)}</td><td>{human(d.status)}{d.errorMessage && <small>{d.errorMessage}</small>}</td></tr>
        ))}</tbody>
      </TableWrap>}
    </Panel>
  )
}
