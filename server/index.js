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
  buildConsentFormsEmail,
  sendEmail,
} from './email.js'
import { consentFileName, consentFormKind, consentPdf } from './consent-pdf.js'
import { readUpload, saveUpload } from './storage.js'
import { invoicePdf } from './invoice-pdf.js'
import { badgeQrDataUrl, findBadge, issueBadge, missingTravel, sendBadgesIfSettled } from './badges.js'
import {
  DELEGATION_ADMINS, DELEGATION_READERS, HttpError,
  checkPasswordRules, createSession, destroySession, filterMember, hashPassword, loginBlocked, recordLogin,
  requireAuth, requireRequestHeader, requireRole, requireVerified, sessionMiddleware, verifyPassword,
} from './auth.js'
import { delegationFees, feeTier, loadSettings, maxObservers, needsGuardianConsent, pastEarlyBirdGrace } from './fees.js'
import {
  asyncHandler, buildUpdate, camelizeRow, camelizeRows, hashToken, insertAudit, isEmail, missingMemberDetails,
  exposeDevCodes, optionalNumber, optionalString, pool, query, requireDb, requiredString, portalUrl, withTransaction,
} from './lib.js'
import { issuePasswordCode, issueVerificationCode } from './codes.js'
import { registerAdminRoutes } from './admin.js'
import { registerBadgeRoutes } from './badge-admin.js'
import { registerJobRoutes } from './jobs.js'

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
// Scheduled work signs in with a Google token, not a session (jobs.js).
registerJobRoutes(app, { missingForSubmission })
app.use(sessionMiddleware(requireDb))
app.use(requireRequestHeader)

// PDF, and the image types banks and phones produce: JPG, PNG, WEBP, and HEIC/HEIF (iPhone photos). Some browsers send
// no type for a HEIC file, so its extension decides.
const UPLOAD_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    if (!UPLOAD_TYPES.has(file.mimetype) && ['.heic', '.heif'].includes(extension)) file.mimetype = `image/${extension.slice(1)}`
    if (UPLOAD_TYPES.has(file.mimetype)) callback(null, true)
    else callback(new HttpError(400, 'Only PDF, JPG, PNG, WEBP and HEIC files are accepted.'))
  },
})
// The files that make up one proof of payment, at most.
const MAX_PROOF_FILES = 10

function normalizeRole(role) {
  const value = requiredString(role, 'role').toLowerCase().replaceAll(' ', '_')
  if (!['contestant', 'team_leader', 'observer', 'jury', 'volunteer'].includes(value)) throw new HttpError(400, 'Invalid member role.')
  return value
}

// Food options people tick in People, several at once (IOL Board, 16 Nov 2026). A starting list until catering
// confirms what they offer; "Other" asks for details in the food notes.
const DIET_OPTIONS = ['No special diet', 'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'No pork', 'No beef', 'Gluten-free', 'Lactose-free', 'Nut allergy', 'Seafood or shellfish allergy', 'Other']
// Airport pickup and drop-off are from these two airports only.
const AIRPORTS = ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)']
// Flights are checked against a window around the programme (21 to 28 July 2027).
const TRAVEL_WINDOW = { first: '2027-07-07', last: '2027-08-11' }
const longDate = (iso) => new Date(`${iso}T12:00:00+07:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })
/** True once the end of this day (Bangkok time) has passed. */
const pastDay = (iso, now = new Date()) => now > new Date(`${iso}T23:59:59+07:00`)
const isAdmin = (req) => DELEGATION_ADMINS.includes(req.user.role)

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
    `SELECT i.code, i.country_territory, i.accredited_organisation, i.max_teams, i.status, i.used_by_account_id, i.kind, i.shared, a.email AS used_by_email
     FROM invite_codes i LEFT JOIN accounts a ON a.id = i.used_by_account_id WHERE i.code = $1`,
    [code],
  )).rows[0]
  // A used code means the Team Leader account already exists (often someone who left before finishing),
  // so the answer sends them to sign in rather than saying the code is wrong. A shared code (jury, volunteers) is never used up.
  if (invite && !invite.shared && (invite.status === 'used' || invite.used_by_account_id)) {
    return res.status(409).json({
      error: `This code has already been used to create the account for ${invite.country_territory}. Sign in with that account instead.`,
      codeUsed: true, countryTerritory: invite.country_territory, accountHint: invite.used_by_email ? maskEmail(invite.used_by_email) : null,
    })
  }
  if (invite?.status !== 'active') throw new HttpError(404, 'That code was not found. Check the invitation email, or contact the organisers.')
  const { country_territory, accredited_organisation, max_teams, kind } = invite
  res.json({ invite: camelizeRow({ code: invite.code, country_territory, accredited_organisation, max_teams, kind }) })
}))

/* ------------------------------------------------------------------ */
/* Accounts and sessions                                               */
/* ------------------------------------------------------------------ */

async function currentUserPayload(user) {
  if (!user) return { user: null }
  const payload = { user: { ...user } }
  if (user.role === 'team_leader') {
    const d = await query('SELECT id, country_territory, kind FROM delegations WHERE account_id = $1 ORDER BY created_at LIMIT 1', [user.id])
    payload.user.delegationId = d.rows[0]?.id ?? null
    payload.user.country = d.rows[0]?.country_territory ?? null
    // A country's national representative, or a jury member or volunteer registering themselves.
    payload.user.kind = d.rows[0]?.kind ?? 'country'
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
  // The national representative's name is asked in Team and observers, not at sign-up (since 12 Nov 2026).
  const fullName = optionalString(req.body.fullName) ?? ''
  if (!isEmail(email)) throw new HttpError(400, 'Enter an email address like name@example.org.')
  checkPasswordRules(req.body.password)

  const created = await withTransaction(async (client) => {
    const invite = (await client.query(
      `SELECT * FROM invite_codes WHERE code = $1 AND status = 'active' AND (shared OR used_by_account_id IS NULL) FOR UPDATE`,
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
    // A jury member or volunteer registers only themselves (a jury member may bring an observer): no teams, no contestants.
    const country = invite.kind === 'country'
    const delegation = (await client.query(
      `INSERT INTO delegations (account_id, invite_code_id, country_territory, accredited_organisation,
         national_representative_name, team_leader_email, registration_contact_email, number_of_teams, number_of_contestants, number_of_observers, fee_category, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $9, 0, $8, $10) RETURNING *`,
      [account.id, invite.id, invite.country_territory, invite.accredited_organisation, fullName, email, country ? invite.contact_email : email, invite.fee_category, 4, invite.kind],
    )).rows[0]
    // Team Leaders are named in Team and observers, which adds their records to People.
    if (country) await ensureTeams(client, delegation)
    if (!reuse && !invite.shared) await client.query(`UPDATE invite_codes SET status = 'used', used_at = now(), used_by_account_id = $1, updated_at = now() WHERE id = $2`, [account.id, invite.id])
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

/**
 * Keeps the team rows in step with number_of_teams: adds missing teams, removes unused extra ones. One team is named
 * after the country, two are its A and B teams (Team and observers shows the same names); a name changed in Teams
 * is kept.
 */
async function ensureTeams(db, delegation) {
  const want = Math.min(Math.max(Number(delegation.number_of_teams) || 1, 1), 2)
  const existing = (await db.query('SELECT * FROM teams WHERE delegation_id = $1 ORDER BY code', [delegation.id])).rows
  const prefix = delegation.country_territory.replace(/\s*\(TEST\)\s*/i, '').trim()
  const short = prefix.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
  const defaultName = (i, count) => (count === 1 ? prefix : `${prefix} ${TEAM_LETTERS[i]}`)
  for (let i = existing.length; i < want; i++) {
    await db.query(
      `INSERT INTO teams (delegation_id, name, code, status) VALUES ($1, $2, $3, 'draft') ON CONFLICT DO NOTHING`,
      [delegation.id, defaultName(i, want), `${short}-${TEAM_LETTERS[i]}`],
    )
  }
  for (const team of existing.slice(want)) {
    const used = await db.query('SELECT 1 FROM members WHERE team_id = $1 LIMIT 1', [team.id])
    if (!used.rowCount) await db.query('DELETE FROM teams WHERE id = $1', [team.id])
  }
  const defaults = [prefix, ...TEAM_LETTERS.map((letter) => `${prefix} ${letter}`)]
  const teams = (await db.query('SELECT id, name FROM teams WHERE delegation_id = $1 ORDER BY code', [delegation.id])).rows
  for (const [i, team] of teams.entries()) {
    const name = defaultName(i, teams.length)
    if (team.name !== name && defaults.includes(team.name)) await db.query('UPDATE teams SET name = $1, updated_at = now() WHERE id = $2', [name, team.id])
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
    query(`SELECT * FROM members WHERE delegation_id = $1 ORDER BY CASE role WHEN 'contestant' THEN 1 WHEN 'observer' THEN 2 ELSE 0 END, created_at`, [id]),
    query(
      `SELECT tr.*, COALESCE(json_agg(trp.member_id) FILTER (WHERE trp.member_id IS NOT NULL), '[]'::json) AS member_ids
       FROM travel_records tr LEFT JOIN travel_record_people trp ON trp.travel_record_id = tr.id
       WHERE tr.delegation_id = $1 GROUP BY tr.id ORDER BY tr.direction`,
      [id],
    ),
    query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC', [id]),
    query(`SELECT id, member_id, payment_id, kind, original_filename, mime_type, size_bytes, created_at FROM attachments WHERE delegation_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT bc.member_id, bc.status, bc.issued_at FROM badge_credentials bc JOIN members m ON m.id = bc.member_id WHERE m.delegation_id = $1`, [id]),
  ])
  if (payments.rows[0]) payments.rows[0] = await catchUpFeeTier(requireDb(), payments.rows[0], settings.fees)
  // Once an invoice exists, at its fee tier, so the Payment step and the invoice agree.
  const fees = delegationFees(settings.fees, delegation, payments.rows[0]?.fee_tier)
  res.json({
    delegation: camelizeRow(delegation),
    fees,
    // teamFees are the first and second team's fees at this rate and tier, so Team and observers can show the total as it changes.
    feeRules: {
      maxObserversPerTeam: settings.fees.maxObserversPerTeam, singleRoomFee: settings.fees.singleRoomFee, observerFee: settings.fees.observerFee, currency: settings.fees.currency,
      teamFees: settings.fees.teamFees[fees.tier][fees.category] ?? settings.fees.teamFees[fees.tier].accredited,
    },
    guardianConsent: settings.guardianConsent,
    // Deadlines and wording shown beside the steps, and the choices People and Travel offer.
    event: { ...settings.event, languagesLocked: pastDay(settings.event.languageLock), travelLocked: pastDay(settings.event.travelDeadline), peopleLocked: pastDay(settings.event.peopleDeadline), earlyBirdEnds: settings.fees.earlyBirdEnds, registrationEnds: settings.fees.registrationEnds },
    options: { diets: DIET_OPTIONS, airports: AIRPORTS, travelWindow: TRAVEL_WINDOW },
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
  const current = (await query('SELECT number_of_teams, number_of_observers, fee_category, single_rooms, kind FROM delegations WHERE id = $1', [req.params.delegationId])).rows[0]
  if (!current) throw new HttpError(404, 'Delegation not found.')
  const country = current.kind === 'country'
  // A jury member registers themselves and may bring one observer; a volunteer comes alone.
  if (!country && 'numberOfTeams' in body) throw new HttpError(400, 'Jury members and volunteers register without a team.')
  if (current.kind === 'volunteer' && (Number(body.numberOfObservers) > 0 || (Array.isArray(body.observerTeams) && body.observerTeams.length))) throw new HttpError(400, 'Volunteers register on their own, without an observer.')
  if ('needsAccommodation' in body && typeof body.needsAccommodation !== 'boolean') throw new HttpError(400, 'Say whether you need a hotel room.')
  // Team and observers sets the amount paid, so it is locked once the proof of payment is in (admins can still change it).
  if (['numberOfTeams', 'numberOfObservers', 'observerTeams', 'singleRooms'].some((key) => key in body) && !DELEGATION_ADMINS.includes(req.user.role) && await proofIsIn(requireDb(), req.params.delegationId)) {
    throw new HttpError(409, 'Your proof of payment is uploaded, so Team and observers is locked: it sets the amount you paid. Email the organisers to change it.')
  }
  const { fees } = await loadSettings(requireDb())
  // Without a hotel room there is no single room to pay for.
  if (body.needsAccommodation === false && body.singleRooms) body.singleRooms = { ...body.singleRooms, teamLeaders: [false] }
  if ('numberOfTeams' in body) {
    const teams = Number(body.numberOfTeams)
    if (![1, 2].includes(teams)) throw new HttpError(400, 'A country can register one or two teams.')
    if (teams === 2 && current.fee_category === 'non_accredited') throw new HttpError(400, 'A country or territory that is not accredited can register one team.')
    body.numberOfTeams = teams
    body.numberOfContestants = teams * 4
  }
  const teams = body.numberOfTeams ?? current.number_of_teams
  const perTeam = fees.maxObserversPerTeam
  // Observers are added team by team in Team and observers: observerTeams says which team each one comes with (0 for
  // the first, 1 for the second), at most perTeam a team, and sets the number of observers.
  if ('observerTeams' in body) {
    const list = body.observerTeams
    if (!Array.isArray(list) || list.some((t) => !Number.isInteger(t) || t < 0 || t >= teams)) throw new HttpError(400, 'Each observer must come with one of your teams.')
    if (TEAM_LETTERS.some((_, t) => list.filter((x) => x === t).length > perTeam)) throw new HttpError(400, `Up to ${perTeam} ${perTeam === 1 ? 'observer' : 'observers'} per team.`)
    body.numberOfObservers = list.length
  } else if ('numberOfObservers' in body) {
    const observers = Number(body.numberOfObservers)
    const most = maxObservers(fees, teams)
    if (!Number.isInteger(observers) || observers < 0 || observers > most) throw new HttpError(400, `Up to ${perTeam} observers per team: ${most} for ${teams === 1 ? 'one team' : 'two teams'}.`)
    body.numberOfObservers = observers
  }
  // One yes or no per Team Leader (one per team) and per observer, kept the same length as those numbers, and the team
  // each observer comes with (filled in team by team where it was never chosen).
  if ('singleRooms' in body || 'numberOfTeams' in body || 'numberOfObservers' in body) {
    const given = body.singleRooms ?? current.single_rooms ?? {}
    if (typeof given !== 'object') throw new HttpError(400, 'Single rooms must list each Team Leader and observer.')
    const fit = (list, length) => Array.from({ length }, (_, i) => Boolean(Array.isArray(list) ? list[i] : false))
    const observers = body.numberOfObservers ?? current.number_of_observers
    const chosen = body.observerTeams ?? current.single_rooms?.observerTeams ?? []
    const observerTeams = Array.from({ length: observers }, (_, i) => (Number.isInteger(chosen[i]) && chosen[i] < teams ? chosen[i] : Math.min(Math.floor(i / Math.max(perTeam, 1)), teams - 1)))
    body.singleRooms = { teamLeaders: fit(given.teamLeaders, teams), observers: fit(given.observers, observers), observerTeams }
  }
  delete body.observerTeams
  // Who registers and who leads each team, from Team and observers. Not locked by the proof: names do not change fees.
  // The national representative is the country's one main contact, even with two teams, and may lead either team or
  // neither (representativeTeam 0, 1 or null). Each team has its own Team Leader (IOL Board, 16 Nov 2026).
  let leaderNames = null
  let selfName = null
  if (['nationalRepresentativeName', 'representativeTeam', 'representativeIsTeamLeader', 'teamLeaderNames'].some((key) => key in body)) {
    const name = requiredString(body.nationalRepresentativeName, country ? 'National representative’s name' : 'Your full name')
    if (name.length > 200) throw new HttpError(400, 'The name must be at most 200 characters.')
    body.nationalRepresentativeName = name
    if (country) {
      // Pages from before 17 Nov 2026 send representativeIsTeamLeader, meaning the first team.
      const team = 'representativeTeam' in body ? body.representativeTeam
        : typeof body.representativeIsTeamLeader === 'boolean' ? (body.representativeIsTeamLeader ? 0 : null) : undefined
      if (team === undefined) throw new HttpError(400, 'Say whether the national representative is also a Team Leader, and of which team.')
      if (team !== null && (!Number.isInteger(team) || team < 0 || team >= teams)) throw new HttpError(400, 'Choose one of your teams for the national representative.')
      const given = Array.isArray(body.teamLeaderNames) ? body.teamLeaderNames : []
      leaderNames = Array.from({ length: teams }, (_, i) => (i === team ? name : String(given[i] ?? '').trim().slice(0, 200)))
      const gap = leaderNames.findIndex((n) => !n)
      if (gap >= 0) throw new HttpError(400, teams === 1 ? 'Enter the Team Leader’s name.' : `Enter the ${gap === 0 ? 'first' : 'second'} team’s Team Leader: each team has its own Team Leader.`)
      body.representativeTeam = team
      body.representativeIsTeamLeader = team !== null
    } else {
      selfName = name
      delete body.representativeTeam
      delete body.representativeIsTeamLeader
    }
  }
  delete body.teamLeaderNames
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
    singleRooms: 'single_rooms',
    nationalRepresentativeName: 'national_representative_name',
    representativeIsTeamLeader: 'representative_is_team_leader',
    representativeTeam: 'representative_team',
    needsAccommodation: 'needs_accommodation',
  }
  const delegation = await withTransaction(async (client) => {
    const { sets, values } = buildUpdate(body, fieldMap)
    values.push(req.params.delegationId)
    const result = await client.query(`UPDATE delegations SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    if (!result.rowCount) throw new HttpError(404, 'Delegation not found.')
    // Down to one team: the second team's Team Leader (named in Team and observers) goes with it, and its contestants
    // wait for a team again, so the second team can be removed.
    if (country && result.rows[0].number_of_teams === 1) {
      const extra = (await client.query('SELECT id FROM teams WHERE delegation_id = $1 ORDER BY code OFFSET 1', [result.rows[0].id])).rows.map((t) => t.id)
      if (extra.length) {
        await client.query(`DELETE FROM members WHERE role = 'team_leader' AND team_id = ANY($1)`, [extra])
        await client.query('UPDATE members SET team_id = NULL, updated_at = now() WHERE team_id = ANY($1)', [extra])
      }
    }
    if (country && ('numberOfTeams' in body || leaderNames)) await ensureTeams(client, result.rows[0])
    if (leaderNames) await syncTeamLeaders(client, result.rows[0], leaderNames)
    if (selfName) await syncSelf(client, result.rows[0], selfName)
    if (leaderNames || selfName) {
      // The account is the representative's (or the jury member's or volunteer's own): emails and the page header greet them by this name.
      await client.query('UPDATE accounts SET full_name = $1, updated_at = now() WHERE id = $2', [body.nationalRepresentativeName, result.rows[0].account_id])
      if (!('singleRooms' in body)) await syncSingleRooms(client, result.rows[0].id)
    }
    // An invoice not paid yet follows the new numbers, as it does when Finance changes the fees, and the answers
    // reach the Team Leaders' and observers' records in People.
    if ('singleRooms' in body) {
      await syncSingleRooms(client, result.rows[0].id)
      const open = (await client.query(`SELECT id, fee_tier FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_proof', 'rejected')`, [result.rows[0].id])).rows
      for (const p of open) await client.query('UPDATE payments SET amount_due = $1, updated_at = now() WHERE id = $2', [delegationFees(fees, result.rows[0], p.fee_tier).total, p.id])
    }
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'delegation_updated', entityType: 'delegation', entityId: req.params.delegationId, details: { fields: Object.keys(req.body) } })
    return result.rows[0]
  })
  res.json({ delegation: camelizeRow(delegation) })
}))

const MAX_INVOICES = 5
const cents = (amount) => Math.round(Number(amount) * 100)

/**
 * The invoices a Team Leader asked for: one, or several with a payer and an amount each, which together must make
 * the total exactly. Returns [{ recipientName, recipientAddress, recipientTin, amount }].
 */
function cleanInvoices(body, total) {
  const one = (item, where) => {
    const tin = optionalString(item.recipientTin)
    if (tin && tin.length > 40) throw new HttpError(400, `${where}Tax identification number must be at most 40 characters.`)
    return { recipientName: requiredString(item.recipientName, `${where}Invoice recipient name`), recipientAddress: optionalString(item.recipientAddress), recipientTin: tin }
  }
  const list = Array.isArray(body.invoices) && body.invoices.length > 1 ? body.invoices : null
  if (!list) return [{ ...one(body, ''), amount: total }]
  if (list.length > MAX_INVOICES) throw new HttpError(400, `The fees can be split into at most ${MAX_INVOICES} invoices.`)
  const invoices = list.map((item, i) => {
    const where = `Invoice ${i + 1}: `
    const amount = Number(item.amount)
    // Whole cents only: 1200 or 1200.50, not 1200.505.
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - cents(amount)) > 1e-6) throw new HttpError(400, `${where}Enter an amount in US dollars, such as 1200 or 1200.50.`)
    return { ...one(item, where), amount: cents(amount) / 100 }
  })
  const sum = invoices.reduce((s, item) => s + cents(item.amount), 0)
  if (sum !== cents(total)) {
    const gap = (cents(total) - sum) / 100
    throw new HttpError(400, `The invoice amounts add up to USD ${(sum / 100).toLocaleString('en-US')}, not the total of USD ${total.toLocaleString('en-US')}. ${gap > 0 ? `Add USD ${gap.toLocaleString('en-US')}` : `Take off USD ${(-gap).toLocaleString('en-US')}`}.`)
  }
  return invoices
}

app.put('/api/registration/delegations/:delegationId/invoice', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const settings = await loadSettings(requireDb())
  const payment = await withTransaction(async (client) => {
    const delegation = (await client.query('SELECT * FROM delegations WHERE id = $1 FOR UPDATE', [req.params.delegationId])).rows[0]
    const fees = delegationFees(settings.fees, delegation)
    const invoices = cleanInvoices(req.body, fees.total)
    const [first] = invoices
    // The first invoice's payer is also kept in the payer columns, which a single invoice uses on its own.
    const values = [first.recipientName, first.recipientAddress, invoices.length, invoices.length > 1 ? JSON.stringify(invoices) : null, fees.total, fees.tier, first.recipientTin]
    // Locked once the proof of payment is in, as Team and observers is: saving recalculates the amount and the fee rate.
    if (!DELEGATION_ADMINS.includes(req.user.role) && await proofIsIn(client, delegation.id)) {
      throw new HttpError(409, 'Your proof of payment is uploaded, so the invoice details are locked. Email the organisers to change them.')
    }
    const open = (await openPaymentQuery(client, delegation.id)).rows[0]
    let row
    if (open) {
      row = (await client.query(
        `UPDATE payments SET invoice_recipient_name = $1, invoice_recipient_address = $2, invoice_count = $3, invoice_splits = $4, invoice_split_note = NULL,
           amount_due = $5, fee_tier = $6, invoice_recipient_tin = $7, updated_at = now() WHERE id = $8 RETURNING *`,
        [...values, open.id],
      )).rows[0]
    } else {
      const short = delegation.country_territory.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
      const reference = `${short}-IOL2027-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
      row = (await client.query(
        `INSERT INTO payments (delegation_id, invoice_recipient_name, invoice_recipient_address, invoice_count, invoice_splits, amount_due, fee_tier, invoice_recipient_tin,
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

// The invoice as a PDF: the same document the "registration submitted" email attaches. A split invoice is one file per
// payer: ?part=2 is the second (IOL2027/23-2).
app.get('/api/registration/delegations/:delegationId/invoice', ...signedIn, delegationAccess('read'), asyncHandler(async (req, res) => {
  const d = (await query('SELECT * FROM delegations WHERE id = $1', [req.params.delegationId])).rows[0]
  if (!d) throw new HttpError(404, 'Delegation not found.')
  const latest = (await query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC LIMIT 1', [d.id])).rows[0]
  if (!latest) throw new HttpError(409, 'Save the invoice details first.')
  const payment = await catchUpFeeTier(requireDb(), latest, (await loadSettings(requireDb())).fees)
  if (await splitsOutOfStep(d, payment)) throw new HttpError(409, 'The total has changed since the invoices were split. Update the invoice amounts in Payment, then download them again.')
  const parts = payment.invoice_splits?.length ?? 0
  const part = req.query.part === undefined ? null : Number(req.query.part)
  if (part !== null && !(parts && Number.isInteger(part) && part >= 1 && part <= parts)) throw new HttpError(404, parts ? `There are ${parts} invoices: choose one from 1 to ${parts}.` : 'This invoice is not split.')
  res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="${invoiceFilename(d, payment, part)}"`).send(await delegationInvoice(d, payment, part))
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
  if ('contestLanguage' in body) {
    const before = (await query('SELECT contest_language FROM teams WHERE id = $1', [req.params.teamId])).rows[0]
    await checkLanguageOpen(req, (optionalString(body.contestLanguage) ?? null) !== (before?.contest_language ?? null))
  }
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
  diet: 'diet',
  photoConsent: 'photo_consent',
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

/**
 * People can only be added or edited once proof of payment is uploaded (Team Leader flow), except by admins. It stays
 * open if Finance returns the proof ("rejected" only follows an upload); submitting still needs a proof not returned.
 */
async function requirePeopleOpen(req, delegationId) {
  if (DELEGATION_ADMINS.includes(req.user.role)) return
  // Some delegations have it open from the start (the account the IOL committee reviews the site with), and so do
  // jury members and volunteers, who pay nothing unless they bring an observer or ask for a single room.
  const early = await query('SELECT people_open_early, kind FROM delegations WHERE id = $1', [delegationId])
  if (early.rows[0]?.people_open_early || early.rows[0]?.kind !== 'country') return
  if (!(await proofIsIn(requireDb(), delegationId))) throw new HttpError(409, 'People opens once proof of payment is uploaded.')
}

/** Whether a proof of payment is in: with Finance, confirmed, or returned by Finance to be completed. */
async function proofIsIn(db, delegationId) {
  const result = await db.query(`SELECT 1 FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_review', 'approved', 'rejected') LIMIT 1`, [delegationId])
  return result.rowCount > 0
}

/** Renames a person's record; their badge and official names follow when they still matched the old name. */
async function renameMember(db, member, name, email, teamId = member.team_id) {
  if (member.display_name === name && member.email === email && member.team_id === teamId) return
  await db.query(
    `UPDATE members SET display_name = $1, email = $3, team_id = $4,
       badge_name = CASE WHEN badge_name IS NULL OR badge_name = '' OR badge_name = display_name THEN $1 ELSE badge_name END,
       official_name = CASE WHEN official_name = '' OR official_name = display_name THEN $1 ELSE official_name END,
       updated_at = now() WHERE id = $2`,
    [name, member.id, email, teamId],
  )
}

/**
 * The Team Leaders named in Team and observers, one for each team. Each team's record is the one assigned to it (or
 * one not assigned to a team yet); it is renamed when the name changes, so details entered in People stay. A new
 * record joins its team, and the national representative's own Team Leader record carries the account's email.
 */
async function syncTeamLeaders(db, delegation, names) {
  const teams = (await db.query('SELECT id FROM teams WHERE delegation_id = $1 ORDER BY code', [delegation.id])).rows
  const leaders = (await db.query(`SELECT * FROM members WHERE delegation_id = $1 AND role = 'team_leader' ORDER BY created_at`, [delegation.id])).rows
  const taken = new Set()
  const recordOf = (teamId) => leaders.find((l) => !taken.has(l.id) && l.team_id === teamId) ?? leaders.find((l) => !taken.has(l.id) && !l.team_id)
  for (const [i, name] of names.entries()) {
    if (!name || !teams[i]) continue
    const leader = recordOf(teams[i].id)
    const own = i === delegation.representative_team
    if (leader) {
      taken.add(leader.id)
      const email = own ? delegation.team_leader_email : leader.email === delegation.team_leader_email ? null : leader.email
      await renameMember(db, leader, name, email, teams[i].id)
    } else {
      await db.query(
        `INSERT INTO members (delegation_id, team_id, role, display_name, badge_name, official_name, email) VALUES ($1, $2, 'team_leader', $3, $3, $3, $4)`,
        [delegation.id, teams[i].id, name, own ? delegation.team_leader_email : null],
      )
    }
  }
}

/** A jury member's or volunteer's own record in People, named from their setup step, with the account's email. */
async function syncSelf(db, delegation, name) {
  const self = (await db.query('SELECT * FROM members WHERE delegation_id = $1 AND role = $2 ORDER BY created_at LIMIT 1', [delegation.id, delegation.kind])).rows[0]
  if (self) await renameMember(db, self, name, delegation.team_leader_email)
  else {
    await db.query(
      'INSERT INTO members (delegation_id, role, display_name, badge_name, official_name, email) VALUES ($1, $2, $3, $3, $3, $4)',
      [delegation.id, delegation.kind, name, delegation.team_leader_email],
    )
  }
}

/**
 * People must match Team and observers, which set the fees (IOL Board, 16 Nov 2026): four contestants for each team,
 * one Team Leader for each team (named in Team and observers), and the observers chosen there. The organisers can add
 * more (special guests) from the back office, so these limits are for the national representative.
 */
async function checkPlace(req, delegationId, role, teamId, memberId = null) {
  if (isAdmin(req)) return
  const d = (await query('SELECT number_of_teams, number_of_observers, kind FROM delegations WHERE id = $1', [delegationId])).rows[0]
  const others = (await query('SELECT role, team_id FROM members WHERE delegation_id = $1 AND id IS DISTINCT FROM $2', [delegationId, memberId])).rows
  const count = (test) => others.filter(test).length
  if (role === 'team_leader') throw new HttpError(400, 'Team Leaders are named in Team and observers. Add this person as a contestant or an observer, or change the Team Leaders there.')
  if (role === 'jury' || role === 'volunteer') throw new HttpError(400, 'This record is made from your own details in the first step.')
  if (role === 'contestant') {
    if (d.kind !== 'country') throw new HttpError(400, 'Only country delegations bring contestants.')
    const places = 4 * d.number_of_teams
    if (count((m) => m.role === 'contestant') >= places) throw new HttpError(400, `Your ${d.number_of_teams === 1 ? 'team has' : 'two teams have'} ${places} contestant places, and all are taken.`)
    if (teamId && count((m) => m.role === 'contestant' && m.team_id === teamId) >= 4) throw new HttpError(400, 'That team already has four contestants. Put this contestant in your other team.')
  }
  if (role === 'observer' && count((m) => m.role === 'observer') >= d.number_of_observers) {
    throw new HttpError(400, d.number_of_observers
      ? `You chose ${d.number_of_observers === 1 ? 'one observer' : `${d.number_of_observers} observers`} in Team and observers, and ${d.number_of_observers === 1 ? 'they are' : 'all are'} already in People. To bring another, add one in Team and observers (before the proof of payment), or email the organisers.`
      : 'You chose no observers in Team and observers. Add one there first (before the proof of payment), or email the organisers.')
  }
}

/** Contest languages lock 10 weeks before the Olympiad (IOL Board, 16 Nov 2026); the organisers can still change them. */
async function checkLanguageOpen(req, changing) {
  if (!changing || isAdmin(req)) return
  const { event } = await loadSettings(requireDb())
  if (pastDay(event.languageLock)) throw new HttpError(409, `Contest languages could be changed until ${longDate(event.languageLock)}. To change one now, email the organisers.`)
}

/** Diets are ticked from a list; "No special diet" stands alone. */
function cleanDiet(value) {
  if (value === null) return []
  if (!Array.isArray(value) || value.some((v) => !DIET_OPTIONS.includes(v))) throw new HttpError(400, 'Choose food options from the list.')
  const diet = [...new Set(value)]
  if (diet.includes('No special diet') && diet.length > 1) throw new HttpError(400, '“No special diet” cannot be ticked with other food options.')
  return diet
}

/**
 * Single rooms are chosen once, in Team and observers: one yes or no per Team Leader and per observer. Each person's
 * record follows in order (the first Team Leader gets the first answer, the first observer the first observer answer),
 * so People shows the answer rather than asking again.
 */
async function syncSingleRooms(db, delegationId) {
  const d = (await db.query('SELECT single_rooms FROM delegations WHERE id = $1', [delegationId])).rows[0]
  if (!d) return
  // A jury member's or volunteer's own answer is kept where a Team Leader's would be.
  const answers = { team_leader: d.single_rooms?.teamLeaders ?? [], observer: d.single_rooms?.observers ?? [] }
  const people = (await db.query(`SELECT id, role FROM members WHERE delegation_id = $1 AND role IN ('team_leader', 'observer', 'jury', 'volunteer') ORDER BY created_at`, [delegationId])).rows
  const seen = { team_leader: 0, observer: 0 }
  for (const person of people) {
    const kind = person.role === 'observer' ? 'observer' : 'team_leader'
    const answer = answers[kind][seen[kind]++]
    const value = answer === undefined ? null : answer ? 'single' : 'shared'
    await db.query('UPDATE members SET room_type_preference = $1, updated_at = now() WHERE id = $2 AND room_type_preference IS DISTINCT FROM $1', [value, person.id])
  }
}

async function checkTeamBelongs(teamId, delegationId) {
  if (!teamId) return
  const ok = await query('SELECT 1 FROM teams WHERE id = $1 AND delegation_id = $2', [teamId, delegationId])
  if (!ok.rowCount) throw new HttpError(400, 'That team belongs to another delegation.')
}

app.post('/api/registration/delegations/:delegationId/members', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  await requirePeopleOpen(req, req.params.delegationId)
  const body = { ...req.body, role: normalizeRole(req.body.role || 'contestant') }
  delete body.roomTypePreference // set from Team and observers (syncSingleRooms)
  await checkTeamBelongs(body.teamId, req.params.delegationId)
  await checkPlace(req, req.params.delegationId, body.role, body.teamId)
  await checkLanguageOpen(req, Boolean(optionalString(body.examLanguage)))
  if ('diet' in body) body.diet = cleanDiet(body.diet)
  if ('photoConsent' in body && body.photoConsent !== null && typeof body.photoConsent !== 'boolean') throw new HttpError(400, 'Answer yes or no to photo and video consent.')
  requiredString(body.displayName, 'Display name')
  const entries = Object.entries(memberFields).filter(([key]) => key in body)
  const columns = ['delegation_id', ...entries.map(([, column]) => column)]
  const values = [req.params.delegationId, ...entries.map(([key]) => (body[key] === '' ? null : body[key]))]
  const result = await query(
    `INSERT INTO members (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    values,
  )
  await syncSingleRooms(requireDb(), req.params.delegationId)
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'member_added', entityType: 'member', entityId: result.rows[0].id })
  consentFormsWhenReady(req.params.delegationId)
  res.status(201).json({ member: camelizeRow((await query('SELECT * FROM members WHERE id = $1', [result.rows[0].id])).rows[0]) })
}))

app.patch('/api/registration/members/:memberId', ...signedIn, childAccess('members', 'memberId'), asyncHandler(async (req, res) => {
  await requirePeopleOpen(req, req.delegationId)
  const body = { ...req.body }
  delete body.roomTypePreference // set from Team and observers (syncSingleRooms)
  const before = (await query('SELECT role, team_id, exam_language FROM members WHERE id = $1', [req.params.memberId])).rows[0]
  // Team Leaders (and a jury member's or volunteer's own record) come from the first step: their role and team are set there.
  const fromSetup = ['team_leader', 'jury', 'volunteer'].includes(before.role)
  if (fromSetup && !isAdmin(req)) {
    if (body.role && normalizeRole(body.role) !== before.role) throw new HttpError(400, before.role === 'team_leader' ? 'Team Leaders are named in Team and observers. Change them there.' : 'Your own record stays as it is.')
    delete body.role
    delete body.teamId
  }
  if (body.role) body.role = normalizeRole(body.role)
  await checkTeamBelongs(body.teamId, req.delegationId)
  const role = body.role ?? before.role
  const teamId = 'teamId' in body ? body.teamId : before.team_id
  if (role !== before.role || (role === 'contestant' && teamId && teamId !== before.team_id)) await checkPlace(req, req.delegationId, role, teamId, req.params.memberId)
  if ('examLanguage' in body) await checkLanguageOpen(req, (optionalString(body.examLanguage) ?? null) !== (before.exam_language ?? null))
  if ('diet' in body) body.diet = cleanDiet(body.diet)
  if ('photoConsent' in body && body.photoConsent !== null && typeof body.photoConsent !== 'boolean') throw new HttpError(400, 'Answer yes or no to photo and video consent.')
  const { sets, values } = buildUpdate(body, memberFields)
  values.push(req.params.memberId)
  await query(`UPDATE members SET ${sets.join(', ')} WHERE id = $${values.length}`, values)
  if (body.role) await syncSingleRooms(requireDb(), req.delegationId)
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'member_updated', entityType: 'member', entityId: req.params.memberId, details: { fields: Object.keys(req.body) } })
  consentFormsWhenReady(req.delegationId)
  res.json({ member: camelizeRow((await query('SELECT * FROM members WHERE id = $1', [req.params.memberId])).rows[0]) })
}))

app.delete('/api/registration/members/:memberId', ...signedIn, childAccess('members', 'memberId'), asyncHandler(async (req, res) => {
  const gone = (await query('SELECT role FROM members WHERE id = $1', [req.params.memberId])).rows[0]
  if (!isAdmin(req) && gone?.role === 'team_leader') throw new HttpError(400, 'Team Leaders are named in Team and observers. Change them there instead.')
  if (!isAdmin(req) && ['jury', 'volunteer'].includes(gone?.role)) throw new HttpError(400, 'Your own record cannot be removed.')
  await query('DELETE FROM members WHERE id = $1', [req.params.memberId])
  await syncSingleRooms(requireDb(), req.delegationId)
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'member_removed', entityType: 'member', entityId: req.params.memberId })
  res.status(204).end()
}))

// A jury member's or volunteer's photo, cropped in the portal to one frame (4:5, JPEG or PNG). A new one replaces the old.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => (['image/jpeg', 'image/png'].includes(file.mimetype) ? callback(null, true) : callback(new HttpError(400, 'The photo must be a JPG or PNG.'))),
})
app.post('/api/registration/members/:memberId/photo', ...signedIn, childAccess('members', 'memberId'), photoUpload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a photo to upload.')
  const storedPath = await saveUpload(`${req.delegationId}/photo-${req.params.memberId}-${crypto.randomUUID()}${req.file.mimetype === 'image/png' ? '.png' : '.jpg'}`, req.file)
  const attachment = await withTransaction(async (client) => {
    await client.query(`DELETE FROM attachments WHERE member_id = $1 AND kind = 'photo'`, [req.params.memberId])
    const row = (await client.query(
      `INSERT INTO attachments (delegation_id, member_id, kind, original_filename, stored_path, mime_type, size_bytes, uploaded_by_account_id)
       VALUES ($1, $2, 'photo', $3, $4, $5, $6, $7)
       RETURNING id, delegation_id, member_id, kind, original_filename, mime_type, size_bytes, created_at`,
      [req.delegationId, req.params.memberId, req.file.originalname || 'photo.jpg', storedPath, req.file.mimetype, req.file.size, req.user.id],
    )).rows[0]
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'photo_uploaded', entityType: 'member', entityId: req.params.memberId })
    return row
  })
  res.status(201).json({ attachment: camelizeRow(attachment) })
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

// ── Consent forms (meeting of 24 Nov 2026) ───────────────────────────────────────────────────────────────────────────
// The national representative gets everyone's form (by email once People is complete, and here to download), has them
// signed, uploads the signed forms (one file for everyone or several) and ticks for each person whether they consent.
// The organisers go by the ticks and keep the files as evidence; nobody reads the files.
const consentCountry = (d) => (d.kind === 'jury' ? 'IOL 2027 jury' : d.kind === 'volunteer' ? 'IOL 2027 volunteers' : d.country_territory)
const MAX_CONSENT_FILES = 30

app.get('/api/registration/members/:memberId/consent-form', ...signedIn, childAccess('members', 'memberId', 'read'), asyncHandler(async (req, res) => {
  const member = (await query('SELECT * FROM members WHERE id = $1', [req.params.memberId])).rows[0]
  const d = (await query('SELECT kind, country_territory FROM delegations WHERE id = $1', [member.delegation_id])).rows[0]
  if (!consentFormKind(member)) throw new HttpError(409, `Enter ${member.display_name}’s date of birth in People first: it decides which form they sign.`)
  const pdf = await consentPdf(member, consentCountry(d))
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${consentFileName(member, consentCountry(d))}"`)
  res.send(pdf)
}))

/** Everyone's forms as email attachments; people whose date of birth is not in yet are left out. */
async function consentAttachments(delegationId) {
  const d = (await query('SELECT * FROM delegations WHERE id = $1', [delegationId])).rows[0]
  const members = (await query(`SELECT * FROM members WHERE delegation_id = $1 ORDER BY CASE role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 ELSE 2 END, created_at`, [delegationId])).rows
  const people = []
  const attachments = []
  for (const member of members) {
    const form = consentFormKind(member)
    if (!form) continue
    people.push({ name: member.display_name, form })
    attachments.push({ filename: consentFileName(member, consentCountry(d)), content: await consentPdf(member, consentCountry(d)), contentType: 'application/pdf' })
  }
  return { d, people, attachments }
}

async function emailConsentForms(delegationId, again = false) {
  const { d, people, attachments } = await consentAttachments(delegationId)
  if (!people.length) throw new HttpError(409, 'Enter everyone’s date of birth in People first: it decides which form each person signs.')
  await query('UPDATE delegations SET consent_forms_emailed_at = now() WHERE id = $1', [delegationId])
  await sendEmail({
    pool: requireDb(), to: d.team_leader_email, purpose: again ? 'consent_forms_again' : 'consent_forms', delegationId, retry: true, attachments,
    ...buildConsentFormsEmail({ fullName: d.national_representative_name, countryTerritory: consentCountry(d), people, url: `${portalUrl}/?step=consent`, again }),
  })
  return people.length
}

/** Once every person in People is complete, their forms go out by themselves, once. */
async function emailConsentFormsWhenReady(delegationId) {
  const d = (await query('SELECT * FROM delegations WHERE id = $1', [delegationId])).rows[0]
  if (!d || d.consent_forms_emailed_at) return
  const members = (await query('SELECT * FROM members WHERE delegation_id = $1', [delegationId])).rows
  const expected = d.kind === 'country' ? 5 * d.number_of_teams + d.number_of_observers : 1 + d.number_of_observers
  if (members.length < expected || members.some((m) => missingMemberDetails(m).length)) return
  await emailConsentForms(delegationId)
}
const consentFormsWhenReady = (delegationId) => { emailConsentFormsWhenReady(delegationId).catch((e) => console.error(`consent forms: ${e.message}`)) }

app.post('/api/registration/delegations/:delegationId/consent-forms/email', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const sent = await emailConsentForms(req.params.delegationId, true)
  res.json({ sent, emailedAt: (await query('SELECT consent_forms_emailed_at FROM delegations WHERE id = $1', [req.params.delegationId])).rows[0].consent_forms_emailed_at })
}))

// Whether each person consents, as on their signed form: { answers: [{ memberId, consents: true | false | null }] }.
app.put('/api/registration/delegations/:delegationId/consents', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  await requirePeopleOpen(req, req.params.delegationId)
  const answers = req.body?.answers
  if (!Array.isArray(answers) || answers.some((a) => typeof a?.memberId !== 'string' || (a.consents !== null && typeof a.consents !== 'boolean'))) {
    throw new HttpError(400, 'Tick, for each person, whether they consent or not.')
  }
  await withTransaction(async (client) => {
    for (const { memberId, consents } of answers) {
      const updated = await client.query('UPDATE members SET photo_consent = $1, updated_at = now() WHERE id = $2 AND delegation_id = $3', [consents, memberId, req.params.delegationId])
      if (!updated.rowCount) throw new HttpError(400, 'A person in this list belongs to another registration.')
    }
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'consents_saved', entityType: 'delegation', entityId: req.params.delegationId, details: { answers: answers.length } })
  })
  res.json({ members: camelizeRows((await query('SELECT id, photo_consent FROM members WHERE delegation_id = $1', [req.params.delegationId])).rows) })
}))

// The signed forms: one PDF for everyone, or a file for each person, or photos of printed forms. Each upload adds to them.
app.post('/api/registration/delegations/:delegationId/consent-files', ...signedIn, delegationAccess('write'), upload.array('files', MAX_CONSENT_FILES), asyncHandler(async (req, res) => {
  await requirePeopleOpen(req, req.params.delegationId)
  const files = req.files ?? []
  if (!files.length) throw new HttpError(400, 'Choose the signed consent forms to upload.')
  const already = (await query(`SELECT count(*)::int AS n FROM attachments WHERE delegation_id = $1 AND kind = 'consent_form'`, [req.params.delegationId])).rows[0].n
  if (already + files.length > MAX_CONSENT_FILES) throw new HttpError(400, `Up to ${MAX_CONSENT_FILES} files. Put several forms in one PDF, or remove files you no longer need.`)
  const stored = []
  for (const file of files) stored.push(await saveUpload(`${req.params.delegationId}/consent-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.bin'}`, file))
  const attachments = await withTransaction(async (client) => {
    const rows = []
    for (const [i, file] of files.entries()) {
      rows.push((await client.query(
        `INSERT INTO attachments (delegation_id, kind, original_filename, stored_path, mime_type, size_bytes, uploaded_by_account_id)
         VALUES ($1, 'consent_form', $2, $3, $4, $5, $6)
         RETURNING id, delegation_id, member_id, kind, original_filename, mime_type, size_bytes, created_at`,
        [req.params.delegationId, file.originalname, stored[i], file.mimetype, file.size, req.user.id],
      )).rows[0])
    }
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'consent_forms_uploaded', entityType: 'delegation', entityId: req.params.delegationId, details: { originalFilenames: files.map((f) => f.originalname) } })
    return rows
  })
  res.status(201).json({ attachments: camelizeRows(attachments) })
}))

// A signed form uploaded by mistake. Once the registration is submitted, one file must stay.
app.delete('/api/registration/attachments/:attachmentId/consent', ...signedIn, asyncHandler(async (req, res) => {
  const attachment = (await query(`SELECT * FROM attachments WHERE id = $1 AND kind = 'consent_form'`, [req.params.attachmentId])).rows[0]
  if (!attachment) throw new HttpError(404, 'File not found.')
  await authorizeDelegation(req, attachment.delegation_id, 'write')
  await requirePeopleOpen(req, attachment.delegation_id)
  const d = (await query('SELECT registration_status FROM delegations WHERE id = $1', [attachment.delegation_id])).rows[0]
  const others = (await query(`SELECT count(*)::int AS n FROM attachments WHERE delegation_id = $1 AND kind = 'consent_form' AND id <> $2`, [attachment.delegation_id, attachment.id])).rows[0].n
  if (d.registration_status !== 'draft' && !others) throw new HttpError(409, 'Your registration is submitted, so one file of signed forms must stay. Upload the right one first, then remove this one.')
  await withTransaction(async (client) => {
    await client.query('DELETE FROM attachments WHERE id = $1', [attachment.id])
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: attachment.delegation_id, eventType: 'consent_form_removed', entityType: 'attachment', entityId: attachment.id, details: { originalFilename: attachment.original_filename } })
  })
  res.json({ ok: true })
}))

async function setTripPeople(db, travelRecordId, delegationId, peopleIds) {
  if (!Array.isArray(peopleIds)) return
  // Each person arrives once and leaves once: someone already on another trip that way is taken off it first.
  const clash = (await db.query(
    `SELECT DISTINCT m.display_name, tr.direction FROM travel_record_people trp
     JOIN travel_records tr ON tr.id = trp.travel_record_id JOIN members m ON m.id = trp.member_id
     WHERE tr.delegation_id = $1 AND tr.id <> $2 AND trp.member_id = ANY($3)
       AND tr.direction = (SELECT direction FROM travel_records WHERE id = $2)`,
    [delegationId, travelRecordId, peopleIds],
  )).rows
  if (clash.length) {
    const names = clash.map((c) => c.display_name)
    throw new HttpError(400, `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} already on another ${clash[0].direction}. Take ${names.length === 1 ? 'them' : 'them'} off that one first: each person has one arrival and one departure.`)
  }
  await db.query('DELETE FROM travel_record_people WHERE travel_record_id = $1', [travelRecordId])
  for (const memberId of peopleIds) {
    const own = await db.query('SELECT 1 FROM members WHERE id = $1 AND delegation_id = $2', [memberId, delegationId])
    if (!own.rowCount) throw new HttpError(400, 'A person on this trip belongs to another delegation.')
    await db.query('INSERT INTO travel_record_people (travel_record_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [travelRecordId, memberId])
  }
}

/**
 * Checks a trip: after the travel deadline only the organisers change flights; airport pickup and drop-off are from
 * Suvarnabhumi or Don Mueang only (anyone else makes their own way); dates fall around the programme.
 */
async function checkTrip(req, body, existing = null) {
  const { event } = await loadSettings(requireDb())
  if (!isAdmin(req) && pastDay(event.travelDeadline)) throw new HttpError(409, `Travel details could be changed until ${longDate(event.travelDeadline)}. To change a flight now, email the organisers.`)
  const transport = body.transport ?? existing?.transport ?? 'organisers'
  if (!['organisers', 'own'].includes(transport)) throw new HttpError(400, 'Choose airport pickup, or your own way to the hotel.')
  const point = 'travelPoint' in body ? optionalString(body.travelPoint) : existing?.travel_point
  if (transport === 'organisers' && point && !AIRPORTS.includes(point)) throw new HttpError(400, 'Airport pickup and drop-off are from Suvarnabhumi (BKK) or Don Mueang (DMK) only. Choose one of them, or say you will make your own way.')
  const date = optionalString(body.localDate)
  if (date && (date < TRAVEL_WINDOW.first || date > TRAVEL_WINDOW.last)) throw new HttpError(400, `Enter a date between ${longDate(TRAVEL_WINDOW.first)} and ${longDate(TRAVEL_WINDOW.last)}. The Olympiad runs from 21 to 28 July 2027.`)
  return transport
}

app.post('/api/registration/delegations/:delegationId/travel', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const transport = await checkTrip(req, req.body)
  const travel = await withTransaction(async (client) => {
    const row = (await client.query(
      `INSERT INTO travel_records (delegation_id, direction, travel_point, flight_service_number, local_date, local_time, terminal, change_status, transport)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.delegationId, normalizeDirection(req.body.direction), transport === 'own' ? null : optionalString(req.body.travelPoint), optionalString(req.body.flightServiceNumber),
        optionalString(req.body.localDate), optionalString(req.body.localTime), optionalString(req.body.terminal), normalizeChangeStatus(req.body.changeStatus), transport],
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
  const existing = (await query('SELECT * FROM travel_records WHERE id = $1', [req.params.travelRecordId])).rows[0]
  const transport = await checkTrip(req, req.body, existing)
  const travel = await withTransaction(async (client) => {
    const body = { ...req.body, transport }
    if (transport === 'own') body.travelPoint = null
    if (body.changeStatus) body.changeStatus = normalizeChangeStatus(body.changeStatus)
    const { sets, values } = buildUpdate(body, { travelPoint: 'travel_point', flightServiceNumber: 'flight_service_number', localDate: 'local_date', localTime: 'local_time', terminal: 'terminal', changeStatus: 'change_status', transport: 'transport' })
    values.push(req.params.travelRecordId)
    const result = await client.query(`UPDATE travel_records SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    await setTripPeople(client, req.params.travelRecordId, req.delegationId, req.body.peopleIds)
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'travel_saved', entityType: 'travel_record', entityId: req.params.travelRecordId })
    return result.rows[0]
  })
  await sendBadgesIfSettled(req.delegationId).catch((e) => console.error(e.message))
  res.json({ travelRecord: camelizeRow(travel) })
}))

// A trip added by mistake, or a flight that was cancelled.
app.delete('/api/registration/travel/:travelRecordId', ...signedIn, childAccess('travel', 'travelRecordId'), asyncHandler(async (req, res) => {
  const { event } = await loadSettings(requireDb())
  if (!isAdmin(req) && pastDay(event.travelDeadline)) throw new HttpError(409, `Travel details could be changed until ${longDate(event.travelDeadline)}. To change a flight now, email the organisers.`)
  await query('DELETE FROM travel_records WHERE id = $1', [req.params.travelRecordId])
  await insertAudit(requireDb(), { actorAccountId: req.user.id, delegationId: req.delegationId, eventType: 'travel_removed', entityType: 'travel_record', entityId: req.params.travelRecordId })
  res.status(204).end()
}))

// The proof of payment is one or more files: each upload adds to it (the bank's confirmation for each transfer, say)
// and sends it to Finance again. A file can be removed until Finance confirms the payment, as long as one stays.
app.post('/api/registration/delegations/:delegationId/payment-proof', ...signedIn, delegationAccess('write'), upload.array('proof', MAX_PROOF_FILES), asyncHandler(async (req, res) => {
  const files = req.files ?? []
  if (!files.length) throw new HttpError(400, 'Choose the proof of transfer to upload.')
  const stored = []
  for (const file of files) {
    const extension = path.extname(file.originalname).toLowerCase() || '.bin'
    stored.push(await saveUpload(`${req.params.delegationId}/proof-${crypto.randomUUID()}${extension}`, file))
  }
  const response = await withTransaction(async (client) => {
    const open = (await openPaymentQuery(client, req.params.delegationId)).rows[0]
    if (!open) throw new HttpError(409, 'Save the invoice details before uploading proof.')
    // The fee is set by the day the proof is received: an early-bird invoice whose proof comes later is at the regular fee.
    const payment = await catchUpFeeTier(client, open, (await loadSettings(client)).fees)
    const already = (await client.query('SELECT count(*)::int AS n FROM attachments WHERE payment_id = $1', [payment.id])).rows[0].n
    if (already + files.length > MAX_PROOF_FILES) throw new HttpError(400, `The proof can have up to ${MAX_PROOF_FILES} files. Remove ${already ? 'one you no longer need' : 'some'} first, or put several in one PDF.`)
    const attachments = []
    for (const [i, file] of files.entries()) {
      attachments.push((await client.query(
        `INSERT INTO attachments (delegation_id, payment_id, kind, original_filename, stored_path, mime_type, size_bytes, uploaded_by_account_id)
         VALUES ($1, $2, 'payment_proof', $3, $4, $5, $6, $7)
         RETURNING id, delegation_id, payment_id, kind, original_filename, mime_type, size_bytes, created_at`,
        [req.params.delegationId, payment.id, file.originalname, stored[i], file.mimetype, file.size, req.user.id],
      )).rows[0])
    }
    const updated = (await client.query(
      `UPDATE payments SET proof_attachment_id = COALESCE(proof_attachment_id, $1), status = 'awaiting_review', review_note = NULL, updated_at = now() WHERE id = $2 RETURNING *`,
      [attachments[0].id, payment.id],
    )).rows[0]
    await client.query(`UPDATE delegations SET payment_status = 'awaiting_review', updated_at = now() WHERE id = $1`, [req.params.delegationId])
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: req.params.delegationId, eventType: 'payment_proof_uploaded', entityType: 'payment', entityId: payment.id, details: { originalFilenames: files.map((f) => f.originalname) } })
    return { payment: updated, attachments }
  })

  const d = (await query('SELECT country_territory, team_leader_email, national_representative_name FROM delegations WHERE id = $1', [req.params.delegationId])).rows[0]
  const emailCtx = {
    countryTerritory: d.country_territory, fullName: d.national_representative_name, paymentReference: response.payment.payment_reference,
    amountDue: response.payment.amount_due, currency: response.payment.currency || 'USD', invoiceCount: response.payment.invoice_count,
    proofFilename: files.map((f) => f.originalname).join(', '), delegationId: req.params.delegationId, peopleUrl: `${portalUrl}/?step=people`,
  }
  sendEmail({ pool: requireDb(), to: d.team_leader_email, ...buildProofReceivedEmail(emailCtx), purpose: 'payment_proof_received', delegationId: req.params.delegationId, retry: true }).catch((e) => console.error(e.message))
  if (process.env.FINANCE_EMAIL) {
    sendEmail({ pool: requireDb(), to: process.env.FINANCE_EMAIL, ...buildFinanceAlertEmail(emailCtx), purpose: 'finance_proof_alert', delegationId: req.params.delegationId, retry: true }).catch((e) => console.error(e.message))
  }
  res.status(201).json({ payment: camelizeRow(response.payment), attachments: camelizeRows(response.attachments) })
}))

// A proof file uploaded by mistake. It is unlinked from the payment, not deleted, so the record of what was sent stays.
app.delete('/api/registration/attachments/:attachmentId/proof', ...signedIn, asyncHandler(async (req, res) => {
  const attachment = (await query(`SELECT * FROM attachments WHERE id = $1 AND kind = 'payment_proof' AND payment_id IS NOT NULL`, [req.params.attachmentId])).rows[0]
  if (!attachment) throw new HttpError(404, 'File not found.')
  await authorizeDelegation(req, attachment.delegation_id, 'write')
  const payment = await withTransaction(async (client) => {
    const row = (await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [attachment.payment_id])).rows[0]
    if (!row || !['awaiting_review', 'rejected'].includes(row.status)) throw new HttpError(409, 'Finance has confirmed this payment, so its proof can no longer change.')
    const others = (await client.query('SELECT id FROM attachments WHERE payment_id = $1 AND id <> $2 ORDER BY created_at', [row.id, attachment.id])).rows
    if (!others.length) throw new HttpError(409, 'This is the only file of your proof. Upload the right one first, then remove this one.')
    await client.query('UPDATE attachments SET payment_id = NULL WHERE id = $1', [attachment.id])
    const updated = (await client.query(
      `UPDATE payments SET proof_attachment_id = CASE WHEN proof_attachment_id = $1 THEN $2 ELSE proof_attachment_id END, updated_at = now() WHERE id = $3 RETURNING *`,
      [attachment.id, others[0].id, row.id],
    )).rows[0]
    await insertAudit(client, { actorAccountId: req.user.id, delegationId: attachment.delegation_id, eventType: 'payment_proof_file_removed', entityType: 'attachment', entityId: attachment.id, details: { originalFilename: attachment.original_filename } })
    return updated
  })
  res.json({ payment: camelizeRow(payment) })
}))

app.get('/api/registration/attachments/:attachmentId', ...signedIn, asyncHandler(async (req, res) => {
  const attachment = (await query('SELECT * FROM attachments WHERE id = $1', [req.params.attachmentId])).rows[0]
  if (!attachment) throw new HttpError(404, 'File not found.')
  if (req.user.role === 'finance_admin') {
    if (attachment.kind !== 'payment_proof') throw new HttpError(404, 'File not found.')
  } else {
    await authorizeDelegation(req, attachment.delegation_id, req.user.role === 'welfare_staff' ? 'none' : 'read')
  }
  // ?inline=1 lets staff preview a proof in the page. Only PDFs and images are ever stored, and nosniff
  // stops the browser from treating a file as anything other than its declared type.
  res.set('Content-Type', attachment.mime_type)
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${attachment.original_filename.replace(/[^\w.\- ]/g, '_')}"`)
  ;(await readUpload(attachment.stored_path)).on('error', (e) => { console.error(e.message); res.destroy() }).pipe(res)
}))

/** Server-side check of what still blocks submission. */
async function missingForSubmission(delegationId) {
  const d = (await query('SELECT * FROM delegations WHERE id = $1', [delegationId])).rows[0]
  const country = d.kind === 'country'
  const settings = await loadSettings(requireDb())
  const missing = []
  const steps = country
    ? [['setup', 'Team and observers'], ['teams', 'Teams'], ['people', 'People'], ['travel', 'Travel'], ['welfare', 'Review and requests']]
    : [['setup', 'About you'], ['people', 'Your details'], ['travel', 'Travel'], ['welfare', 'Review and requests']]
  for (const [step, label] of steps) {
    if (!d.completed_steps.includes(step)) missing.push(`Finish “${label}”`)
  }
  // A jury member or volunteer pays only for an observer or a single room.
  if (country || delegationFees(settings.fees, d).total > 0) {
    const paid = await query(`SELECT 1 FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_review', 'approved')`, [delegationId])
    if (!paid.rowCount) missing.push('Upload proof of payment')
  }
  const teams = (await query('SELECT id, name, contest_language FROM teams WHERE delegation_id = $1 ORDER BY code', [delegationId])).rows
  if (country) for (const team of teams.filter((t) => !t.contest_language)) missing.push(`${team.name}: working language missing`)
  const members = await query(
    `SELECT m.*, EXISTS (SELECT 1 FROM attachments a WHERE a.member_id = m.id AND a.kind = 'guardian_consent') AS has_consent,
       EXISTS (SELECT 1 FROM attachments a WHERE a.member_id = m.id AND a.kind = 'photo') AS has_photo
     FROM members m WHERE m.delegation_id = $1 ORDER BY m.created_at`,
    [delegationId],
  )
  for (const member of members.rows) {
    const gaps = missingMemberDetails(member)
    if (needsGuardianConsent(member, settings.guardianConsent) && !member.has_consent) gaps.push('guardian consent form')
    if (['jury', 'volunteer'].includes(member.role) && !member.has_photo) gaps.push('photo')
    if (gaps.length) missing.push(`${member.display_name}: ${gaps.join(', ')}`)
  }
  // People must match what the fees were worked out from (Team and observers): four contestants and a Team Leader
  // for each team, and the observers chosen (IOL Board, 16 Nov 2026).
  if (country) {
    const leaders = members.rows.filter((m) => m.role === 'team_leader').length
    if (leaders < d.number_of_teams) missing.push(`Team Leaders: name one for each team in Team and observers`)
    for (const team of teams) {
      const n = members.rows.filter((m) => m.role === 'contestant' && m.team_id === team.id).length
      if (n !== 4) missing.push(`${team.name}: ${n} of 4 contestants in People`)
    }
  } else if (!members.rows.some((m) => m.role === d.kind)) missing.push('Your details: enter your name in the first step')
  const observers = members.rows.filter((m) => m.role === 'observer').length
  if (observers !== d.number_of_observers) missing.push(`Observers: ${d.number_of_observers} in ${country ? 'Team and observers' : 'the first step'}, ${observers} in People`)
  // Everyone is on an arrival and a departure, those who make their own way too (meeting of 24 Nov 2026).
  if (members.rows.length) for (const gap of await missingTravel(delegationId)) missing.push(`Travel: ${gap}`)
  // Consent forms (meeting of 24 Nov 2026): the signed forms uploaded, and a tick for each person.
  const unanswered = members.rows.filter((m) => m.photo_consent === null || m.photo_consent === undefined)
  if (unanswered.length) missing.push(`Consent forms: tick whether ${unanswered.map((m) => m.display_name).join(', ')} ${unanswered.length === 1 ? 'consents' : 'consent'}`)
  const consentFiles = (await query(`SELECT 1 FROM attachments WHERE delegation_id = $1 AND kind = 'consent_form' LIMIT 1`, [delegationId])).rowCount
  if (!consentFiles) missing.push('Consent forms: upload the signed forms')
  const payment = (await query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC LIMIT 1', [delegationId])).rows[0]
  if (await splitsOutOfStep(d, payment)) missing.push('Invoice amounts: update them in Payment, the total has changed')
  return { delegation: d, missing }
}

// Registrations not submitted yet and what each still needs, for the registration team to follow up (IOL Board, 16 Nov 2026).
app.get('/api/admin/incomplete', ...signedIn, requireRole('registration_admin', 'viewer'), asyncHandler(async (_req, res) => {
  const drafts = (await query(`SELECT id FROM delegations WHERE registration_status = 'draft' ORDER BY kind, country_territory`)).rows
  const rows = []
  for (const { id } of drafts) {
    const { delegation: d, missing } = await missingForSubmission(id)
    const lastEmail = (await query(`SELECT purpose, created_at FROM email_deliveries WHERE delegation_id = $1 AND purpose LIKE 'reminder_%' ORDER BY created_at DESC LIMIT 1`, [id])).rows[0]
    rows.push({
      id, countryTerritory: d.country_territory, kind: d.kind, name: d.national_representative_name, email: d.team_leader_email, paymentStatus: d.payment_status,
      updatedAt: d.updated_at, createdAt: d.created_at, missing, lastReminder: lastEmail ? { purpose: lastEmail.purpose, sentAt: lastEmail.created_at } : null,
    })
  }
  res.json({ registrations: rows })
}))

app.post('/api/registration/delegations/:delegationId/submit', ...signedIn, delegationAccess('write'), asyncHandler(async (req, res) => {
  const { delegation: current, missing } = await missingForSubmission(req.params.delegationId)
  if (current.registration_status !== 'draft') throw new HttpError(409, 'This registration has already been submitted.')
  if (missing.length) return res.status(409).json({ error: 'Finish the remaining steps first.', missing })
  // Both notices on Submit must be ticked: the royal reception's dress code and protocol, and travel insurance.
  if (req.body?.acknowledgeDressCode !== true || req.body?.acknowledgeInsurance !== true) {
    throw new HttpError(400, 'Tick both boxes above the Submit button: the dress code and protocol, and travel insurance.')
  }
  const submitted = await withTransaction(async (client) => {
    const row = (await client.query(
      `UPDATE delegations SET registration_status = 'submitted', submitted_at = now(), dress_code_acknowledged_at = now(), insurance_acknowledged_at = now(), updated_at = now()
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

/** The "registration submitted" email with the invoice PDF attached, then the badges if everything is already in. */
async function notifySubmitted(d) {
  const [payment, travelGaps] = await Promise.all([
    query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC LIMIT 1', [d.id]).then((r) => r.rows[0] ?? null),
    missingTravel(d.id),
  ])
  // A split invoice is attached as one PDF per payer, as each payer pays their own.
  const parts = payment?.invoice_splits?.length ? payment.invoice_splits.map((_, i) => i + 1) : [null]
  const attachments = await Promise.all(parts.map(async (part) => ({ filename: invoiceFilename(d, payment, part), content: await delegationInvoice(d, payment, part), contentType: 'application/pdf' })))
  const { subject, html } = buildRegistrationSubmittedEmail({
    countryTerritory: d.country_territory, fullName: d.national_representative_name, numberOfTeams: d.number_of_teams, numberOfObservers: d.number_of_observers,
    paymentConfirmed: payment?.status === 'approved', travelComplete: !travelGaps.length, travelUrl: `${portalUrl}/?step=travel`,
  })
  // Kept and tried again if sending fails, so the badges below do not wait on it.
  await sendEmail({ pool: requireDb(), to: d.team_leader_email, subject, html, attachments, purpose: 'registration_submitted', delegationId: d.id, retry: true })
  await sendBadgesIfSettled(d.id)
}

/**
 * The delegation's invoice PDF, priced at the fee tier the invoice was issued at, so its total and due date hold.
 * `part` (from 1) is one payer's invoice of a split; without it, every invoice.
 */
async function delegationInvoice(d, payment, part = null) {
  const settings = await loadSettings(requireDb())
  return invoicePdf({ delegation: d, payment, fees: delegationFees(settings.fees, d, payment?.fee_tier), invoice: settings.invoice, part })
}

/**
 * The fee depends on the day the proof of payment is received. An invoice still waiting for its proof after the last
 * early-bird day moves to the regular fee (a split one then asks for its amounts again, see splitsOutOfStep). A proof
 * already received keeps its tier, also when Finance returns it for a missing file.
 */
async function catchUpFeeTier(db, payment, fees) {
  if (payment?.status !== 'awaiting_proof' || payment.fee_tier !== 'early_bird' || !pastEarlyBirdGrace(fees)) return payment
  const d = (await db.query('SELECT * FROM delegations WHERE id = $1', [payment.delegation_id])).rows[0]
  const updated = (await db.query(
    `UPDATE payments SET fee_tier = 'normal', amount_due = $1, updated_at = now() WHERE id = $2 AND status = 'awaiting_proof' AND fee_tier = 'early_bird' RETURNING *`,
    [delegationFees(fees, d, 'normal').total, payment.id],
  )).rows[0]
  if (updated) await insertAudit(db, { actorAccountId: null, delegationId: d.id, eventType: 'fee_tier_changed', entityType: 'payment', entityId: payment.id, details: { feeTier: 'normal', reason: 'proof not received by the last early-bird day' } })
  return updated ?? payment
}

/** True when an unpaid invoice was split for a total that has since changed (more observers, a single room). */
async function splitsOutOfStep(d, payment) {
  if (!payment?.invoice_splits || !['awaiting_proof', 'rejected'].includes(payment.status)) return false
  const { fees } = await loadSettings(requireDb())
  const total = delegationFees(fees, d, payment.fee_tier).total
  return payment.invoice_splits.reduce((sum, item) => sum + cents(item.amount), 0) !== cents(total)
}

function invoiceFilename(d, payment, part = null) {
  const number = payment?.invoice_number?.split('/')[1]
  return `IOL2027-invoice-${number ? `${number}-${part ? `${part}-` : ''}` : ''}${d.country_territory.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')}.pdf`
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

/** Whose badge it is, as the scanner shows it: name, role, and country (or assignment, for staff). */
const badgeHolder = (c) => ({
  kind: c.staff_id ? 'staff' : 'member', displayName: c.display_name, badgeName: c.badge_name, officialName: c.official_name,
  role: c.role, place: c.place, team: c.team_name,
})

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
