// Staff back office: dashboards, payment review, invitation codes, people status, exports, activity log,
// organiser settings and staff accounts. Who may call what is listed in docs/ROLES.md.
import crypto from 'node:crypto'
import { HttpError, ROLES, filterMember, hashPassword, requireRole } from './auth.js'
import { buildInviteEmail, buildPaymentConfirmedEmail, sendEmail } from './email.js'
import { sendBadgesIfSettled } from './badges.js'
import { calculateFees, cleanFees, cleanGuardianConsent, loadSettings, needsGuardianConsent } from './fees.js'
import { issuePasswordCode } from './codes.js'
import {
  asyncHandler, camelizeRow, camelizeRows, insertAudit, isEmail, missingMemberDetails, optionalString, query,
  requireDb, requiredString, portalUrl, withTransaction,
} from './lib.js'

/** Roles an organiser can give out directly. Team Leaders come from invitation codes, participants from their Team Leader. */
const STAFF_ROLES = ROLES.filter((role) => !['team_leader', 'participant'].includes(role))

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value) {
  let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join('; ') : String(value)
  // A cell starting with = + - @ would run as a formula when opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function sendCsv(res, name, columns, rows) {
  const lines = [columns.map(([, header]) => csvCell(header)).join(','), ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(','))]
  res.set('Content-Type', 'text/csv; charset=utf-8')
  res.set('Content-Disposition', `attachment; filename="iol2027-${name}-${new Date().toISOString().slice(0, 10)}.csv"`)
  // The byte-order mark makes Excel read the file as UTF-8, so Thai and accented names survive.
  res.send(`﻿${lines.join('\r\n')}\r\n`)
}

/* ------------------------------------------------------------------ */
/* People status                                                       */
/* ------------------------------------------------------------------ */

const STAGES = ['registered', 'payment_review', 'paid', 'badge_issued', 'checked_in']

function stageOf(row) {
  if (row.checked_in_at) return 'checked_in'
  if (row.badge_status === 'active') return 'badge_issued'
  if (row.payment_status === 'approved') return 'paid'
  if (row.payment_status === 'awaiting_review') return 'payment_review'
  return 'registered'
}

async function peopleRows() {
  const [settings, result] = await Promise.all([
    loadSettings(requireDb()),
    query(
      `SELECT m.*, d.country_territory, d.payment_status, d.registration_status, t.name AS team_name, bc.status AS badge_status,
         (SELECT max(ce.scanned_at) FROM check_in_events ce WHERE ce.member_id = m.id AND ce.result = 'accepted') AS checked_in_at,
         EXISTS (SELECT 1 FROM attachments a WHERE a.member_id = m.id AND a.kind = 'guardian_consent') AS has_guardian_consent
       FROM members m JOIN delegations d ON d.id = m.delegation_id
       LEFT JOIN teams t ON t.id = m.team_id LEFT JOIN badge_credentials bc ON bc.member_id = m.id
       ORDER BY d.country_territory, CASE m.role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 ELSE 2 END, m.display_name`,
    ),
  ])
  return result.rows.map((row) => ({
    ...row,
    stage: stageOf(row),
    missing_details: missingMemberDetails(row),
    needs_guardian_consent: needsGuardianConsent(row, settings.guardianConsent),
  }))
}

/* ------------------------------------------------------------------ */
/* Invitation codes                                                    */
/* ------------------------------------------------------------------ */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I, which are easy to misread

function newInviteCode(country) {
  const letters = country.replace(/\(.*?\)/g, '').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3)
  const suffix = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('')
  return `IOL2027-${letters}-${suffix}`
}

async function sendInvite(invite, actorId) {
  if (invite.status !== 'active') throw new HttpError(409, 'Only active, unused codes can be sent.')
  if (!invite.contact_email) throw new HttpError(400, 'Add a contact email before sending.')
  const { subject, html } = buildInviteEmail({ countryTerritory: invite.country_territory, organisation: invite.accredited_organisation, code: invite.code, portalUrl })
  let emailSent = false
  try {
    emailSent = (await sendEmail({ pool: requireDb(), to: invite.contact_email, subject, html, purpose: 'invite_code' })).configured
  } catch (error) {
    console.error('invite email failed', error.message)
    throw new HttpError(502, 'The invitation email could not be sent. Check the email log and try again.')
  }
  const row = (await query(
    `UPDATE invite_codes SET sent_at = now(), send_count = send_count + 1, updated_at = now() WHERE id = $1 RETURNING *`,
    [invite.id],
  )).rows[0]
  await insertAudit(requireDb(), { actorAccountId: actorId, eventType: 'invite_sent', entityType: 'invite_code', entityId: invite.id, details: { emailSent } })
  return { invite: row, emailSent }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function registerAdminRoutes(app, { signedIn }) {
  /* Overview ------------------------------------------------------- */

  app.get('/api/admin/dashboard', ...signedIn, requireRole('registration_admin', 'finance_admin', 'viewer'), asyncHandler(async (_req, res) => {
    const [registration, payment, travel, people, proofQueue, invites, all] = await Promise.all([
      query('SELECT registration_status AS status, count(*)::int AS count FROM delegations GROUP BY 1 ORDER BY 1'),
      query('SELECT payment_status AS status, count(*)::int AS count FROM delegations GROUP BY 1 ORDER BY 1'),
      query('SELECT travel_status AS status, count(*)::int AS count FROM delegations GROUP BY 1 ORDER BY 1'),
      query('SELECT role AS status, count(*)::int AS count FROM members GROUP BY 1 ORDER BY 1'),
      query(`SELECT count(*)::int AS count FROM payments WHERE status = 'awaiting_review'`),
      query('SELECT status, count(*)::int AS count FROM invite_codes GROUP BY 1 ORDER BY 1'),
      peopleRows(),
    ])
    const stages = STAGES.map((stage) => ({ status: stage, count: all.filter((p) => p.stage === stage).length }))
    res.json({
      registration: registration.rows, payment: payment.rows, travel: travel.rows, people: people.rows, invites: invites.rows,
      stages, proofsWaiting: proofQueue.rows[0].count,
    })
  }))

  app.get('/api/admin/delegations', ...signedIn, requireRole('registration_admin', 'finance_admin', 'welfare_staff'), asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT d.id, d.country_territory, d.primary_team_leader_name, d.team_leader_email, d.number_of_teams, d.number_of_observers,
         d.registration_status, d.payment_status, d.travel_status, d.submitted_at,
         (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id) AS people
       FROM delegations d ORDER BY d.country_territory`,
    )
    res.json({ delegations: camelizeRows(result.rows) })
  }))

  /* Payments ------------------------------------------------------- */

  app.get('/api/admin/payments', ...signedIn, requireRole('finance_admin', 'registration_admin'), asyncHandler(async (req, res) => {
    const status = optionalString(req.query.status)
    const result = await query(
      `SELECT p.*, d.country_territory, d.primary_team_leader_name, d.team_leader_email, d.number_of_teams, d.number_of_observers,
         a.original_filename AS proof_filename, a.mime_type AS proof_mime_type, r.full_name AS reviewed_by_name
       FROM payments p JOIN delegations d ON d.id = p.delegation_id
       LEFT JOIN attachments a ON a.id = p.proof_attachment_id LEFT JOIN accounts r ON r.id = p.reviewed_by_account_id
       WHERE ($1::text IS NULL OR p.status = $1) ORDER BY p.updated_at DESC LIMIT 300`,
      [status],
    )
    res.json({ payments: camelizeRows(result.rows) })
  }))

  app.post('/api/admin/payments/:paymentId/approve', ...signedIn, requireRole('finance_admin'), asyncHandler(async (req, res) => {
    const approved = await withTransaction(async (client) => {
      const payment = (await client.query(
        `UPDATE payments SET status = 'approved', reviewed_at = now(), reviewed_by_account_id = $2, review_note = $3, updated_at = now(),
           receipt_number = COALESCE(receipt_number, 'IOL2027-R-' || lpad(nextval('receipt_number_seq')::text, 4, '0'))
         WHERE id = $1 AND status = 'awaiting_review' RETURNING *`,
        [req.params.paymentId, req.user.id, optionalString(req.body?.note)],
      )).rows[0]
      if (!payment) throw new HttpError(409, 'This payment is not waiting for review.')
      await client.query(`UPDATE delegations SET payment_status = 'approved', updated_at = now() WHERE id = $1`, [payment.delegation_id])
      await insertAudit(client, { actorAccountId: req.user.id, delegationId: payment.delegation_id, eventType: 'payment_approved', entityType: 'payment', entityId: payment.id, details: { receiptNumber: payment.receipt_number } })
      return payment
    })
    const d = (await query('SELECT country_territory, team_leader_email, primary_team_leader_name FROM delegations WHERE id = $1', [approved.delegation_id])).rows[0]
    const { subject, html } = buildPaymentConfirmedEmail({
      countryTerritory: d.country_territory, fullName: d.primary_team_leader_name, paymentReference: approved.payment_reference,
      amountPaid: approved.amount_due, currency: approved.currency || 'USD', receiptNumber: approved.receipt_number,
      travelUrl: `${portalUrl}/?step=travel`, paymentUrl: `${portalUrl}/?step=payment`,
    })
    // Awaited so Cloud Run does not slow it down after the response; a failure is logged, not shown.
    await sendEmail({ pool: requireDb(), to: d.team_leader_email, subject, html, purpose: 'payment_confirmed', delegationId: approved.delegation_id })
      .then(() => sendBadgesIfSettled(approved.delegation_id))
      .catch((e) => console.error(e.message))
    res.json({ payment: camelizeRow(approved) })
  }))

  app.post('/api/admin/payments/:paymentId/reject', ...signedIn, requireRole('finance_admin'), asyncHandler(async (req, res) => {
    const note = requiredString(req.body.note, 'A reason for the Team Leader')
    const rejected = await withTransaction(async (client) => {
      const payment = (await client.query(
        `UPDATE payments SET status = 'rejected', reviewed_at = now(), reviewed_by_account_id = $2, review_note = $3, updated_at = now()
         WHERE id = $1 AND status = 'awaiting_review' RETURNING *`,
        [req.params.paymentId, req.user.id, note],
      )).rows[0]
      if (!payment) throw new HttpError(409, 'This payment is not waiting for review.')
      await client.query(`UPDATE delegations SET payment_status = 'rejected', updated_at = now() WHERE id = $1`, [payment.delegation_id])
      await insertAudit(client, { actorAccountId: req.user.id, delegationId: payment.delegation_id, eventType: 'payment_rejected', entityType: 'payment', entityId: payment.id, details: { note } })
      return payment
    })
    res.json({ payment: camelizeRow(rejected) })
  }))

  /* People --------------------------------------------------------- */

  app.get('/api/admin/people', ...signedIn, requireRole('registration_admin', 'finance_admin', 'checkin_staff'), asyncHandler(async (req, res) => {
    const full = ['registration_admin', 'super_admin'].includes(req.user.role)
    const people = (await peopleRows()).map((row) => ({
      id: row.id, delegationId: row.delegation_id, displayName: row.display_name, badgeName: row.badge_name, role: row.role,
      countryTerritory: row.country_territory, teamName: row.team_name, stage: row.stage, checkedInAt: row.checked_in_at,
      registrationStatus: row.registration_status,
      // What is missing is only useful to (and only shown to) the registration team.
      ...(full ? { missingDetails: row.missing_details, needsGuardianConsent: row.needs_guardian_consent, hasGuardianConsent: row.has_guardian_consent } : {}),
    }))
    res.json({ people, stages: STAGES })
  }))

  app.get('/api/admin/welfare', ...signedIn, requireRole('welfare_staff', 'registration_admin'), asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT m.id, m.display_name, m.role, d.country_territory, m.gender_for_room_allocation, m.food_allergy_notes,
         m.medical_accessibility_notes, m.emergency_contact, m.room_type_preference
       FROM members m JOIN delegations d ON d.id = m.delegation_id ORDER BY d.country_territory, m.display_name`,
    )
    res.json({ people: camelizeRows(result.rows.map((m) => filterMember(m, req.user.role))) })
  }))

  /* Invitation codes ----------------------------------------------- */

  app.get('/api/admin/invites', ...signedIn, requireRole('registration_admin'), asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT i.*, a.email AS used_by_email, d.id AS delegation_id
       FROM invite_codes i LEFT JOIN accounts a ON a.id = i.used_by_account_id LEFT JOIN delegations d ON d.invite_code_id = i.id
       ORDER BY i.country_territory, i.created_at`,
    )
    res.json({ invites: camelizeRows(result.rows) })
  }))

  app.post('/api/admin/invites', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.invites) ? req.body.invites : [req.body]
    if (!list.length || list.length > 100) throw new HttpError(400, 'Add between 1 and 100 countries at a time.')
    const rows = list.map((item, index) => {
      const where = list.length > 1 ? `Line ${index + 1}: ` : ''
      const country = typeof item.countryTerritory === 'string' ? item.countryTerritory.trim() : ''
      if (!country) throw new HttpError(400, `${where}Country or territory is required.`)
      const email = optionalString(item.contactEmail)?.toLowerCase() ?? null
      if (email && !isEmail(email)) throw new HttpError(400, `${where}“${email}” is not an email address.`)
      return { country, organisation: optionalString(item.accreditedOrganisation), email }
    })
    const names = rows.map((r) => r.country.toLowerCase())
    const repeated = names.filter((name, i) => names.indexOf(name) !== i)
    if (repeated.length) throw new HttpError(400, `Listed twice: ${[...new Set(repeated)].join(', ')}.`)
    const created = await withTransaction(async (client) => {
      const taken = (await client.query(`SELECT country_territory FROM invite_codes WHERE status IN ('active', 'used') AND lower(country_territory) = ANY($1)`, [names])).rows
      if (taken.length) throw new HttpError(409, `These already have a code: ${taken.map((t) => t.country_territory).join(', ')}. Revoke the old code first.`)
      const out = []
      for (const row of rows) {
        let inserted
        for (let attempt = 0; !inserted && attempt < 5; attempt++) {
          inserted = (await client.query(
            `INSERT INTO invite_codes (code, country_territory, accredited_organisation, contact_email, status, created_by_account_id)
             VALUES ($1, $2, $3, $4, 'active', $5) ON CONFLICT (code) DO NOTHING RETURNING *`,
            [newInviteCode(row.country), row.country, row.organisation, row.email, req.user.id],
          )).rows[0]
        }
        if (!inserted) throw new HttpError(500, 'Could not create a unique code. Try again.')
        await insertAudit(client, { actorAccountId: req.user.id, eventType: 'invite_created', entityType: 'invite_code', entityId: inserted.id, details: { country: row.country } })
        out.push(inserted)
      }
      return out
    })
    res.status(201).json({ invites: camelizeRows(created) })
  }))

  app.patch('/api/admin/invites/:inviteId', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const invite = (await query('SELECT * FROM invite_codes WHERE id = $1', [req.params.inviteId])).rows[0]
    if (!invite) throw new HttpError(404, 'Invitation code not found.')
    if (invite.status === 'used') throw new HttpError(409, 'This code has been used to create an account and cannot be changed.')
    const status = req.body.status ?? invite.status
    if (!['active', 'revoked'].includes(status)) throw new HttpError(400, 'Status must be active or revoked.')
    if (status === 'active' && invite.status === 'revoked') {
      const other = await query(`SELECT 1 FROM invite_codes WHERE id <> $1 AND status IN ('active', 'used') AND lower(country_territory) = lower($2)`, [invite.id, invite.country_territory])
      if (other.rowCount) throw new HttpError(409, 'This country already has another active or used code.')
    }
    const email = 'contactEmail' in req.body ? optionalString(req.body.contactEmail)?.toLowerCase() ?? null : invite.contact_email
    if (email && !isEmail(email)) throw new HttpError(400, 'Enter a valid contact email.')
    const organisation = 'accreditedOrganisation' in req.body ? optionalString(req.body.accreditedOrganisation) : invite.accredited_organisation
    const row = (await query(
      `UPDATE invite_codes SET status = $1, contact_email = $2, accredited_organisation = $3, updated_at = now() WHERE id = $4 RETURNING *`,
      [status, email, organisation, invite.id],
    )).rows[0]
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: status !== invite.status ? `invite_${status === 'revoked' ? 'revoked' : 'reactivated'}` : 'invite_updated', entityType: 'invite_code', entityId: invite.id })
    res.json({ invite: camelizeRow(row) })
  }))

  app.post('/api/admin/invites/:inviteId/send', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const invite = (await query('SELECT * FROM invite_codes WHERE id = $1', [req.params.inviteId])).rows[0]
    if (!invite) throw new HttpError(404, 'Invitation code not found.')
    const result = await sendInvite(invite, req.user.id)
    res.json({ invite: camelizeRow(result.invite), emailSent: result.emailSent })
  }))

  /* Exports -------------------------------------------------------- */

  const exportsByKind = {
    people: {
      roles: ['registration_admin'],
      columns: [['country_territory', 'Country'], ['team_name', 'Team'], ['role', 'Role'], ['display_name', 'Display name'], ['badge_name', 'Badge name'],
        ['official_name', 'Official name'], ['passport_name', 'Passport name'], ['passport_number', 'Passport number'], ['passport_nationality', 'Nationality'],
        ['date_of_birth', 'Date of birth'], ['gender_for_room_allocation', 'Gender (rooming)'], ['exam_language', 'Exam language'], ['tshirt_size', 'T-shirt'],
        ['polo_size', 'Polo'], ['email', 'Email'], ['room_type_preference', 'Room preference'], ['food_allergy_notes', 'Food and allergies'],
        ['medical_accessibility_notes', 'Medical or accessibility'], ['emergency_contact', 'Emergency contact'], ['stage', 'Status'], ['missing_details', 'Missing details']],
      rows: peopleRows,
    },
    delegations: {
      roles: ['registration_admin', 'finance_admin'],
      columns: [['country_territory', 'Country'], ['accredited_organisation', 'Organisation'], ['primary_team_leader_name', 'Team Leader'], ['team_leader_email', 'Team Leader email'],
        ['number_of_teams', 'Teams'], ['number_of_observers', 'Observers'], ['people', 'People entered'], ['registration_status', 'Registration'], ['payment_status', 'Payment'],
        ['travel_status', 'Travel'], ['declared_arrival_date', 'Arrival'], ['declared_departure_date', 'Departure'], ['submitted_at', 'Submitted at']],
      rows: async () => (await query(`SELECT d.*, (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id) AS people FROM delegations d ORDER BY d.country_territory`)).rows,
    },
    payments: {
      roles: ['finance_admin', 'registration_admin'],
      columns: [['country_territory', 'Country'], ['payment_reference', 'Payment reference'], ['receipt_number', 'Receipt number'], ['status', 'Status'], ['amount_due', 'Amount'],
        ['currency', 'Currency'], ['fee_tier', 'Fee tier'], ['invoice_recipient_name', 'Invoice recipient'], ['invoice_recipient_address', 'Invoice address'],
        ['invoice_count', 'Invoices'], ['invoice_split_note', 'Split'], ['review_note', 'Review note'], ['reviewed_by_name', 'Reviewed by'], ['reviewed_at', 'Reviewed at'], ['updated_at', 'Last change']],
      rows: async () => (await query(
        `SELECT p.*, d.country_territory, r.full_name AS reviewed_by_name FROM payments p JOIN delegations d ON d.id = p.delegation_id
         LEFT JOIN accounts r ON r.id = p.reviewed_by_account_id ORDER BY d.country_territory, p.created_at`,
      )).rows,
    },
    travel: {
      roles: ['registration_admin'],
      columns: [['country_territory', 'Country'], ['direction', 'Direction'], ['local_date', 'Date'], ['local_time', 'Time'], ['travel_point', 'Arrival or departure point'],
        ['flight_service_number', 'Flight or service'], ['terminal', 'Terminal'], ['people', 'People']],
      rows: async () => (await query(
        `SELECT tr.*, d.country_territory, COALESCE(array_agg(m.display_name ORDER BY m.display_name) FILTER (WHERE m.id IS NOT NULL), '{}') AS people
         FROM travel_records tr JOIN delegations d ON d.id = tr.delegation_id
         LEFT JOIN travel_record_people trp ON trp.travel_record_id = tr.id LEFT JOIN members m ON m.id = trp.member_id
         GROUP BY tr.id, d.country_territory ORDER BY tr.local_date NULLS LAST, tr.local_time NULLS LAST, d.country_territory`,
      )).rows,
    },
    checkins: {
      roles: ['registration_admin', 'checkin_staff'],
      columns: [['scanned_at', 'Scanned at'], ['checkpoint', 'Checkpoint'], ['result', 'Result'], ['display_name', 'Person'], ['role', 'Role'], ['country_territory', 'Country'], ['scanned_by', 'Scanned by']],
      rows: async () => (await query(
        `SELECT ce.*, m.display_name, m.role, d.country_territory, a.full_name AS scanned_by
         FROM check_in_events ce JOIN members m ON m.id = ce.member_id JOIN delegations d ON d.id = m.delegation_id
         LEFT JOIN accounts a ON a.id = ce.scanned_by_account_id ORDER BY ce.scanned_at DESC`,
      )).rows,
    },
    welfare: {
      roles: ['welfare_staff', 'registration_admin'],
      columns: [['country_territory', 'Country'], ['display_name', 'Person'], ['role', 'Role'], ['gender_for_room_allocation', 'Gender (rooming)'], ['room_type_preference', 'Room preference'],
        ['food_allergy_notes', 'Food and allergies'], ['medical_accessibility_notes', 'Medical or accessibility'], ['emergency_contact', 'Emergency contact']],
      rows: async () => (await query(
        `SELECT m.*, d.country_territory FROM members m JOIN delegations d ON d.id = m.delegation_id ORDER BY d.country_territory, m.display_name`,
      )).rows,
    },
  }

  app.get('/api/admin/exports', ...signedIn, asyncHandler(async (req, res) => {
    const allowed = Object.entries(exportsByKind).filter(([, e]) => req.user.role === 'super_admin' || e.roles.includes(req.user.role)).map(([kind]) => kind)
    res.json({ kinds: allowed })
  }))

  app.get('/api/admin/exports/:kind', ...signedIn, asyncHandler(async (req, res) => {
    const spec = exportsByKind[req.params.kind]
    if (!spec) throw new HttpError(404, 'Unknown export.')
    if (!(req.user.role === 'super_admin' || spec.roles.includes(req.user.role))) throw new HttpError(403, 'Your role does not allow this.')
    const rows = await spec.rows()
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'export_downloaded', entityType: 'export', details: { kind: req.params.kind, rows: rows.length } })
    sendCsv(res, req.params.kind, spec.columns, rows)
  }))

  /* Activity log --------------------------------------------------- */

  app.get('/api/admin/audit', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const delegationId = optionalString(req.query.delegationId)
    if (delegationId && !/^[0-9a-f-]{36}$/i.test(delegationId)) throw new HttpError(400, 'Unknown delegation.')
    const eventType = optionalString(req.query.eventType)
    const result = await query(
      `SELECT e.id, e.event_type, e.entity_type, e.entity_id, e.details, e.created_at, e.delegation_id,
         a.full_name AS actor_name, a.email AS actor_email, a.role AS actor_role, d.country_territory
       FROM audit_events e LEFT JOIN accounts a ON a.id = e.actor_account_id LEFT JOIN delegations d ON d.id = e.delegation_id
       WHERE ($1::uuid IS NULL OR e.delegation_id = $1) AND ($2::text IS NULL OR e.event_type = $2)
       ORDER BY e.created_at DESC LIMIT 300`,
      [delegationId, eventType],
    )
    res.json({ events: camelizeRows(result.rows) })
  }))

  app.get('/api/admin/email-deliveries', ...signedIn, requireRole('registration_admin'), asyncHandler(async (_req, res) => {
    const result = await query('SELECT id, recipient_email, purpose, status, error_message, sent_at, created_at FROM email_deliveries ORDER BY created_at DESC LIMIT 200')
    res.json({ deliveries: camelizeRows(result.rows) })
  }))

  /* Settings ------------------------------------------------------- */

  app.get('/api/admin/settings', ...signedIn, requireRole('finance_admin', 'registration_admin'), asyncHandler(async (_req, res) => {
    const settings = await loadSettings(requireDb())
    // An example invoice so the effect of a change is visible before saving.
    res.json({ ...settings, example: calculateFees(settings.fees, { numberOfTeams: 2, numberOfObservers: 1 }) })
  }))

  const saveSetting = async (req, key, value) => {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO settings (key, value, updated_by_account_id, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
        [key, value, req.user.id],
      )
      await insertAudit(client, { actorAccountId: req.user.id, eventType: 'settings_updated', entityType: 'settings', details: { key, value } })
    })
  }

  app.put('/api/admin/settings/fees', ...signedIn, requireRole('finance_admin'), asyncHandler(async (req, res) => {
    let fees
    try { fees = cleanFees(req.body) } catch (error) { throw new HttpError(400, error.message) }
    await saveSetting(req, 'fees', fees)
    // Invoices that have not been paid yet follow the new fees; paid or under-review ones keep their amount.
    const open = (await query(
      `SELECT p.id, d.number_of_teams, d.number_of_observers FROM payments p JOIN delegations d ON d.id = p.delegation_id WHERE p.status IN ('awaiting_proof', 'rejected')`,
    )).rows
    for (const p of open) {
      const due = calculateFees(fees, { numberOfTeams: p.number_of_teams, numberOfObservers: p.number_of_observers })
      await query('UPDATE payments SET amount_due = $1, fee_tier = $2, updated_at = now() WHERE id = $3', [due.total, due.tier, p.id])
    }
    const settings = await loadSettings(requireDb())
    res.json({ ...settings, example: calculateFees(settings.fees, { numberOfTeams: 2, numberOfObservers: 1 }), recalculated: open.length })
  }))

  app.put('/api/admin/settings/guardian-consent', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    let policy
    try { policy = cleanGuardianConsent(req.body) } catch (error) { throw new HttpError(400, error.message) }
    await saveSetting(req, 'guardianConsent', policy)
    res.json(await loadSettings(requireDb()))
  }))

  /* Accounts ------------------------------------------------------- */

  app.get('/api/admin/accounts', ...signedIn, requireRole('super_admin'), asyncHandler(async (_req, res) => {
    const result = await query('SELECT id, email, full_name, role, email_verified_at, last_login_at, disabled_at, created_at FROM accounts ORDER BY role, email')
    res.json({ accounts: camelizeRows(result.rows), roles: ROLES, staffRoles: STAFF_ROLES })
  }))

  app.post('/api/admin/accounts', ...signedIn, requireRole('super_admin'), asyncHandler(async (req, res) => {
    const email = requiredString(req.body.email, 'Email').toLowerCase()
    const fullName = requiredString(req.body.fullName, 'Full name')
    const role = requiredString(req.body.role, 'Role')
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.')
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, 'Choose a staff role. Team Leaders sign up with an invitation code.')
    const existing = await query('SELECT 1 FROM accounts WHERE lower(email) = $1', [email])
    if (existing.rowCount) throw new HttpError(409, 'An account with this email already exists.')
    // The random password is never shown to anyone; the person sets their own with the emailed code.
    const account = (await query(
      `INSERT INTO accounts (email, full_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role, created_at`,
      [email, fullName, hashPassword(crypto.randomBytes(32).toString('base64url')), role],
    )).rows[0]
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'account_created', entityType: 'account', entityId: account.id, details: { role } })
    const sent = await issuePasswordCode({ id: account.id, email, fullName }, { setup: true })
    res.status(201).json({ account: camelizeRow(account), ...sent })
  }))

  app.post('/api/admin/accounts/:accountId/setup-code', ...signedIn, requireRole('super_admin'), asyncHandler(async (req, res) => {
    const account = (await query('SELECT id, email, full_name, disabled_at FROM accounts WHERE id = $1', [req.params.accountId])).rows[0]
    if (!account) throw new HttpError(404, 'Account not found.')
    if (account.disabled_at) throw new HttpError(409, 'Enable the account first.')
    res.status(201).json(await issuePasswordCode({ id: account.id, email: account.email, fullName: account.full_name }, { setup: true }))
  }))

  app.patch('/api/admin/accounts/:accountId', ...signedIn, requireRole('super_admin'), asyncHandler(async (req, res) => {
    if (req.params.accountId === req.user.id) throw new HttpError(400, 'You cannot change your own role or disable your own account.')
    const account = (await query('SELECT id, role, disabled_at FROM accounts WHERE id = $1', [req.params.accountId])).rows[0]
    if (!account) throw new HttpError(404, 'Account not found.')
    const role = req.body.role ?? account.role
    if (!ROLES.includes(role)) throw new HttpError(400, 'Unknown role.')
    if (role !== account.role && !STAFF_ROLES.includes(role)) throw new HttpError(400, 'Team Leader and participant accounts are created through registration, not by changing a role.')
    const disabled = 'disabled' in req.body ? Boolean(req.body.disabled) : Boolean(account.disabled_at)
    const result = await query(
      `UPDATE accounts SET role = $1, disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) ELSE NULL END, updated_at = now()
       WHERE id = $3 RETURNING id, email, role, disabled_at`,
      [role, disabled, account.id],
    )
    // New permissions apply straight away: the person signs in again.
    await query('DELETE FROM sessions WHERE account_id = $1', [account.id])
    const events = []
    if (role !== account.role) events.push(['role_changed', { role }])
    if (disabled !== Boolean(account.disabled_at)) events.push([disabled ? 'account_disabled' : 'account_enabled', {}])
    for (const [eventType, details] of events) await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType, entityType: 'account', entityId: account.id, details })
    res.json({ account: camelizeRow(result.rows[0]) })
  }))
}
