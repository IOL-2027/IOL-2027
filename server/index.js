import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import {
  buildProofReceivedEmail,
  buildFinanceAlertEmail,
  buildRegistrationSubmittedEmail,
  sendEmail,
} from './email.js'
import { readUpload, saveUpload } from './storage.js'
import { invoicePdf } from './invoice-pdf.js'
import { badgeQrDataUrl, findBadge, issueBadge, missingTravel, sendBadgesIfSettled } from './badges.js'
import {
  DELEGATION_ADMINS, DELEGATION_READERS, HttpError,
  checkPasswordRules, createSession, destroySession, filterMember, hashPassword, loginBlocked, recordLogin,
  requireAuth, requireRequestHeader, requireRole, requireVerified, sessionMiddleware, verifyPassword,
} from './auth.js'
import { calculateFees, loadSettings, needsGuardianConsent } from './fees.js'
import {
  asyncHandler, buildUpdate, camelizeRow, camelizeRows, hashToken, insertAudit, isEmail, missingMemberDetails,
  exposeDevCodes, optionalNumber, optionalString, pool, query, requireDb, requiredString, portalUrl, withTransaction,
} from './lib.js'
import { issuePasswordCode, issueVerificationCode } from './codes.js'
import { registerAdminRoutes } from './admin.js'
import { registerBadgeRoutes } from './badge-admin.js'

const port = Number(process.env.PORT || process.env.API_PORT || 4000)

const app = express()
app.set('trust proxy', true)
app.disable('x-powered-by')

// The site and API share an origin (Vite proxy locally, Firebase rewrite in the cloud), so CORS is
// only needed when APP_ORIGIN names a different origin.
const corsOrigins = process.env.APP_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)
if (corsOrigins?.length) app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
app.use(sessionMiddleware(requireDb))
app.use(requireRequestHeader)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png'])
    if (allowed.has(file.mimetype)) callback(null, true)
    else callback(new HttpError(400, 'Only PDF, JPG and PNG files are accepted.'))
  },
})

function normalizeRole(role) {
  const value = requiredString(role, 'role').toLowerCase().replaceAll(' ', '_')
  if (!['contestant', 'team_leader', 'observer'].includes(value)) throw new HttpError(400, 'Invalid member role.')
  return value
}

function normalizeDirection(direction) {
  const value = requiredString(direction, 'direction').toLowerCase()
  if (!['arrival', 'departure'].includes(value)) throw new HttpError(400, 'Travel direction must be arrival or departure.')
  return value
}

function normalizeChangeStatus(value) {
  if (!value) return 'open'
  const normalized = String(value).toLowerCase().replaceAll(' ', '_')
  if (!['open', 'submitted_to_loc', 'locked'].includes(normalized)) throw new HttpError(400, 'Invalid travel change status.')
  return normalized
}

/* ------------------------------------------------------------------ */
/* Access control                                                      */
/* ------------------------------------------------------------------ */

/**
 * Throws unless the signed-in user may read (or write) this delegation.
 * Team Leaders reach only their own; other delegations answer 404 so their existence is not revealed.
 */
async function authorizeDelegation(req, delegationId, mode = 'read') {
  const { role, id } = req.user
  if (DELEGATION_ADMINS.includes(role)) return
  if (mode === 'read' && DELEGATION_READERS.includes(role)) return
  if (role === 'team_leader') {
    const owned = await query('SELECT 1 FROM delegations WHERE id = $1 AND account_id = $2', [delegationId, id])
    if (owned.rowCount) return
  }
  throw new HttpError(404, 'Delegation not found.')
}

/** Resolves the delegation that owns a team, member, travel record or attachment. */
async function delegationOf(table, id) {
  const tables = { teams: 'teams', members: 'members', travel: 'travel_records', attachments: 'attachments', payments: 'payments' }
  const result = await query(`SELECT delegation_id FROM ${tables[table]} WHERE id = $1`, [id])
  if (!result.rowCount) throw new HttpError(404, 'Not found.')
  return result.rows[0].delegation_id
}

const delegationAccess = (mode) => asyncHandler(async (req, _res, next) => {
  await authorizeDelegation(req, req.params.delegationId, mode)
  next()
})

const childAccess = (table, param, mode = 'write') => asyncHandler(async (req, _res, next) => {
  req.delegationId = await delegationOf(table, req.params[param])
  await authorizeDelegation(req, req.delegationId, mode)
  next()
})

const signedIn = [requireAuth, requireVerified]

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

app.get('/api/health', asyncHandler(async (_req, res) => {
  if (!pool) return res.status(503).json({ ok: false, database: 'not_configured' })
  const result = await query('SELECT now() AS checked_at')
  res.json({ ok: true, database: 'postgresql', checkedAt: result.rows[0].checked_at })
}))

app.get('/api/registration/options', (_req, res) => {
  res.json({
    memberRoles: ['contestant', 'team_leader', 'observer'],
    teamLimit: [1, 2],
    workingLanguages: ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
    payment: { collection: 'outside_website', transferFeeInstruction: 'OUR', currency: 'USD' },
  })
})

// "ananya@chula.ac.th" becomes "a•••••@chula.ac.th": enough for the code holder to recognise the account.
const maskEmail = (email) => `${email[0]}•••••${email.slice(email.indexOf('@'))}`

app.post('/api/registration/invite/verify', asyncHandler(async (req, res) => {
  const code = requiredString(req.body.code, 'invite code').toUpperCase()
  const invite = (await query(
    `SELECT i.code, i.country_territory, i.accredited_organisation, i.max_teams, i.status, i.used_by_account_id, a.email AS used_by_email
     FROM invite_codes i LEFT JOIN accounts a ON a.id = i.used_by_account_id WHERE i.code = $1`,
    [code],
  )).rows[0]
  // A used code means the Team Leader account already exists (often someone who left before finishing),
  // so the answer sends them to sign in rather than saying the code is wrong.
  if (invite && (invite.status === 'used' || invite.used_by_account_id)) {
    return res.status(409).json({
      error: `This code has already been used to create the Team Leader account for ${invite.country_territory}. Sign in with that account instead.`,
      codeUsed: true, countryTerritory: invite.country_territory, accountHint: invite.used_by_email ? maskEmail(invite.used_by_email) : null,
    })
  }
  if (invite?.status !== 'active') throw new HttpError(404, 'That code was not found. Check the invitation email, or contact the organisers.')
  const { country_territory, accredited_organisation, max_teams } = invite
  res.json({ invite: camelizeRow({ code: invite.code, country_territory, accredited_organisation, max_teams }) })
}))

/* ------------------------------------------------------------------ */
/* Accounts and sessions                                               */
/* ------------------------------------------------------------------ */

async function currentUserPayload(user) {
  if (!user) return { user: null }
  const payload = { user: { ...user } }
  if (user.role === 'team_leader') {
    const d = await query('SELECT id, country_territory FROM delegations WHERE account_id = $1 ORDER BY created_at LIMIT 1', [user.id])
    payload.user.delegationId = d.rows[0]?.id ?? null
    payload.user.country = d.rows[0]?.country_territory ?? null
  }
  return payload
}

async function userById(id) {
  const row = (await query('SELECT id, email, full_name, role, member_id, email_verified_at FROM accounts WHERE id = $1', [id])).rows[0]
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, memberId: row.member_id, emailVerified: Boolean(row.email_verified_at) }
}

app.get('/api/auth/me', asyncHandler(async (req, res) => {
  res.json(await currentUserPayload(req.user))
}))

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const email = requiredString(req.body.email, 'Email').toLowerCase()
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (await loginBlocked(requireDb(), email)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes, or reset your password.')
  const result = await query('SELECT id, password_hash, disabled_at FROM accounts WHERE lower(email) = $1', [email])
  const account = result.rows[0]
  const ok = Boolean(account && !account.disabled_at && verifyPassword(password, account.password_hash))
  await recordLogin(requireDb(), email, req.ip, ok)
  if (!ok) throw new HttpError(401, 'That email and password do not match an account.')
  await createSession(requireDb(), req, res, account.id)
  res.json(await currentUserPayload(await userById(account.id)))
}))

app.post('/api/auth/logout', asyncHandler(async (req, res) => {
  await destroySession(requireDb(), req, res)
  res.status(204).end()
}))

app.post('/api/auth/password-reset/request', asyncHandler(async (req, res) => {
  const email = requiredString(req.body.email, 'Email').toLowerCase()
  const account = (await query('SELECT id, email, full_name, disabled_at FROM accounts WHERE lower(email) = $1', [email])).rows[0]
  let sent = {}
  if (account && !account.disabled_at) {
    const recent = await query(`SELECT 1 FROM password_reset_tokens WHERE account_id = $1 AND created_at > now() - interval '60 seconds'`, [account.id])
    if (!recent.rowCount) sent = await issuePasswordCode({ id: account.id, email: account.email, fullName: account.full_name })
  }
  // The same answer whether or not the account exists, so this form cannot be used to discover accounts.
  res.status(202).json({ ok: true, developmentCode: sent.developmentCode })
}))

app.post('/api/auth/password-reset/confirm', asyncHandler(async (req, res) => {
  const email = requiredString(req.body.email, 'Email').toLowerCase()
  const code = requiredString(req.body.code, 'Code')
  checkPasswordRules(req.body.password)
  // A wrong guess must still be recorded, so the outcome is decided inside the transaction and thrown after it commits.
  const outcome = await withTransaction(async (client) => {
    const account = (await client.query('SELECT id, disabled_at FROM accounts WHERE lower(email) = $1', [email])).rows[0]
    if (!account || account.disabled_at) return null
    const token = (await client.query(
      `SELECT id, token_hash FROM password_reset_tokens
       WHERE account_id = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [account.id],
    )).rows[0]
    if (!token) return null
    const given = Buffer.from(hashToken(code), 'hex')
    const stored = Buffer.from(token.token_hash, 'hex')
    if (!(given.length === stored.length && crypto.timingSafeEqual(given, stored))) {
      // Five wrong guesses retire the code, so it cannot be found by trying every number.
      await client.query(`UPDATE password_reset_tokens SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= 5 THEN now() END WHERE id = $1`, [token.id])
      return null
    }
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE account_id = $1 AND used_at IS NULL', [account.id])
    // Using the emailed code proves the address, so it also counts as email verification.
    await client.query('UPDATE accounts SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $2', [hashPassword(req.body.password), account.id])
    await client.query('DELETE FROM sessions WHERE account_id = $1', [account.id])
    await client.query('DELETE FROM login_attempts WHERE lower(email) = $1 AND NOT succeeded', [email])
    await insertAudit(client, { actorAccountId: account.id, eventType: 'password_reset', entityType: 'account', entityId: account.id })
    return account.id
  })
  if (!outcome) throw new HttpError(400, 'That code is wrong or has expired. Ask for a new one.')
  await createSession(requireDb(), req, res, outcome)
  res.json(await currentUserPayload(await userById(outcome)))
}))

app.post('/api/registration/team-leader-account', asyncHandler(async (req, res) => {
  const inviteCode = requiredString(req.body.inviteCode, 'Invitation code').toUpperCase()
  const email = requiredString(req.body.email, 'Email').toLowerCase()
  const fullName = requiredString(req.body.fullName, 'Full name')
  if (!isEmail(email)) throw new HttpError(400, 'Enter an email address like name@example.org.')
  checkPasswordRules(req.body.password)

  const created = await withTransaction(async (client) => {
    const invite = (await client.query(
      `SELECT * FROM invite_codes WHERE code = $1 AND status = 'active' AND used_by_account_id IS NULL FOR UPDATE`,
      [inviteCode],
    )).rows[0]
    if (!invite) throw new HttpError(404, 'That code was not found or has already been used.')
    // The reusable test code (test servers only) replaces the account made with it last time, so the
    // sign-up can be tried again and again, with the same email address if wanted.
    const reuse = invite.reusable && exposeDevCodes
    if (reuse) {
      for (const previous of (await client.query('SELECT id, account_id FROM delegations WHERE invite_code_id = $1', [invite.id])).rows) {
        await client.query('DELETE FROM delegations WHERE id = $1', [previous.id])
        await client.query(`DELETE FROM accounts WHERE id = $1 AND role = 'team_leader'`, [previous.account_id])
      }
    }
    // An existing account is never modified here: that would let anyone holding a code reset its password.
    const existing = await client.query('SELECT 1 FROM accounts WHERE lower(email) = $1', [email])
    if (existing.rowCount) throw new HttpError(409, 'An account with this email already exists. Sign in instead.')

    const account = (await client.query(
      `INSERT INTO accounts (email, full_name, password_hash, role) VALUES ($1, $2, $3, 'team_leader') RETURNING *`,
      [email, fullName, hashPassword(req.body.password)],
    )).rows[0]
    const delegation = (await client.query(
      `INSERT INTO delegations (account_id, invite_code_id, country_territory, accredited_organisation,
         primary_team_leader_name, team_leader_email, registration_contact_email, number_of_teams, number_of_contestants, number_of_observers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 4, 0) RETURNING *`,
      [account.id, invite.id, invite.country_territory, invite.accredited_organisation, fullName, email, invite.contact_email],
    )).rows[0]
    await client.query(
      `INSERT INTO members (delegation_id, role, display_name, badge_name, official_name, email)
       VALUES ($1, 'team_leader', $2, $2, $2, $3)`,
      [delegation.id, fullName, email],
    )
    await ensureTeams(client, delegation)
    if (!reuse) await client.query(`UPDATE invite_codes SET status = 'used', used_at = now(), used_by_account_id = $1, updated_at = now() WHERE id = $2`, [account.id, invite.id])
    await insertAudit(client, { actorAccountId: account.id, delegationId: delegation.id, eventType: 'team_leader_account_created', entityType: 'delegation', entityId: delegation.id, details: { inviteCode } })
    return { account, delegation }
  })

  await createSession(requireDb(), req, res, created.account.id)
  const verification = await issueVerificationCode({ id: created.account.id, email, fullName, countryTerritory: created.delegation.country_territory })
  res.status(201).json({
    ...(await currentUserPayload({ id: created.account.id, email, fullName, role: 'team_leader', memberId: null, emailVerified: false })),
    ...verification,
  })
}))

app.post('/api/auth/verify-email/request', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.emailVerified) return res.json({ alreadyVerified: true })
  const recent = await query(`SELECT 1 FROM email_verification_tokens WHERE account_id = $1 AND created_at > now() - interval '60 seconds'`, [req.user.id])
  if (recent.rowCount) throw new HttpError(429, 'A code was sent less than a minute ago. Please wait before asking for another.')
  const d = await query('SELECT country_territory FROM delegations WHERE account_id = $1 LIMIT 1', [req.user.id])
  res.status(201).json(await issueVerificationCode({ ...req.user, countryTerritory: d.rows[0]?.country_territory }))
}))

app.post('/api/auth/verify-email', requireAuth, asyncHandler(async (req, res) => {
  const code = requiredString(req.body.code, 'Verification code')
  await withTransaction(async (client) => {
    const token = (await client.query(
      `SELECT id FROM email_verification_tokens
       WHERE account_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [req.user.id, hashToken(code)],
    )).rows[0]
    if (!token) throw new HttpError(400, 'That code is wrong or has expired. Ask for a new one.')
    await client.query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [token.id])
    await client.query('UPDATE accounts SET email_verified_at = now(), updated_at = now() WHERE id = $1', [req.user.id])
  })
  res.json(await currentUserPayload({ ...req.user, emailVerified: true }))
}))

/* ------------------------------------------------------------------ */
/* Delegation (Team Leader, or staff by role)                          */
/* ------------------------------------------------------------------ */

const TEAM_LETTERS = ['A', 'B']

/** Keeps the team rows in step with number_of_teams: adds missing teams, removes unused extra ones. */
async function ensureTeams(db, delegation) {
  const want = Math.min(Math.max(Number(delegation.number_of_teams) || 1, 1), 2)
  const existing = (await db.query('SELECT * FROM teams WHERE delegation_id = $1 ORDER BY code', [delegation.id])).rows
  const prefix = delegation.country_territory.replace(/\s*\(TEST\)\s*/i, '').trim()
  const short = prefix.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
  for (let i = existing.length; i < want; i++) {
    await db.query(
      `INSERT INTO teams (delegation_id, name, code, status) VALUES ($1, $2, $3, 'draft') ON CONFLICT DO NOTHING`,
      [delegation.id, `${prefix} ${TEAM_LETTERS[i]}`, `${short}-${TEAM_LETTERS[i]}`],
    )
  }
  for (const team of existing.slice(want)) {
    const used = await db.query('SELECT 1 FROM members WHERE team_id = $1 LIMIT 1', [team.id])
    if (!used.rowCount) await db.query('DELETE FROM teams WHERE id = $1', [team.id])
  }
}

function openPaymentQuery(db, delegationId) {
  return db.query(
    `SELECT * FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_proof', 'rejected', 'awaiting_review')
     ORDER BY created_at DESC LIMIT 1`,
    [delegationId],
  )
}

app.get('/api/registration/delegations/:delegationId', ...signedIn, delegationAccess('read'), asyncHandler(async (req, res) => {
  const id = req.params.delegationId
  const delegationResult = await query('SELECT * FROM delegations WHERE id = $1', [id])
  if (!delegationResult.rowCount) throw new HttpError(404, 'Delegation not found.')
  const delegation = delegationResult.rows[0]
  const [settings, teams, members, travel, payments, attachments, badges] = await Promise.all([
    loadSettings(requireDb()),
    query('SELECT * FROM teams WHERE delegation_id = $1 ORDER BY code', [id]),
    query(`SELECT * FROM members WHERE delegation_id = $1 ORDER BY CASE role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 ELSE 2 END, created_at`, [id]),
    query(
      `SELECT tr.*, COALESCE(json_agg(trp.member_id) FILTER (WHERE trp.member_id IS NOT NULL), '[]'::json) AS member_ids
       FROM travel_records tr LEFT JOIN travel_record_people trp ON trp.travel_record_id = tr.id
       WHERE tr.delegation_id = $1 GROUP BY tr.id ORDER BY tr.direction`,
      [id],
    ),
    query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC', [id]),
    query(`SELECT id, member_id, kind, original_filename, mime_type, size_bytes, created_at FROM attachments WHERE delegation_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT bc.member_id, bc.status, bc.issued_at FROM badge_credentials bc JOIN members m ON m.id = bc.member_id WHERE m.delegation_id = $1`, [id]),
  ])
  res.json({
    delegation: camelizeRow(delegation),
    // Once an invoice exists, at its fee tier, so the Payment step and the invoice agree.
    fees: calculateFees(settings.fees, { numberOfTeams: delegation.number_of_teams, numberOfObservers: delegation.number_of_observers }, new Date(), payments.rows[0]?.fee_tier),
    guardianConsent: settings.guardianConsent,
    bank: settings.invoice.bank,
    teams: camelizeRows(teams.rows),
    members: camelizeRows(members.rows.map((m) => ({ ...filterMember(m, req.user.role), needs_guardian_consent: needsGuardianConsent(m, settings.guardianConsent) }))),
    travelRecords: camelizeRows(travel.rows),
    payments: camelizeRows(payments.rows),
    attachments: camelizeRows(attachments.rows),
    badges: camelizeRows(badges.rows),
  })
}))

app.patch('/api/registration/delegations/:delegationId', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const body = { ...req.body }
  if ('numberOfTeams' in body) {
    const teams = Number(body.numberOfTeams)
    if (![1, 2].includes(teams)) throw new HttpError(400, 'A country can register one or two teams.')
    body.numberOfTeams = teams
    body.numberOfContestants = teams * 4
  }
  if ('numberOfObservers' in body) {
    const observers = Number(body.numberOfObservers)
    if (!Number.isInteger(observers) || observers < 0 || observers > 20) throw new HttpError(400, 'Number of observers must be a whole number from 0 to 20.')
    body.numberOfObservers = observers
  }
  if ('completedSteps' in body) {
    const allowed = ['start', 'setup', 'teams', 'people', 'welfare', 'travel']
    if (!Array.isArray(body.completedSteps) || body.completedSteps.some((s) => !allowed.includes(s))) throw new HttpError(400, 'Invalid step list.')
    body.completedSteps = [...new Set(body.completedSteps)]
  }
  if (body.declaredArrivalDate && body.declaredDepartureDate && body.declaredDepartureDate < body.declaredArrivalDate) {
    throw new HttpError(400, 'Departure must be on or after the arrival date.')
  }
  const fieldMap = {
    mobileWhatsapp: 'mobile_whatsapp',
    registrationContactEmail: 'registration_contact_email',
    numberOfTeams: 'number_of_teams',
    numberOfContestants: 'number_of_contestants',
    numberOfObservers: 'number_of_observers',
    declaredArrivalDate: 'declared_arrival_date',
    declaredDepartureDate: 'declared_departure_date',
    stayWindowNote: 'stay_window_note',
    welfareNote: 'welfare_note',
    contestantRoomType: 'contestant_room_type',
    completedSteps: 'completed_steps',
  }
  const delegation = await withTransaction(async (client) => {
    const { sets, values } = buildUpdate(body, fieldMap)
    values.push(req.params.delegationId)
    const result = await client.query(`UPDATE delegations SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    if (!result.rowCount) throw new HttpError(404, 'Delegation not found.')
    if ('numberOfTeams' in body) await ensureTeams(client, result.rows[0])
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'delegation_updated', entityType: 'delegation', entityId: req.params.delegationId, details: { fields: Object.keys(req.body) } })
    return result.rows[0]
  })
  res.json({ delegation: camelizeRow(delegation) })
}))

app.put('/api/registration/delegations/:delegationId/invoice', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const invoiceCount = optionalNumber(req.body.invoiceCount) ?? 1
  if (!Number.isInteger(invoiceCount) || invoiceCount < 1 || invoiceCount > 10) throw new HttpError(400, 'Number of invoices must be from 1 to 10.')
  const settings = await loadSettings(requireDb())
  const payment = await withTransaction(async (client) => {
    const delegation = (await client.query('SELECT * FROM delegations WHERE id = $1 FOR UPDATE', [req.params.delegationId])).rows[0]
    const fees = calculateFees(settings.fees, { numberOfTeams: delegation.number_of_teams, numberOfObservers: delegation.number_of_observers })
    const tin = optionalString(req.body.recipientTin)
    if (tin && tin.length > 40) throw new HttpError(400, 'Tax identification number must be at most 40 characters.')
    const values = [requiredString(req.body.recipientName, 'Invoice recipient name'), optionalString(req.body.recipientAddress), invoiceCount, optionalString(req.body.splitNote), fees.total, fees.tier, tin]
    const open = (await openPaymentQuery(client, delegation.id)).rows[0]
    if (open?.status === 'awaiting_review') throw new HttpError(409, 'Your proof is being reviewed. Contact the organisers to change invoice details.')
    let row
    if (open) {
      row = (await client.query(
        `UPDATE payments SET invoice_recipient_name = $1, invoice_recipient_address = $2, invoice_count = $3, invoice_split_note = $4,
           amount_due = $5, fee_tier = $6, invoice_recipient_tin = $7, updated_at = now() WHERE id = $8 RETURNING *`,
        [...values, open.id],
      )).rows[0]
    } else {
      const short = delegation.country_territory.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
      const reference = `${short}-IOL2027-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
      row = (await client.query(
        `INSERT INTO payments (delegation_id, invoice_recipient_name, invoice_recipient_address, invoice_count, invoice_split_note, amount_due, fee_tier, invoice_recipient_tin,
           currency, payment_reference, status, invoice_number)
         VALUES ($8, $1, $2, $3, $4, $5, $6, $7, 'USD', $9, 'awaiting_proof', 'IOL2027/' || nextval('invoice_number_seq')) RETURNING *`,
        [...values, delegation.id, reference],
      )).rows[0]
    }
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: delegation.id, eventType: 'invoice_saved', entityType: 'payment', entityId: row.id, details: { amountDue: fees.total } })
    return row
  })
  res.json({ payment: camelizeRow(payment) })
}))

// The invoice as a PDF: the same document the "registration submitted" email attaches.
app.get('/api/registration/delegations/:delegationId/invoice', ...signedIn, delegationAccess('read'), asyncHandler(async (req, res) => {
  const d = (await query('SELECT * FROM delegations WHERE id = $1', [req.params.delegationId])).rows[0]
  if (!d) throw new HttpError(404, 'Delegation not found.')
  const payment = (await query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC LIMIT 1', [d.id])).rows[0]
  if (!payment) throw new HttpError(409, 'Save the invoice details first.')
  res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="${invoiceFilename(d, payment)}"`).send(await delegationInvoice(d, payment))
}))

app.post('/api/registration/delegations/:delegationId/teams', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const result = await query(
    `INSERT INTO teams (delegation_id, name, code, contest_language, status) VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
    [req.params.delegationId, requiredString(req.body.name, 'Team name'), requiredString(req.body.code, 'Team code'), optionalString(req.body.contestLanguage)],
  )
  res.status(201).json({ team: camelizeRow(result.rows[0]) })
}))

app.patch('/api/registration/teams/:teamId', ...signedIn, childAccess('teams', 'teamId'), asyncHandler(async (req, res) => {
  const body = { ...req.body }
  if ('contestLanguage' in body) body.status = optionalString(body.contestLanguage) ? 'ready' : 'draft'
  const { sets, values } = buildUpdate(body, { name: 'name', contestLanguage: 'contest_language', status: 'status' })
  values.push(req.params.teamId)
  const result = await query(`UPDATE teams SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'team_updated', entityType: 'team', entityId: req.params.teamId, details: { fields: Object.keys(req.body) } })
  res.json({ team: camelizeRow(result.rows[0]) })
}))

const memberFields = {
  teamId: 'team_id',
  role: 'role',
  observerCategory: 'observer_category',
  displayName: 'display_name',
  badgeName: 'badge_name',
  officialName: 'official_name',
  passportName: 'passport_name',
  passportNumber: 'passport_number',
  passportNationality: 'passport_nationality',
  dateOfBirth: 'date_of_birth',
  genderForRoomAllocation: 'gender_for_room_allocation',
  examLanguage: 'exam_language',
  tshirtSize: 'tshirt_size',
  poloSize: 'polo_size',
  foodAllergyNotes: 'food_allergy_notes',
  medicalAccessibilityNotes: 'medical_accessibility_notes',
  emergencyContact: 'emergency_contact',
  roomTypePreference: 'room_type_preference',
  email: 'email',
  mobileWhatsapp: 'mobile_whatsapp',
}

/** People can only be added or edited once proof of payment is uploaded (Team Leader flow), except by admins. */
async function requirePeopleOpen(req, delegationId) {
  if (DELEGATION_ADMINS.includes(req.user.role)) return
  const paid = await query(`SELECT 1 FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_review', 'approved') LIMIT 1`, [delegationId])
  if (!paid.rowCount) throw new HttpError(409, 'People opens once proof of payment is uploaded.')
}

async function checkTeamBelongs(teamId, delegationId) {
  if (!teamId) return
  const ok = await query('SELECT 1 FROM teams WHERE id = $1 AND delegation_id = $2', [teamId, delegationId])
  if (!ok.rowCount) throw new HttpError(400, 'That team belongs to another delegation.')
}

app.post('/api/registration/delegations/:delegationId/members', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  await requirePeopleOpen(req, req.params.delegationId)
  const body = { ...req.body, role: normalizeRole(req.body.role || 'contestant') }
  if (body.role === 'team_leader') throw new HttpError(400, 'The Team Leader record is created with the account.')
  await checkTeamBelongs(body.teamId, req.params.delegationId)
  requiredString(body.displayName, 'Display name')
  const entries = Object.entries(memberFields).filter(([key]) => key in body)
  const columns = ['delegation_id', ...entries.map(([, column]) => column)]
  const values = [req.params.delegationId, ...entries.map(([key]) => (body[key] === '' ? null : body[key]))]
  const result = await query(
    `INSERT INTO members (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    values,
  )
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'member_added', entityType: 'member', entityId: result.rows[0].id })
  res.status(201).json({ member: camelizeRow(result.rows[0]) })
}))

app.patch('/api/registration/members/:memberId', ...signedIn, childAccess('members', 'memberId'), asyncHandler(async (req, res) => {
  await requirePeopleOpen(req, req.delegationId)
  const body = { ...req.body }
  if (body.role) body.role = normalizeRole(body.role)
  await checkTeamBelongs(body.teamId, req.delegationId)
  const { sets, values } = buildUpdate(body, memberFields)
  values.push(req.params.memberId)
  const result = await query(`UPDATE members SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'member_updated', entityType: 'member', entityId: req.params.memberId, details: { fields: Object.keys(req.body) } })
  res.json({ member: camelizeRow(result.rows[0]) })
}))

app.delete('/api/registration/members/:memberId', ...signedIn, childAccess('members', 'memberId'), asyncHandler(async (req, res) => {
  const member = (await query('SELECT role FROM members WHERE id = $1', [req.params.memberId])).rows[0]
  if (member.role === 'team_leader') throw new HttpError(400, 'The Team Leader record cannot be removed.')
  await query('DELETE FROM members WHERE id = $1', [req.params.memberId])
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'member_removed', entityType: 'member', entityId: req.params.memberId })
  res.status(204).end()
}))

app.post('/api/registration/members/:memberId/guardian-consent', ...signedIn, childAccess('members', 'memberId'), upload.single('consent'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose the signed consent form to upload.')
  const extension = path.extname(req.file.originalname).toLowerCase() || '.bin'
  const storedPath = await saveUpload(`${req.delegationId}/guardian-${req.params.memberId}-${crypto.randomUUID()}${extension}`, req.file)
  const attachment = await withTransaction(async (client) => {
    const row = (await client.query(
      `INSERT INTO attachments (delegation_id, member_id, kind, original_filename, stored_path, mime_type, size_bytes, uploaded_by_account_id)
       VALUES ($1, $2, 'guardian_consent', $3, $4, $5, $6, $7)
       RETURNING id, delegation_id, member_id, kind, original_filename, mime_type, size_bytes, created_at`,
      [req.delegationId, req.params.memberId, req.file.originalname, storedPath, req.file.mimetype, req.file.size, req.user.id],
    )).rows[0]
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'guardian_consent_uploaded', entityType: 'member', entityId: req.params.memberId })
    return row
  })
  res.status(201).json({ attachment: camelizeRow(attachment) })
}))

async function setTripPeople(db, travelRecordId, delegationId, peopleIds) {
  if (!Array.isArray(peopleIds)) return
  await db.query('DELETE FROM travel_record_people WHERE travel_record_id = $1', [travelRecordId])
  for (const memberId of peopleIds) {
    const own = await db.query('SELECT 1 FROM members WHERE id = $1 AND delegation_id = $2', [memberId, delegationId])
    if (!own.rowCount) throw new HttpError(400, 'A person on this trip belongs to another delegation.')
    await db.query('INSERT INTO travel_record_people (travel_record_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [travelRecordId, memberId])
  }
}

app.post('/api/registration/delegations/:delegationId/travel', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const travel = await withTransaction(async (client) => {
    const row = (await client.query(
      `INSERT INTO travel_records (delegation_id, direction, travel_point, flight_service_number, local_date, local_time, terminal, change_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.delegationId, normalizeDirection(req.body.direction), optionalString(req.body.travelPoint), optionalString(req.body.flightServiceNumber),
        optionalString(req.body.localDate), optionalString(req.body.localTime), optionalString(req.body.terminal), normalizeChangeStatus(req.body.changeStatus)],
    )).rows[0]
    await setTripPeople(client, row.id, req.params.delegationId, req.body.peopleIds)
    await client.query(`UPDATE delegations SET travel_status = 'in_progress', updated_at = now() WHERE id = $1`, [req.params.delegationId])
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'travel_saved', entityType: 'travel_record', entityId: row.id })
    return row
  })
  // Awaited, not left running: Cloud Run slows work that continues after the response is sent.
  await sendBadgesIfSettled(req.params.delegationId).catch((e) => console.error(e.message))
  res.status(201).json({ travelRecord: camelizeRow(travel) })
}))

app.patch('/api/registration/travel/:travelRecordId', ...signedIn, childAccess('travel', 'travelRecordId'), asyncHandler(async (req, res) => {
  const travel = await withTransaction(async (client) => {
    const body = { ...req.body }
    if (body.changeStatus) body.changeStatus = normalizeChangeStatus(body.changeStatus)
    const { sets, values } = buildUpdate(body, { travelPoint: 'travel_point', flightServiceNumber: 'flight_service_number', localDate: 'local_date', localTime: 'local_time', terminal: 'terminal', changeStatus: 'change_status' })
    values.push(req.params.travelRecordId)
    const result = await client.query(`UPDATE travel_records SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    await setTripPeople(client, req.params.travelRecordId, req.delegationId, req.body.peopleIds)
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'travel_saved', entityType: 'travel_record', entityId: req.params.travelRecordId })
    return result.rows[0]
  })
  await sendBadgesIfSettled(req.delegationId).catch((e) => console.error(e.message))
  res.json({ travelRecord: camelizeRow(travel) })
}))

app.post('/api/registration/delegations/:delegationId/payment-proof', ...signedIn, delegationAccess('write'), upload.single('proof'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose the proof of transfer file to upload.')
  const extension = path.extname(req.file.originalname).toLowerCase() || '.bin'
  const storedPath = await saveUpload(`${req.params.delegationId}/proof-${crypto.randomUUID()}${extension}`, req.file)
  const response = await withTransaction(async (client) => {
    const payment = (await openPaymentQuery(client, req.params.delegationId)).rows[0]
    if (!payment) throw new HttpError(409, 'Save the invoice details before uploading proof.')
    const attachment = (await client.query(
      `INSERT INTO attachments (delegation_id, kind, original_filename, stored_path, mime_type, size_bytes, uploaded_by_account_id)
       VALUES ($1, 'payment_proof', $2, $3, $4, $5, $6)
       RETURNING id, delegation_id, kind, original_filename, mime_type, size_bytes, created_at`,
      [req.params.delegationId, req.file.originalname, storedPath, req.file.mimetype, req.file.size, req.user.id],
    )).rows[0]
    const updated = (await client.query(
      `UPDATE payments SET proof_attachment_id = $1, status = 'awaiting_review', review_note = NULL, updated_at = now() WHERE id = $2 RETURNING *`,
      [attachment.id, payment.id],
    )).rows[0]
    await client.query(`UPDATE delegations SET payment_status = 'awaiting_review', updated_at = now() WHERE id = $1`, [req.params.delegationId])
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'payment_proof_uploaded', entityType: 'payment', entityId: payment.id, details: { originalFilename: req.file.originalname } })
    return { payment: updated, attachment }
  })

  const d = (await query('SELECT country_territory, team_leader_email, primary_team_leader_name FROM delegations WHERE id = $1', [req.params.delegationId])).rows[0]
  const emailCtx = {
    countryTerritory: d.country_territory, fullName: d.primary_team_leader_name, paymentReference: response.payment.payment_reference,
    amountDue: response.payment.amount_due, currency: response.payment.currency || 'USD', invoiceCount: response.payment.invoice_count,
    proofFilename: req.file.originalname, delegationId: req.params.delegationId,
  }
  sendEmail({ pool: requireDb(), to: d.team_leader_email, ...buildProofReceivedEmail(emailCtx), purpose: 'payment_proof_received', delegationId: req.params.delegationId }).catch((e) => console.error(e.message))
  if (process.env.FINANCE_EMAIL) {
    sendEmail({ pool: requireDb(), to: process.env.FINANCE_EMAIL, ...buildFinanceAlertEmail(emailCtx), purpose: 'finance_proof_alert', delegationId: req.params.delegationId }).catch((e) => console.error(e.message))
  }
  res.status(201).json({ payment: camelizeRow(response.payment), attachment: camelizeRow(response.attachment) })
}))

app.get('/api/registration/attachments/:attachmentId', ...signedIn, asyncHandler(async (req, res) => {
  const attachment = (await query('SELECT * FROM attachments WHERE id = $1', [req.params.attachmentId])).rows[0]
  if (!attachment) throw new HttpError(404, 'File not found.')
  if (req.user.role === 'finance_admin') {
    if (attachment.kind !== 'payment_proof') throw new HttpError(404, 'File not found.')
  } else {
    await authorizeDelegation(req, attachment.delegation_id, req.user.role === 'welfare_staff' ? 'none' : 'read')
  }
  // ?inline=1 lets staff preview a proof in the page. Only PDF, JPG and PNG are ever stored, and nosniff
  // stops the browser from treating a file as anything other than its declared type.
  res.set('Content-Type', attachment.mime_type)
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${attachment.original_filename.replace(/[^\w.\- ]/g, '_')}"`)
  ;(await readUpload(attachment.stored_path)).on('error', (e) => { console.error(e.message); res.destroy() }).pipe(res)
}))

/** Server-side check of what still blocks submission. */
async function missingForSubmission(delegationId) {
  const d = (await query('SELECT * FROM delegations WHERE id = $1', [delegationId])).rows[0]
  const missing = []
  for (const [step, label] of [['setup', 'Team and observers'], ['teams', 'Teams'], ['people', 'People'], ['welfare', 'Rooms and welfare'], ['travel', 'Travel']]) {
    if (!d.completed_steps.includes(step)) missing.push(`Finish “${label}”`)
  }
  const paid = await query(`SELECT 1 FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_review', 'approved')`, [delegationId])
  if (!paid.rowCount) missing.push('Upload proof of payment')
  if (!d.declared_arrival_date || !d.declared_departure_date) missing.push('Add your stay dates')
  const teams = await query('SELECT name FROM teams WHERE delegation_id = $1 AND contest_language IS NULL ORDER BY code', [delegationId])
  for (const team of teams.rows) missing.push(`${team.name}: working language missing`)
  const { guardianConsent } = await loadSettings(requireDb())
  const members = await query(
    `SELECT m.*, EXISTS (SELECT 1 FROM attachments a WHERE a.member_id = m.id AND a.kind = 'guardian_consent') AS has_consent
     FROM members m WHERE m.delegation_id = $1 ORDER BY m.created_at`,
    [delegationId],
  )
  for (const member of members.rows) {
    const gaps = missingMemberDetails(member)
    if (needsGuardianConsent(member, guardianConsent) && !member.has_consent) gaps.push('guardian consent form')
    if (gaps.length) missing.push(`${member.display_name}: ${gaps.join(', ')}`)
  }
  return { delegation: d, missing }
}

app.post('/api/registration/delegations/:delegationId/submit', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const { missing } = await missingForSubmission(req.params.delegationId)
  if (missing.length) return res.status(409).json({ error: 'Finish the remaining steps first.', missing })
  const submitted = await withTransaction(async (client) => {
    const row = (await client.query(
      `UPDATE delegations SET registration_status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1 AND registration_status = 'draft' RETURNING *`,
      [req.params.delegationId],
    )).rows[0]
    if (!row) throw new HttpError(409, 'This registration has already been submitted.')
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: row.id, eventType: 'registration_submitted', entityType: 'delegation', entityId: row.id })
    return row
  })
  // The emails are awaited (Cloud Run slows work left running after the response); a failure is logged, not shown.
  await notifySubmitted(submitted).catch((e) => console.error(e.message))
  res.json({ delegation: camelizeRow(submitted) })
}))

/** The "registration submitted" email with the invoice PDF attached, then the QR badges if everything is already in. */
async function notifySubmitted(d) {
  const [payment, travelGaps] = await Promise.all([
    query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC LIMIT 1', [d.id]).then((r) => r.rows[0] ?? null),
    missingTravel(d.id),
  ])
  const invoice = await delegationInvoice(d, payment)
  const { subject, html } = buildRegistrationSubmittedEmail({
    countryTerritory: d.country_territory, fullName: d.primary_team_leader_name, numberOfTeams: d.number_of_teams, numberOfObservers: d.number_of_observers,
    paymentConfirmed: payment?.status === 'approved', travelComplete: !travelGaps.length, travelUrl: `${portalUrl}/?step=travel`,
  })
  await sendEmail({ pool: requireDb(), to: d.team_leader_email, subject, html, attachments: [{ filename: invoiceFilename(d, payment), content: invoice, contentType: 'application/pdf' }], purpose: 'registration_submitted', delegationId: d.id })
  await sendBadgesIfSettled(d.id)
}

/** The delegation's invoice PDF, priced at the fee tier the invoice was issued at, so its total and due date hold. */
async function delegationInvoice(d, payment) {
  const settings = await loadSettings(requireDb())
  const fees = calculateFees(settings.fees, { numberOfTeams: d.number_of_teams, numberOfObservers: d.number_of_observers }, new Date(), payment?.fee_tier)
  return invoicePdf({ delegation: d, payment, fees, invoice: settings.invoice })
}

function invoiceFilename(d, payment) {
  const number = payment?.invoice_number?.split('/')[1]
  return `IOL2027-invoice-${number ? `${number}-` : ''}${d.country_territory.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')}.pdf`
}

/* ------------------------------------------------------------------ */
/* Participant                                                         */
/* ------------------------------------------------------------------ */

app.get('/api/participant/me', ...signedIn, requireRole('participant'), asyncHandler(async (req, res) => {
  if (!req.user.memberId) throw new HttpError(404, 'This account is not linked to a participant record yet.')
  const member = (await query(
    `SELECT m.*, d.country_territory, t.name AS team_name, bc.status AS badge_status
     FROM members m JOIN delegations d ON d.id = m.delegation_id
     LEFT JOIN teams t ON t.id = m.team_id LEFT JOIN badge_credentials bc ON bc.member_id = m.id
     WHERE m.id = $1`,
    [req.user.memberId],
  )).rows[0]
  if (!member) throw new HttpError(404, 'Participant record not found.')
  res.json({ member: camelizeRow(member) })
}))

/* ------------------------------------------------------------------ */
/* Badges and check-in                                                 */
/* ------------------------------------------------------------------ */

app.post('/api/registration/members/:memberId/badge', ...signedIn, requireRole('registration_admin'), asyncHandler(async (req, res) => {
  const member = (await query('SELECT id, delegation_id, display_name, badge_name, role FROM members WHERE id = $1', [req.params.memberId])).rows[0]
  if (!member) throw new HttpError(404, 'Member not found.')
  const { credential, payload } = await issueBadge(requireDb(), { memberId: member.id })
  const qrDataUrl = await badgeQrDataUrl(payload)
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: member.delegation_id, eventType: 'badge_issued', entityType: 'member', entityId: member.id, details: { publicId: credential.public_id } })
  res.status(201).json({ badge: camelizeRow(credential), member: camelizeRow(member), qrDataUrl })
}))

/** Whose badge it is, as the scanner and the badge page show it: name, role, and country (or assignment, for staff). */
const badgeHolder = (c) => ({
  kind: c.staff_id ? 'staff' : 'member', displayName: c.display_name, badgeName: c.badge_name, officialName: c.official_name,
  role: c.role, place: c.place, team: c.team_name,
})

// The badge page (/b) shows whose badge was scanned and its recent check-ins before anything is recorded.
app.post('/api/registration/check-in/lookup', ...signedIn, requireRole('checkin_staff', 'registration_admin'), asyncHandler(async (req, res) => {
  const credential = await findBadge(requiredString(req.body.payload, 'Badge code'))
  const scans = await query(
    `SELECT ce.checkpoint, ce.result, ce.scanned_at, a.full_name AS scanned_by FROM check_in_events ce LEFT JOIN accounts a ON a.id = ce.scanned_by_account_id
     WHERE ce.member_id = $1 OR ce.staff_id = $2 ORDER BY ce.scanned_at DESC LIMIT 5`,
    [credential.member_id, credential.staff_id],
  )
  res.json({ holder: badgeHolder(credential), active: credential.status === 'active', scans: camelizeRows(scans.rows) })
}))

app.post('/api/registration/check-in/scan', ...signedIn, requireRole('checkin_staff', 'registration_admin'), asyncHandler(async (req, res) => {
  const checkpoint = requiredString(req.body.checkpoint, 'Checkpoint')
  if (checkpoint.length > 80) throw new HttpError(400, 'Checkpoint must be at most 80 characters.')
  const credential = await findBadge(requiredString(req.body.payload, 'Badge code'))
  const result = credential.status === 'active' ? 'accepted' : 'revoked'
  const scan = (await query(
    `INSERT INTO check_in_events (badge_credential_id, member_id, staff_id, scanned_by_account_id, checkpoint, result) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [credential.id, credential.member_id, credential.staff_id, req.user.id, checkpoint, result],
  )).rows[0]
  res.status(result === 'accepted' ? 201 : 409).json({ accepted: result === 'accepted', holder: badgeHolder(credential), scan: camelizeRow(scan) })
}))

/* ------------------------------------------------------------------ */
/* Staff back office (admin.js)                                        */
/* ------------------------------------------------------------------ */

registerAdminRoutes(app, { signedIn })
registerBadgeRoutes(app, { signedIn })

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')))

app.use((error, _req, res, _next) => {
  const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 400 : 500)
  if (status >= 500) console.error(error)
  const message = error.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 10 MB.' : status >= 500 ? 'Something went wrong on our side. Please try again.' : error.message
  res.status(status).json({ error: message })
})

app.listen(port, () => {
  console.log(`IOL 2027 registration API listening on port ${port}`)
})
