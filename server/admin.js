// Staff back office: dashboards, payment review, invitation codes, people status, exports, activity log,
// organiser settings and staff accounts. Who may call what is listed in docs/ROLES.md.
import crypto from 'node:crypto'
import { HttpError, ROLES, filterMember, hashPassword, requireRole } from './auth.js'
import { buildInviteEmail, buildPaymentConfirmedEmail, retryEmail, sendEmail } from './email.js'
import { backProblem } from './badge-pdf.js'
import { sendBadgesIfSettled } from './badges.js'
import {
  calculateFees, cleanBadgeBack, cleanBadgeSettings, cleanFees, cleanGuardianConsent, cleanInvoice, defaultFeeCategory, delegationFees, feeCategories,
  ageOn, loadSettings, needsGuardianConsent, singleRoomCount,
} from './fees.js'

// The example on the Fees settings and the sample invoice: an accredited country with two teams, one observer and one single room.
const exampleFees = (fees) => calculateFees(fees, { numberOfTeams: 2, numberOfObservers: 1, category: 'accredited', singleRooms: 1 })
import { invoicePdf } from './invoice-pdf.js'
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

/** "2027-07-21 14:05:09": Bangkok time, which spreadsheets read as a date and time. */
const bangkokTime = (date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ')

function csvCell(value) {
  let text = value === null || value === undefined ? '' : value instanceof Date ? bangkokTime(value) : typeof value === 'boolean' ? (value ? 'yes' : 'no')
    : Array.isArray(value) ? value.join('; ') : String(value)
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
    const [registration, payment, travel, people, proofQueue, invites, unsent, emails, all] = await Promise.all([
      query('SELECT registration_status AS status, count(*)::int AS count FROM delegations GROUP BY 1 ORDER BY 1'),
      query('SELECT payment_status AS status, count(*)::int AS count FROM delegations GROUP BY 1 ORDER BY 1'),
      query('SELECT travel_status AS status, count(*)::int AS count FROM delegations GROUP BY 1 ORDER BY 1'),
      query('SELECT role AS status, count(*)::int AS count FROM members GROUP BY 1 ORDER BY 1'),
      query(`SELECT count(*)::int AS count FROM payments WHERE status = 'awaiting_review'`),
      query('SELECT status, count(*)::int AS count FROM invite_codes GROUP BY 1 ORDER BY 1'),
      query(`SELECT count(*)::int AS count FROM invite_codes WHERE status = 'active' AND sent_at IS NULL`),
      // Emails kept for retrying that gave up; the email log can try them again.
      query(`SELECT count(*)::int AS count FROM email_deliveries WHERE status = 'failed' AND message IS NOT NULL`),
      peopleRows(),
    ])
    const stages = STAGES.map((stage) => ({ status: stage, count: all.filter((p) => p.stage === stage).length }))
    res.json({
      registration: registration.rows, payment: payment.rows, travel: travel.rows, people: people.rows, invites: invites.rows,
      stages, proofsWaiting: proofQueue.rows[0].count, invitesNotSent: unsent.rows[0].count, emailsFailed: emails.rows[0].count,
    })
  }))

  app.get('/api/admin/delegations', ...signedIn, requireRole('registration_admin', 'finance_admin', 'welfare_staff'), asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT d.id, d.country_territory, d.primary_team_leader_name, d.team_leader_email, d.number_of_teams, d.number_of_observers,
         d.fee_category, d.registration_status, d.payment_status, d.travel_status, d.submitted_at,
         (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id) AS people
       FROM delegations d ORDER BY d.country_territory`,
    )
    res.json({ delegations: camelizeRows(result.rows) })
  }))

  /* Payments ------------------------------------------------------- */

  app.get('/api/admin/payments', ...signedIn, requireRole('finance_admin', 'registration_admin'), asyncHandler(async (req, res) => {
    const status = optionalString(req.query.status)
    const result = await query(
      `SELECT p.*, d.country_territory, d.primary_team_leader_name, d.team_leader_email, d.number_of_teams, d.number_of_observers, d.fee_category, d.single_rooms,
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
    // Awaited so Cloud Run does not slow it down after the response. A failed send is kept and tried again later.
    await sendEmail({ pool: requireDb(), to: d.team_leader_email, subject, html, purpose: 'payment_confirmed', delegationId: approved.delegation_id, retry: true })
      .catch((e) => console.error(e.message))
    await sendBadgesIfSettled(approved.delegation_id).catch((e) => console.error(e.message))
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
    // The Team Leaders' room and welfare requests (Rooms and welfare), one per country.
    const requests = await query(`SELECT country_territory, welfare_note FROM delegations WHERE coalesce(trim(welfare_note), '') <> '' ORDER BY country_territory`)
    res.json({ people: camelizeRows(result.rows.map((m) => filterMember(m, req.user.role))), requests: camelizeRows(requests.rows) })
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
      // Previous IOL hosts are recognised by name; a code for a country that is not accredited is chosen by hand.
      const category = feeCategories.includes(item.feeCategory) ? item.feeCategory : defaultFeeCategory(country)
      return { country, organisation: optionalString(item.accreditedOrganisation), email, category }
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
            `INSERT INTO invite_codes (code, country_territory, accredited_organisation, contact_email, status, created_by_account_id, fee_category, max_teams)
             VALUES ($1, $2, $3, $4, 'active', $5, $6, $7) ON CONFLICT (code) DO NOTHING RETURNING *`,
            [newInviteCode(row.country), row.country, row.organisation, row.email, req.user.id, row.category, row.category === 'non_accredited' ? 1 : 2],
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
    // The fee rate can change after the code is used: it moves to the country's registration, and an invoice not
    // paid yet is worked out again.
    if ('feeCategory' in req.body) {
      const category = req.body.feeCategory
      if (!feeCategories.includes(category)) throw new HttpError(400, 'Choose a fee rate.')
      const result = await withTransaction(async (client) => {
        const row = (await client.query(`UPDATE invite_codes SET fee_category = $1, max_teams = $2, updated_at = now() WHERE id = $3 RETURNING *`, [category, category === 'non_accredited' ? 1 : 2, invite.id])).rows[0]
        const d = (await client.query('SELECT * FROM delegations WHERE invite_code_id = $1 FOR UPDATE', [invite.id])).rows[0]
        if (d) {
          if (category === 'non_accredited' && d.number_of_teams > 1) throw new HttpError(409, `${d.country_territory} has registered two teams; a country that is not accredited can register one. Ask the Team Leader to change it first.`)
          const updated = (await client.query('UPDATE delegations SET fee_category = $1, updated_at = now() WHERE id = $2 RETURNING *', [category, d.id])).rows[0]
          const { fees } = await loadSettings(client)
          const open = (await client.query(`SELECT id, fee_tier FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_proof', 'rejected')`, [d.id])).rows
          for (const p of open) await client.query('UPDATE payments SET amount_due = $1, updated_at = now() WHERE id = $2', [delegationFees(fees, updated, p.fee_tier).total, p.id])
        }
        await insertAudit(client, { actorAccountId: req.user.id, delegationId: d?.id ?? null, eventType: 'invite_fee_rate_changed', entityType: 'invite_code', entityId: invite.id, details: { feeCategory: category } })
        return row
      })
      return res.json({ invite: camelizeRow(result) })
    }
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

  // One CSV per job, each with one row per thing (person, country, invoice, trip, scan) and plain values, so it can be
  // filtered, cleaned or charted as it is: dates as YYYY-MM-DD, times in Bangkok time, yes/no, codes rather than prose.
  // Every staff role can download every file (the organisers' call, 30 Oct 2026); each download is in the activity log.
  const memberOrder = `CASE m.role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 ELSE 2 END`
  const singleRoom = (row) => (row.role === 'contestant' ? '' : row.room_type_preference === 'single' ? 'yes' : row.room_type_preference ? 'no' : '')
  const singleRoomTotal = (row) => singleRoomCount(row.single_rooms)
  const peopleBase = `SELECT m.*, d.country_territory, d.fee_category, d.declared_arrival_date, d.declared_departure_date, d.welfare_note, t.name AS team_name,
      t.contest_language AS team_contest_language
    FROM members m JOIN delegations d ON d.id = m.delegation_id LEFT JOIN teams t ON t.id = m.team_id`

  const exportsByKind = {
    people: {
      columns: [['country_territory', 'Country'], ['team_name', 'Team'], ['role', 'Role'], ['display_name', 'Display name'], ['badge_name', 'Badge name'],
        ['official_name', 'Official name'], ['passport_name', 'Passport name'], ['passport_number', 'Passport number'], ['passport_nationality', 'Nationality'],
        ['date_of_birth', 'Date of birth'], ['gender_for_room_allocation', 'Gender (rooming)'], ['exam_language', 'Exam language'], ['tshirt_size', 'T-shirt'],
        ['polo_size', 'Polo'], ['email', 'Email'], ['single_room', 'Single room'], ['food_allergy_notes', 'Food and allergies'],
        ['medical_accessibility_notes', 'Medical or accessibility'], ['emergency_contact', 'Emergency contact'], ['needs_guardian_consent', 'Needs guardian consent'],
        ['has_guardian_consent', 'Guardian consent uploaded'], ['stage', 'Status'], ['missing_details', 'Missing details']],
      rows: async () => (await peopleRows()).map((row) => ({ ...row, single_room: singleRoom(row) })),
    },
    // Names and progress only: what Finance and the check-in desk see in People.
    people_status: {
      columns: [['country_territory', 'Country'], ['team_name', 'Team'], ['role', 'Role'], ['display_name', 'Display name'], ['badge_name', 'Badge name'],
        ['stage', 'Status'], ['badge_status', 'Badge'], ['checked_in_at', 'First checked in at']],
      rows: peopleRows,
    },
    delegations: {
      columns: [['country_territory', 'Country'], ['accredited_organisation', 'Organisation'], ['fee_category', 'Fee rate'], ['primary_team_leader_name', 'Team Leader'],
        ['team_leader_email', 'Team Leader email'], ['mobile_whatsapp', 'Team Leader phone'], ['number_of_teams', 'Teams'], ['number_of_observers', 'Observers'],
        ['single_room_total', 'Single rooms'], ['people', 'People entered'], ['registration_status', 'Registration'], ['payment_status', 'Payment'], ['travel_status', 'Travel'],
        ['declared_arrival_date', 'Arrival'], ['declared_departure_date', 'Departure'], ['stay_window_note', 'Why extra nights'], ['welfare_note', 'Room and welfare requests'],
        ['submitted_at', 'Submitted at']],
      rows: async () => (await query(`SELECT d.*, (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id) AS people FROM delegations d ORDER BY d.country_territory`))
        .rows.map((row) => ({ ...row, single_room_total: singleRoomTotal(row) })),
    },
    // Numbers only, no names or contacts: for committee members charting progress.
    summary: {
      columns: [['country_territory', 'Country'], ['fee_category', 'Fee rate'], ['number_of_teams', 'Teams'], ['number_of_observers', 'Observers declared'],
        ['single_room_total', 'Single rooms'], ['contestants', 'Contestants entered'], ['team_leaders', 'Team Leaders entered'], ['observers', 'Observers entered'],
        ['registration_status', 'Registration'], ['payment_status', 'Payment'], ['travel_status', 'Travel'], ['amount_due', 'Amount due (USD)'],
        ['badges_issued', 'Badges issued'], ['checked_in', 'People checked in'], ['declared_arrival_date', 'Arrival'], ['declared_departure_date', 'Departure']],
      rows: async () => (await query(
        `SELECT d.*,
           (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id AND m.role = 'contestant') AS contestants,
           (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id AND m.role = 'team_leader') AS team_leaders,
           (SELECT count(*)::int FROM members m WHERE m.delegation_id = d.id AND m.role = 'observer') AS observers,
           (SELECT p.amount_due FROM payments p WHERE p.delegation_id = d.id ORDER BY p.created_at DESC LIMIT 1) AS amount_due,
           (SELECT count(*)::int FROM badge_credentials bc JOIN members m ON m.id = bc.member_id WHERE m.delegation_id = d.id AND bc.status = 'active') AS badges_issued,
           (SELECT count(DISTINCT ce.member_id)::int FROM check_in_events ce JOIN members m ON m.id = ce.member_id WHERE m.delegation_id = d.id AND ce.result = 'accepted') AS checked_in
         FROM delegations d ORDER BY d.country_territory`,
      )).rows.map((row) => ({ ...row, single_room_total: singleRoomTotal(row) })),
    },
    payments: {
      columns: [['country_territory', 'Country'], ['fee_category', 'Fee rate'], ['invoice_number', 'Invoice number'], ['payment_reference', 'Payment reference'], ['receipt_number', 'Receipt number'],
        ['status', 'Status'], ['amount_due', 'Amount'], ['currency', 'Currency'], ['fee_tier', 'Fee tier'], ['invoice_count', 'Invoices'], ['invoice_recipient_name', 'Invoice recipient'],
        ['invoice_recipient_tin', 'Recipient TIN'], ['invoice_recipient_address', 'Invoice address'], ['review_note', 'Review note'], ['reviewed_by_name', 'Reviewed by'],
        ['reviewed_at', 'Reviewed at'], ['created_at', 'Invoice saved at'], ['updated_at', 'Last change']],
      rows: async () => (await query(
        `SELECT p.*, d.country_territory, d.fee_category, r.full_name AS reviewed_by_name FROM payments p JOIN delegations d ON d.id = p.delegation_id
         LEFT JOIN accounts r ON r.id = p.reviewed_by_account_id ORDER BY d.country_territory, p.created_at`,
      )).rows,
    },
    // One row per invoice: a split payment has one row for each payer and amount.
    invoices: {
      columns: [['country_territory', 'Country'], ['invoice', 'Invoice number'], ['part', 'Part'], ['payer', 'Payer'], ['payer_tin', 'Payer TIN'], ['payer_address', 'Payer address'],
        ['amount', 'Amount'], ['currency', 'Currency'], ['payment_reference', 'Payment reference'], ['status', 'Payment status'], ['fee_tier', 'Fee tier'], ['due_date', 'Due date']],
      rows: async () => {
        const { fees } = await loadSettings(requireDb())
        const payments = (await query(`SELECT p.*, d.country_territory FROM payments p JOIN delegations d ON d.id = p.delegation_id ORDER BY d.country_territory, p.created_at`)).rows
        return payments.flatMap((p) => {
          const due = p.fee_tier === 'early_bird' ? fees.earlyBirdEnds : fees.registrationEnds
          const base = { country_territory: p.country_territory, currency: p.currency, payment_reference: p.payment_reference, status: p.status, fee_tier: p.fee_tier, due_date: due }
          const parts = p.invoice_splits?.length ? p.invoice_splits : [{ recipientName: p.invoice_recipient_name, recipientTin: p.invoice_recipient_tin, recipientAddress: p.invoice_recipient_address, amount: p.amount_due }]
          return parts.map((part, i) => ({
            ...base, invoice: parts.length > 1 ? `${p.invoice_number}-${i + 1}` : p.invoice_number, part: `${i + 1} of ${parts.length}`,
            payer: part.recipientName, payer_tin: part.recipientTin, payer_address: part.recipientAddress, amount: Number(part.amount).toFixed(2),
          }))
        })
      },
    },
    travel: {
      columns: [['country_territory', 'Country'], ['direction', 'Direction'], ['local_date', 'Date'], ['local_time', 'Time'], ['travel_point', 'Arrival or departure point'],
        ['flight_service_number', 'Flight or service'], ['terminal', 'Terminal'], ['people_count', 'Number of people'], ['people', 'People']],
      rows: async () => (await query(
        `SELECT tr.*, d.country_territory, COALESCE(array_agg(m.display_name ORDER BY m.display_name) FILTER (WHERE m.id IS NOT NULL), '{}') AS people,
           count(m.id)::int AS people_count
         FROM travel_records tr JOIN delegations d ON d.id = tr.delegation_id
         LEFT JOIN travel_record_people trp ON trp.travel_record_id = tr.id LEFT JOIN members m ON m.id = trp.member_id
         GROUP BY tr.id, d.country_territory ORDER BY tr.local_date NULLS LAST, tr.local_time NULLS LAST, d.country_territory`,
      )).rows,
    },
    checkins: {
      columns: [['scanned_at', 'Scanned at'], ['checkpoint', 'Checkpoint'], ['result', 'Result'], ['display_name', 'Person'], ['role', 'Role'], ['country_territory', 'Country or assignment'], ['scanned_by', 'Scanned by']],
      // Delegation members and event staff (staff, guides, volunteers, guests) alike.
      rows: async () => (await query(
        `SELECT ce.*, COALESCE(m.display_name, s.full_name) AS display_name, COALESCE(m.role, s.category) AS role,
           COALESCE(d.country_territory, s.assignment) AS country_territory, a.full_name AS scanned_by
         FROM check_in_events ce LEFT JOIN members m ON m.id = ce.member_id LEFT JOIN delegations d ON d.id = m.delegation_id
         LEFT JOIN event_staff s ON s.id = ce.staff_id LEFT JOIN accounts a ON a.id = ce.scanned_by_account_id ORDER BY ce.scanned_at DESC`,
      )).rows,
    },
    welfare: {
      columns: [['country_territory', 'Country'], ['display_name', 'Person'], ['role', 'Role'], ['team_name', 'Team'], ['food_allergy_notes', 'Food and allergies'],
        ['medical_accessibility_notes', 'Medical or accessibility'], ['emergency_contact', 'Emergency contact']],
      rows: async () => (await query(`${peopleBase} ORDER BY d.country_territory, ${memberOrder}, m.display_name`)).rows,
    },
    // Who sleeps where: for the accommodation and welfare teams planning rooms.
    rooming: {
      columns: [['country_territory', 'Country'], ['display_name', 'Person'], ['role', 'Role'], ['team_name', 'Team'], ['gender_for_room_allocation', 'Gender (rooming)'],
        ['single_room', 'Single room'], ['under_18', 'Under 18 at the event'], ['welfare_note', 'Room and welfare requests (country)'],
        ['declared_arrival_date', 'First night'], ['declared_departure_date', 'Leaves on']],
      rows: async () => {
        const { guardianConsent } = await loadSettings(requireDb())
        return (await query(`${peopleBase} ORDER BY d.country_territory, ${memberOrder}, m.gender_for_room_allocation, m.display_name`)).rows.map((row) => ({
          ...row, single_room: singleRoom(row),
          under_18: row.date_of_birth ? (ageOn(row.date_of_birth, guardianConsent.referenceDate) < 18 ? 'yes' : 'no') : '',
        }))
      },
    },
    // Contestants and their working languages, for the Problem Committee and the results team.
    contestants: {
      columns: [['country_territory', 'Country'], ['team_name', 'Team'], ['display_name', 'Display name'], ['official_name', 'Official name'],
        ['exam_language', 'Individual contest language'], ['team_contest_language', 'Team contest language']],
      rows: async () => (await query(`${peopleBase} WHERE m.role = 'contestant' ORDER BY d.country_territory, t.name NULLS LAST, m.display_name`)).rows,
    },
  }

  app.get('/api/admin/exports', ...signedIn, requireRole(...STAFF_ROLES), (_req, res) => {
    res.json({ kinds: Object.keys(exportsByKind) })
  })

  app.get('/api/admin/exports/:kind', ...signedIn, requireRole(...STAFF_ROLES), asyncHandler(async (req, res) => {
    const spec = exportsByKind[req.params.kind]
    if (!spec) throw new HttpError(404, 'Unknown export.')
    const rows = await spec.rows()
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'export_downloaded', entityType: 'export', details: { kind: req.params.kind, rows: rows.length } })
    sendCsv(res, req.params.kind, spec.columns, rows)
  }))

  /* Activity log --------------------------------------------------- */

  /** ?limit and ?offset for the logs: 50 a page unless asked for fewer (or up to `max`). */
  const page = (q, max) => ({
    limit: Math.min(max, Math.max(1, Number.parseInt(q.limit, 10) || 50)),
    offset: Math.max(0, Number.parseInt(q.offset, 10) || 0),
  })

  app.get('/api/admin/audit', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const delegationId = optionalString(req.query.delegationId)
    if (delegationId && !/^[0-9a-f-]{36}$/i.test(delegationId)) throw new HttpError(400, 'Unknown delegation.')
    const eventType = optionalString(req.query.eventType)
    // The back-office home shows only the latest few; the Activity log pages through 50 at a time.
    const { limit, offset } = page(req.query, 300)
    const filters = 'WHERE ($1::uuid IS NULL OR e.delegation_id = $1) AND ($2::text IS NULL OR e.event_type = $2)'
    const [result, count] = await Promise.all([
      query(
        `SELECT e.id, e.event_type, e.entity_type, e.entity_id, e.details, e.created_at, e.delegation_id,
           a.full_name AS actor_name, a.email AS actor_email, a.role AS actor_role, d.country_territory
         FROM audit_events e LEFT JOIN accounts a ON a.id = e.actor_account_id LEFT JOIN delegations d ON d.id = e.delegation_id
         ${filters} ORDER BY e.created_at DESC LIMIT $3 OFFSET $4`,
        [delegationId, eventType, limit, offset],
      ),
      query(`SELECT count(*)::int AS total FROM audit_events e ${filters}`, [delegationId, eventType]),
    ])
    res.json({ events: camelizeRows(result.rows), total: count.rows[0].total })
  }))

  // `?show=unsent`: only emails being tried again or given up on.
  const deliveryColumns = `id, recipient_email, purpose, subject, status, error_message, attempts, next_attempt_at, sent_at, created_at,
    (message IS NOT NULL AND status IN ('retrying', 'failed')) AS can_retry`

  app.get('/api/admin/email-deliveries', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const { limit, offset } = page(req.query, 200)
    const filter = req.query.show === 'unsent' ? `WHERE status IN ('retrying', 'failed')` : ''
    const [result, count] = await Promise.all([
      query(`SELECT ${deliveryColumns} FROM email_deliveries ${filter} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      query(`SELECT count(*)::int AS total FROM email_deliveries ${filter}`),
    ])
    res.json({ deliveries: camelizeRows(result.rows), total: count.rows[0].total })
  }))

  // Try again: one more attempt now at an email kept for retrying. Answers with the email as it now stands: sent, to
  // be tried again later, or failed (with the reason).
  app.post('/api/admin/email-deliveries/:deliveryId/retry', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    const id = req.params.deliveryId
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Email not found.')
    // retryEmail is null when there was nothing to attempt, and throws when the attempt failed for good.
    const attempted = await retryEmail(requireDb(), id).then(Boolean, () => true)
    if (!attempted) throw new HttpError(409, 'This email cannot be sent again. It may have gone out already.')
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'email_retried', entityType: 'email', entityId: id })
    res.json({ delivery: camelizeRow((await query(`SELECT ${deliveryColumns} FROM email_deliveries WHERE id = $1`, [id])).rows[0]) })
  }))

  /* Settings ------------------------------------------------------- */

  app.get('/api/admin/settings', ...signedIn, requireRole('finance_admin', 'registration_admin'), asyncHandler(async (_req, res) => {
    const settings = await loadSettings(requireDb())
    // An example invoice so the effect of a change is visible before saving.
    res.json({ ...settings, example: exampleFees(settings.fees) })
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
      `SELECT p.id AS payment_id, d.* FROM payments p JOIN delegations d ON d.id = p.delegation_id WHERE p.status IN ('awaiting_proof', 'rejected')`,
    )).rows
    for (const p of open) {
      const due = delegationFees(fees, p)
      await query('UPDATE payments SET amount_due = $1, fee_tier = $2, updated_at = now() WHERE id = $3', [due.total, due.tier, p.payment_id])
    }
    const settings = await loadSettings(requireDb())
    res.json({ ...settings, example: exampleFees(settings.fees), recalculated: open.length })
  }))

  // Who invoices come from and the bank account they ask for. Saving applies to every invoice from then on,
  // including ones already sent: a Team Leader who downloads theirs again gets the new details.
  app.put('/api/admin/settings/invoice', ...signedIn, requireRole('finance_admin'), asyncHandler(async (req, res) => {
    let invoice
    try { invoice = cleanInvoice(req.body) } catch (error) { throw new HttpError(400, error.message) }
    await saveSetting(req, 'invoice', invoice)
    res.json(await loadSettings(requireDb()))
  }))

  // A sample invoice with the saved settings, so Finance can check the layout before any country has one.
  app.get('/api/admin/settings/invoice-sample', ...signedIn, requireRole('finance_admin', 'registration_admin'), asyncHandler(async (_req, res) => {
    const settings = await loadSettings(requireDb())
    const pdf = await invoicePdf({
      delegation: { country_territory: 'Sampleland', accredited_organisation: 'Sampleland Linguistics Olympiad' },
      payment: {
        invoice_number: 'IOL2027/0', invoice_recipient_name: 'Sampleland Linguistics Olympiad', invoice_recipient_tin: '12-3456789',
        invoice_recipient_address: '1 Example Street, Sample City 10000, Sampleland', invoice_count: 1, payment_reference: 'SAM-IOL2027-0000',
      },
      fees: exampleFees(settings.fees),
      invoice: settings.invoice,
    })
    res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="IOL2027-invoice-sample.pdf"').send(pdf)
  }))

  app.put('/api/admin/settings/guardian-consent', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    let policy
    try { policy = cleanGuardianConsent(req.body) } catch (error) { throw new HttpError(400, error.message) }
    await saveSetting(req, 'guardianConsent', policy)
    res.json(await loadSettings(requireDb()))
  }))

  app.put('/api/admin/settings/badges', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    let badges
    try { badges = cleanBadgeSettings(req.body) } catch (error) { throw new HttpError(400, error.message) }
    await saveSetting(req, 'badges', badges)
    res.json(await loadSettings(requireDb()))
  }))

  // The contacts on the back of every badge. Refused if the badge fonts cannot print it or it does not fit.
  app.put('/api/admin/settings/badge-back', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
    let back
    try { back = cleanBadgeBack(req.body) } catch (error) { throw new HttpError(400, error.message) }
    const problem = backProblem(back.text)
    if (problem) throw new HttpError(400, problem)
    await saveSetting(req, 'badgeBack', back)
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
