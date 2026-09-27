import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import pg from 'pg'
import QRCode from 'qrcode'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'server/uploads')
const port = Number(process.env.API_PORT || 4000)
const databaseUrl = process.env.DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null

const app = express()
const corsOrigins = process.env.APP_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)

app.use(cors({ origin: corsOrigins?.length ? corsOrigins : true }))
app.use(express.json({ limit: '1mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png'])
    if (allowed.has(file.mimetype)) callback(null, true)
    else callback(new ApiError(400, 'Only PDF, JPG and PNG files are accepted.'))
  },
})

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function requireDb() {
  if (!pool) throw new ApiError(503, 'DATABASE_URL is not configured.')
  return pool
}

async function query(sql, params = []) {
  return requireDb().query(sql, params)
}

async function withTransaction(work) {
  const client = await requireDb().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${name} is required.`)
  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw new ApiError(400, 'Expected a numeric value.')
  return number
}

function optionalBoolean(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (['yes', 'true', '1'].includes(value.toLowerCase())) return true
    if (['no', 'false', '0'].includes(value.toLowerCase())) return false
  }
  throw new ApiError(400, 'Expected a boolean value.')
}

function normalizeRole(role) {
  const value = requiredString(role, 'role').toLowerCase().replaceAll(' ', '_')
  if (!['contestant', 'team_leader', 'observer'].includes(value)) throw new ApiError(400, 'Invalid member role.')
  return value
}

function normalizeDirection(direction) {
  const value = requiredString(direction, 'direction').toLowerCase()
  if (!['arrival', 'departure'].includes(value)) throw new ApiError(400, 'Travel direction must be arrival or departure.')
  return value
}

function normalizeChangeStatus(value) {
  if (!value) return 'open'
  const normalized = String(value).toLowerCase().replaceAll(' ', '_')
  if (!['open', 'submitted_to_loc', 'locked'].includes(normalized)) throw new ApiError(400, 'Invalid travel change status.')
  return normalized
}

function hashPassword(password) {
  if (!password) return null
  const salt = crypto.randomBytes(16).toString('hex')
  const key = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${key}`
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function sendVerificationEmail({ accountId, email, code }) {
  const deliveryResult = await query(
    `INSERT INTO email_deliveries (account_id, recipient_email, purpose, status)
     VALUES ($1, $2, 'account_verification', 'queued')
     RETURNING *`,
    [accountId, email],
  )
  const delivery = deliveryResult.rows[0]
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return { delivery: camelizeRow(delivery), configured: false }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject: 'Your IOL 2027 verification code',
        html: `<p>Your IOL 2027 verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 30 minutes.</p>`,
      }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.message || 'Email provider rejected the message.')
    const sent = await query(
      `UPDATE email_deliveries
       SET status = 'sent', provider_message_id = $1, sent_at = now()
       WHERE id = $2
       RETURNING *`,
      [payload.id, delivery.id],
    )
    return { delivery: camelizeRow(sent.rows[0]), configured: true }
  } catch (error) {
    await query(
      `UPDATE email_deliveries SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error.message, delivery.id],
    )
    throw new ApiError(502, 'The verification email could not be sent. Please try again.')
  }
}

function toCamel(value) {
  return value.replace(/_([a-z])/g, (_match, char) => char.toUpperCase())
}

function camelizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value]))
}

function camelizeRows(rows) {
  return rows.map(camelizeRow)
}

async function insertAudit(client, { actorAccountId = null, delegationId = null, eventType, entityType, entityId = null, details = {} }) {
  await client.query(
    `INSERT INTO audit_events (actor_account_id, delegation_id, event_type, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorAccountId, delegationId, eventType, entityType, entityId, details],
  )
}

function buildUpdate(body, fieldMap) {
  const sets = []
  const values = []
  for (const [bodyKey, column] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(body, bodyKey)) {
      values.push(body[bodyKey])
      sets.push(`${column} = $${values.length}`)
    }
  }
  values.push(new Date())
  sets.push(`updated_at = $${values.length}`)
  return { sets, values }
}

const registrationOptions = {
  memberRoles: ['contestant', 'team_leader', 'observer'],
  teamLimit: [1, 2],
  observerLimit: null,
  workingLanguages: ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  tshirtSizes: [
    { size: 'XS', chestCm: 80 }, { size: 'S', chestCm: 85 }, { size: 'M', chestCm: 90 },
    { size: 'L', chestCm: 95 }, { size: 'XL', chestCm: 100 }, { size: '2XL', chestCm: 106 },
    { size: '3XL', chestCm: 112 },
  ],
  roomTypes: ['Twin room', 'Single if available', 'No preference'],
  guardianConsentPolicy: 'pending_organiser_decision',
  travelDirections: ['arrival', 'departure'],
  payment: {
    collection: 'outside_website',
    acceptedProofFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    transferFeeInstruction: 'OUR',
    currency: 'USD',
  },
  backend: {
    database: 'PostgreSQL',
  },
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  if (!pool) return res.status(503).json({ ok: false, database: 'not_configured' })
  const result = await query('SELECT now() AS checked_at')
  res.json({ ok: true, database: 'postgresql', checkedAt: result.rows[0].checked_at })
}))

app.get('/api/registration/options', (_req, res) => {
  res.json(registrationOptions)
})

app.post('/api/registration/invite/verify', asyncHandler(async (req, res) => {
  const code = requiredString(req.body.code, 'invite code')
  const result = await query(
    `SELECT id, code, country_territory, accredited_organisation, contact_email, max_teams, status
     FROM invite_codes
     WHERE code = $1 AND status = 'active'`,
    [code],
  )
  if (!result.rowCount) throw new ApiError(404, 'Invite code was not found or is no longer active.')
  res.json({ invite: camelizeRow(result.rows[0]) })
}))

app.post('/api/registration/team-leader-account', asyncHandler(async (req, res) => {
  const inviteCode = requiredString(req.body.inviteCode, 'inviteCode')
  const email = requiredString(req.body.email, 'email').toLowerCase()
  const fullName = requiredString(req.body.fullName, 'fullName')
  const passwordHash = hashPassword(req.body.password)

  const created = await withTransaction(async (client) => {
    const inviteResult = await client.query(
      `SELECT *
       FROM invite_codes
       WHERE code = $1 AND status = 'active'
       FOR UPDATE`,
      [inviteCode],
    )
    if (!inviteResult.rowCount) throw new ApiError(404, 'Invite code was not found or is no longer active.')
    const invite = inviteResult.rows[0]

    const accountResult = await client.query('SELECT * FROM accounts WHERE lower(email) = lower($1)', [email])
    const account = accountResult.rowCount
      ? (await client.query(
        `UPDATE accounts
         SET full_name = $2, password_hash = COALESCE($3, password_hash), updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [accountResult.rows[0].id, fullName, passwordHash],
      )).rows[0]
      : (await client.query(
        `INSERT INTO accounts (email, full_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email, fullName, passwordHash],
      )).rows[0]

    const delegationResult = await client.query(
      `INSERT INTO delegations (
        account_id,
        invite_code_id,
        country_territory,
        accredited_organisation,
        primary_team_leader_name,
        team_leader_email,
        mobile_whatsapp,
        registration_contact_email,
        number_of_teams,
        number_of_contestants,
        number_of_observers,
        adult_room_preference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 1), COALESCE($10, 4), COALESCE($11, 0), COALESCE($12, 'no_preference'))
      ON CONFLICT (invite_code_id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        primary_team_leader_name = EXCLUDED.primary_team_leader_name,
        team_leader_email = EXCLUDED.team_leader_email,
        mobile_whatsapp = EXCLUDED.mobile_whatsapp,
        registration_contact_email = EXCLUDED.registration_contact_email,
        number_of_teams = EXCLUDED.number_of_teams,
        number_of_contestants = EXCLUDED.number_of_contestants,
        number_of_observers = EXCLUDED.number_of_observers,
        adult_room_preference = EXCLUDED.adult_room_preference,
        updated_at = now()
      RETURNING *`,
      [
        account.id,
        invite.id,
        invite.country_territory,
        invite.accredited_organisation,
        fullName,
        email,
        optionalString(req.body.mobileWhatsapp),
        optionalString(req.body.registrationContactEmail) || invite.contact_email,
        optionalNumber(req.body.numberOfTeams),
        optionalNumber(req.body.numberOfContestants),
        optionalNumber(req.body.numberOfObservers),
        optionalString(req.body.adultRoomPreference),
      ],
    )
    const delegation = delegationResult.rows[0]

    const teamLeaderResult = await client.query(
      `SELECT id FROM members WHERE delegation_id = $1 AND role = 'team_leader' ORDER BY created_at LIMIT 1`,
      [delegation.id],
    )
    if (teamLeaderResult.rowCount) {
      await client.query(
        `UPDATE members
         SET display_name = $2, badge_name = $2, official_name = $2, email = $3, updated_at = now()
         WHERE id = $1`,
        [teamLeaderResult.rows[0].id, fullName, email],
      )
    } else {
      await client.query(
        `INSERT INTO members (delegation_id, role, display_name, badge_name, official_name, email)
         VALUES ($1, 'team_leader', $2, $2, $2, $3)`,
        [delegation.id, fullName, email],
      )
    }

    await client.query(
      `UPDATE invite_codes
       SET used_at = COALESCE(used_at, now()), used_by_account_id = $1, updated_at = now()
       WHERE id = $2`,
      [account.id, invite.id],
    )
    await insertAudit(client, {
      actorAccountId: account.id,
      delegationId: delegation.id,
      eventType: 'team_leader_account_upserted',
      entityType: 'delegation',
      entityId: delegation.id,
      details: { inviteCode },
    })

    return { account, delegation }
  })

  res.status(201).json({ account: camelizeRow(created.account), delegation: camelizeRow(created.delegation) })
}))

app.post('/api/registration/accounts/:accountId/request-email-verification', asyncHandler(async (req, res) => {
  const accountResult = await query('SELECT id, email FROM accounts WHERE id = $1', [req.params.accountId])
  if (!accountResult.rowCount) throw new ApiError(404, 'Account not found.')
  const code = String(crypto.randomInt(100000, 999999))
  const tokenHash = hashToken(code)
  await query(
    `INSERT INTO email_verification_tokens (account_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '30 minutes')`,
    [req.params.accountId, tokenHash],
  )
  const emailResult = await sendVerificationEmail({ accountId: req.params.accountId, email: accountResult.rows[0].email, code })
  res.status(201).json({
    ok: true,
    delivery: emailResult.delivery,
    emailProviderConfigured: emailResult.configured,
    developmentCode: process.env.NODE_ENV === 'production' || emailResult.configured ? undefined : code,
  })
}))

app.post('/api/registration/accounts/:accountId/verify-email', asyncHandler(async (req, res) => {
  const code = requiredString(req.body.code, 'verification code')
  const tokenHash = hashToken(code)
  const verified = await withTransaction(async (client) => {
    const tokenResult = await client.query(
      `SELECT *
       FROM email_verification_tokens
       WHERE account_id = $1
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [req.params.accountId, tokenHash],
    )
    if (!tokenResult.rowCount) throw new ApiError(400, 'Verification code is invalid or expired.')
    await client.query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [tokenResult.rows[0].id])
    const accountResult = await client.query(
      `UPDATE accounts
       SET email_verified_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.accountId],
    )
    return accountResult.rows[0]
  })
  res.json({ account: camelizeRow(verified) })
}))

app.get('/api/registration/delegations/:delegationId', asyncHandler(async (req, res) => {
  const delegationResult = await query('SELECT * FROM delegations WHERE id = $1', [req.params.delegationId])
  if (!delegationResult.rowCount) throw new ApiError(404, 'Delegation not found.')

  const [teamResult, memberResult, travelResult, paymentResult, attachmentResult, badgeResult, checkInResult] = await Promise.all([
    query('SELECT * FROM teams WHERE delegation_id = $1 ORDER BY code', [req.params.delegationId]),
    query('SELECT * FROM members WHERE delegation_id = $1 ORDER BY role, display_name', [req.params.delegationId]),
    query(
      `SELECT tr.*,
        COALESCE(json_agg(trp.member_id) FILTER (WHERE trp.member_id IS NOT NULL), '[]'::json) AS member_ids
       FROM travel_records tr
       LEFT JOIN travel_record_people trp ON trp.travel_record_id = tr.id
       WHERE tr.delegation_id = $1
       GROUP BY tr.id
       ORDER BY tr.direction, tr.local_date NULLS LAST, tr.local_time NULLS LAST`,
      [req.params.delegationId],
    ),
    query('SELECT * FROM payments WHERE delegation_id = $1 ORDER BY created_at DESC', [req.params.delegationId]),
    query(
      `SELECT id, delegation_id, member_id, kind, original_filename, mime_type, size_bytes, uploaded_by_account_id, created_at
       FROM attachments
       WHERE delegation_id = $1
       ORDER BY created_at DESC`,
      [req.params.delegationId],
    ),
    query(
      `SELECT bc.id, bc.member_id, bc.public_id, bc.status, bc.issued_at, bc.revoked_at
       FROM badge_credentials bc
       JOIN members m ON m.id = bc.member_id
       WHERE m.delegation_id = $1
       ORDER BY bc.issued_at DESC`,
      [req.params.delegationId],
    ),
    query(
      `SELECT cie.id, cie.member_id, cie.checkpoint, cie.result, cie.scanned_at
       FROM check_in_events cie
       JOIN members m ON m.id = cie.member_id
       WHERE m.delegation_id = $1
       ORDER BY cie.scanned_at DESC
       LIMIT 100`,
      [req.params.delegationId],
    ),
  ])

  res.json({
    delegation: camelizeRow(delegationResult.rows[0]),
    teams: camelizeRows(teamResult.rows),
    members: camelizeRows(memberResult.rows),
    travelRecords: camelizeRows(travelResult.rows),
    payments: camelizeRows(paymentResult.rows),
    attachments: camelizeRows(attachmentResult.rows),
    badges: camelizeRows(badgeResult.rows),
    checkIns: camelizeRows(checkInResult.rows),
    paymentInstructions: {
      collection: 'outside_website',
      method: 'bank_transfer',
      transferFeeInstruction: 'OUR',
      proofUploadOnly: true,
    },
  })
}))

app.patch('/api/registration/delegations/:delegationId', asyncHandler(async (req, res) => {
  const fieldMap = {
    mobileWhatsapp: 'mobile_whatsapp',
    registrationContactEmail: 'registration_contact_email',
    numberOfTeams: 'number_of_teams',
    numberOfContestants: 'number_of_contestants',
    numberOfObservers: 'number_of_observers',
    adultRoomPreference: 'adult_room_preference',
    registrationStatus: 'registration_status',
  }
  const { sets, values } = buildUpdate(req.body, fieldMap)
  values.push(req.params.delegationId)
  const result = await query(`UPDATE delegations SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  if (!result.rowCount) throw new ApiError(404, 'Delegation not found.')
  res.json({ delegation: camelizeRow(result.rows[0]) })
}))

app.post('/api/registration/delegations/:delegationId/teams', asyncHandler(async (req, res) => {
  const result = await query(
    `INSERT INTO teams (delegation_id, name, code, leader_member_id, contest_language, status)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'draft'))
     RETURNING *`,
    [
      req.params.delegationId,
      requiredString(req.body.name, 'team name'),
      requiredString(req.body.code, 'team code'),
      optionalString(req.body.leaderMemberId),
      optionalString(req.body.contestLanguage),
      optionalString(req.body.status),
    ],
  )
  res.status(201).json({ team: camelizeRow(result.rows[0]) })
}))

app.patch('/api/registration/teams/:teamId', asyncHandler(async (req, res) => {
  const fieldMap = {
    name: 'name',
    code: 'code',
    leaderMemberId: 'leader_member_id',
    contestLanguage: 'contest_language',
    status: 'status',
  }
  const { sets, values } = buildUpdate(req.body, fieldMap)
  values.push(req.params.teamId)
  const result = await query(`UPDATE teams SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  if (!result.rowCount) throw new ApiError(404, 'Team not found.')
  res.json({ team: camelizeRow(result.rows[0]) })
}))

app.post('/api/registration/delegations/:delegationId/members', asyncHandler(async (req, res) => {
  const result = await query(
    `INSERT INTO members (
      delegation_id,
      team_id,
      role,
      observer_category,
      display_name,
      badge_name,
      official_name,
      passport_name,
      passport_number,
      passport_nationality,
      date_of_birth,
      gender_for_room_allocation,
      exam_language,
      tshirt_size,
      food_allergy_notes,
      medical_accessibility_notes,
      emergency_contact,
      room_type_preference,
      email,
      mobile_whatsapp
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    RETURNING *`,
    [
      req.params.delegationId,
      optionalString(req.body.teamId),
      normalizeRole(req.body.role),
      optionalString(req.body.observerCategory),
      requiredString(req.body.displayName, 'displayName'),
      optionalString(req.body.badgeName) || requiredString(req.body.displayName, 'displayName'),
      requiredString(req.body.officialName, 'officialName'),
      optionalString(req.body.passportName),
      optionalString(req.body.passportNumber),
      optionalString(req.body.passportNationality),
      optionalString(req.body.dateOfBirth),
      optionalString(req.body.genderForRoomAllocation),
      optionalString(req.body.examLanguage),
      optionalString(req.body.tshirtSize),
      optionalString(req.body.foodAllergyNotes),
      optionalString(req.body.medicalAccessibilityNotes),
      optionalString(req.body.emergencyContact),
      optionalString(req.body.roomTypePreference),
      optionalString(req.body.email),
      optionalString(req.body.mobileWhatsapp),
    ],
  )
  res.status(201).json({ member: camelizeRow(result.rows[0]) })
}))

app.patch('/api/registration/members/:memberId', asyncHandler(async (req, res) => {
  const payload = { ...req.body }
  if (payload.role) payload.role = normalizeRole(payload.role)

  const fieldMap = {
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
    foodAllergyNotes: 'food_allergy_notes',
    medicalAccessibilityNotes: 'medical_accessibility_notes',
    emergencyContact: 'emergency_contact',
    roomTypePreference: 'room_type_preference',
    email: 'email',
    mobileWhatsapp: 'mobile_whatsapp',
  }
  const { sets, values } = buildUpdate(payload, fieldMap)
  values.push(req.params.memberId)
  const result = await query(`UPDATE members SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
  if (!result.rowCount) throw new ApiError(404, 'Member not found.')
  res.json({ member: camelizeRow(result.rows[0]) })
}))

app.delete('/api/registration/members/:memberId', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM members WHERE id = $1 RETURNING id', [req.params.memberId])
  if (!result.rowCount) throw new ApiError(404, 'Member not found.')
  res.status(204).end()
}))

app.post('/api/registration/members/:memberId/guardian-consent', upload.single('consent'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Guardian consent file is required.')
  const response = await withTransaction(async (client) => {
    const memberResult = await client.query('SELECT * FROM members WHERE id = $1 FOR UPDATE', [req.params.memberId])
    if (!memberResult.rowCount) throw new ApiError(404, 'Member not found.')
    const member = memberResult.rows[0]

    const extension = path.extname(req.file.originalname).toLowerCase() || '.bin'
    const storedName = `guardian-${req.params.memberId}-${crypto.randomUUID()}${extension}`
    const delegationUploadDir = path.join(uploadDir, member.delegation_id)
    await fs.mkdir(delegationUploadDir, { recursive: true })
    const storedPath = path.join(delegationUploadDir, storedName)
    await fs.writeFile(storedPath, req.file.buffer)

    const attachmentResult = await client.query(
      `INSERT INTO attachments (
        delegation_id,
        member_id,
        kind,
        original_filename,
        stored_path,
        mime_type,
        size_bytes,
        uploaded_by_account_id
      )
      VALUES ($1, $2, 'guardian_consent', $3, $4, $5, $6, $7)
      RETURNING id, delegation_id, member_id, kind, original_filename, mime_type, size_bytes, uploaded_by_account_id, created_at`,
      [
        member.delegation_id,
        req.params.memberId,
        req.file.originalname,
        storedPath,
        req.file.mimetype,
        req.file.size,
        optionalString(req.body.uploadedByAccountId),
      ],
    )
    const attachment = attachmentResult.rows[0]
    await insertAudit(client, {
      actorAccountId: optionalString(req.body.uploadedByAccountId),
      delegationId: member.delegation_id,
      eventType: 'guardian_consent_uploaded',
      entityType: 'member',
      entityId: req.params.memberId,
      details: { originalFilename: req.file.originalname, mimeType: req.file.mimetype },
    })
    return attachment
  })
  res.status(201).json({ attachment: camelizeRow(response) })
}))

app.post('/api/registration/delegations/:delegationId/travel', asyncHandler(async (req, res) => {
  const travel = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO travel_records (
        delegation_id,
        direction,
        travel_point,
        flight_service_number,
        local_date,
        local_time,
        terminal,
        change_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        req.params.delegationId,
        normalizeDirection(req.body.direction),
        optionalString(req.body.travelPoint),
        optionalString(req.body.flightServiceNumber),
        optionalString(req.body.localDate),
        optionalString(req.body.localTime),
        optionalString(req.body.terminal),
        normalizeChangeStatus(req.body.changeStatus),
      ],
    )
    const travelRecord = result.rows[0]
    const peopleIds = Array.isArray(req.body.peopleIds) ? req.body.peopleIds : []
    for (const memberId of peopleIds) {
      await client.query(
        `INSERT INTO travel_record_people (travel_record_id, member_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [travelRecord.id, memberId],
      )
    }
    await client.query(
      `UPDATE delegations
       SET travel_status = 'in_progress', updated_at = now()
       WHERE id = $1`,
      [req.params.delegationId],
    )
    return travelRecord
  })
  res.status(201).json({ travelRecord: camelizeRow(travel) })
}))

app.patch('/api/registration/travel/:travelRecordId', asyncHandler(async (req, res) => {
  const travel = await withTransaction(async (client) => {
    const payload = { ...req.body }
    if (payload.direction) payload.direction = normalizeDirection(payload.direction)
    if (payload.changeStatus) payload.changeStatus = normalizeChangeStatus(payload.changeStatus)

    const fieldMap = {
      direction: 'direction',
      travelPoint: 'travel_point',
      flightServiceNumber: 'flight_service_number',
      localDate: 'local_date',
      localTime: 'local_time',
      terminal: 'terminal',
      changeStatus: 'change_status',
    }
    const { sets, values } = buildUpdate(payload, fieldMap)
    values.push(req.params.travelRecordId)
    const result = await client.query(`UPDATE travel_records SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    if (!result.rowCount) throw new ApiError(404, 'Travel record not found.')

    if (Array.isArray(req.body.peopleIds)) {
      await client.query('DELETE FROM travel_record_people WHERE travel_record_id = $1', [req.params.travelRecordId])
      for (const memberId of req.body.peopleIds) {
        await client.query(
          `INSERT INTO travel_record_people (travel_record_id, member_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [req.params.travelRecordId, memberId],
        )
      }
    }
    return result.rows[0]
  })
  res.json({ travelRecord: camelizeRow(travel) })
}))

app.post('/api/registration/delegations/:delegationId/payment-proof', upload.single('proof'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Proof of payment file is required.')
  const response = await withTransaction(async (client) => {
    const delegationResult = await client.query('SELECT * FROM delegations WHERE id = $1 FOR UPDATE', [req.params.delegationId])
    if (!delegationResult.rowCount) throw new ApiError(404, 'Delegation not found.')
    const delegation = delegationResult.rows[0]
    const paymentReference = optionalString(req.body.paymentReference) || `${delegation.country_territory.slice(0, 3).toUpperCase()}-IOL2027-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

    const paymentResult = await client.query(
      `INSERT INTO payments (delegation_id, fee_tier, currency, amount_due, payment_reference, invoice_count, invoice_split_note, status)
       VALUES ($1, COALESCE($2, 'early_bird'), 'USD', COALESCE($3, 0), $4, COALESCE($5, 1), $6, 'awaiting_review')
       ON CONFLICT (delegation_id, payment_reference) DO UPDATE SET
         invoice_count = EXCLUDED.invoice_count,
         invoice_split_note = EXCLUDED.invoice_split_note,
         status = 'awaiting_review',
         updated_at = now()
       RETURNING *`,
      [
        req.params.delegationId,
        optionalString(req.body.feeTier),
        optionalNumber(req.body.amountDue),
        paymentReference,
        optionalNumber(req.body.invoiceCount),
        optionalString(req.body.invoiceSplitNote),
      ],
    )
    const payment = paymentResult.rows[0]

    const extension = path.extname(req.file.originalname).toLowerCase() || '.bin'
    const storedName = `${crypto.randomUUID()}${extension}`
    const delegationUploadDir = path.join(uploadDir, req.params.delegationId)
    await fs.mkdir(delegationUploadDir, { recursive: true })
    const storedPath = path.join(delegationUploadDir, storedName)
    await fs.writeFile(storedPath, req.file.buffer)

    const attachmentResult = await client.query(
      `INSERT INTO attachments (
        delegation_id,
        kind,
        original_filename,
        stored_path,
        mime_type,
        size_bytes,
        uploaded_by_account_id
      )
      VALUES ($1, 'payment_proof', $2, $3, $4, $5, $6)
      RETURNING id, delegation_id, kind, original_filename, mime_type, size_bytes, uploaded_by_account_id, created_at`,
      [
        req.params.delegationId,
        req.file.originalname,
        storedPath,
        req.file.mimetype,
        req.file.size,
        optionalString(req.body.uploadedByAccountId),
      ],
    )
    const attachment = attachmentResult.rows[0]

    const updatedPaymentResult = await client.query(
      `UPDATE payments
       SET proof_attachment_id = $1, status = 'awaiting_review', updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [attachment.id, payment.id],
    )
    await client.query(
      `UPDATE delegations
       SET payment_status = 'awaiting_review', updated_at = now()
       WHERE id = $1`,
      [req.params.delegationId],
    )
    await insertAudit(client, {
      actorAccountId: optionalString(req.body.uploadedByAccountId),
      delegationId: req.params.delegationId,
      eventType: 'payment_proof_uploaded',
      entityType: 'payment',
      entityId: payment.id,
      details: { originalFilename: req.file.originalname, mimeType: req.file.mimetype },
    })

    return { payment: updatedPaymentResult.rows[0], attachment }
  })

  res.status(201).json({
    payment: camelizeRow(response.payment),
    attachment: camelizeRow(response.attachment),
    paymentCollection: 'outside_website',
  })
}))

app.post('/api/registration/members/:memberId/badge', asyncHandler(async (req, res) => {
  const memberResult = await query(
    `SELECT id, delegation_id, display_name, badge_name, role FROM members WHERE id = $1`,
    [req.params.memberId],
  )
  if (!memberResult.rowCount) throw new ApiError(404, 'Member not found.')

  const publicId = crypto.randomUUID()
  const secret = crypto.randomBytes(24).toString('base64url')
  const secretHash = hashToken(secret)
  const credentialResult = await query(
    `INSERT INTO badge_credentials (member_id, public_id, secret_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (member_id) DO UPDATE SET
       public_id = EXCLUDED.public_id,
       secret_hash = EXCLUDED.secret_hash,
       status = 'active',
       issued_at = now(),
       revoked_at = NULL
     RETURNING id, member_id, public_id, status, issued_at`,
    [req.params.memberId, publicId, secretHash],
  )
  const qrPayload = `IOL2027:${publicId}.${secret}`
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 480,
    color: { dark: '#160c1b', light: '#ffffff' },
  })
  await query(
    `INSERT INTO audit_events (delegation_id, event_type, entity_type, entity_id, details)
     VALUES ($1, 'badge_issued', 'member', $2, $3)`,
    [memberResult.rows[0].delegation_id, req.params.memberId, { publicId }],
  )
  res.status(201).json({
    badge: camelizeRow(credentialResult.rows[0]),
    member: camelizeRow(memberResult.rows[0]),
    qrDataUrl,
  })
}))

app.post('/api/registration/check-in/scan', asyncHandler(async (req, res) => {
  const payload = requiredString(req.body.payload, 'QR payload')
  const checkpoint = requiredString(req.body.checkpoint, 'checkpoint')
  const encoded = payload.startsWith('IOL2027:') ? payload.slice('IOL2027:'.length) : payload
  const separator = encoded.indexOf('.')
  if (separator < 1) throw new ApiError(400, 'Badge QR is invalid.')
  const publicId = encoded.slice(0, separator)
  const secret = encoded.slice(separator + 1)
  const credentialResult = await query(
    `SELECT bc.*, m.display_name, m.badge_name, m.role, m.delegation_id
     FROM badge_credentials bc
     JOIN members m ON m.id = bc.member_id
     WHERE bc.public_id = $1`,
    [publicId],
  )
  if (!credentialResult.rowCount) throw new ApiError(404, 'Badge was not found.')
  const credential = credentialResult.rows[0]
  const suppliedHash = Buffer.from(hashToken(secret), 'hex')
  const storedHash = Buffer.from(credential.secret_hash, 'hex')
  const secretMatches = suppliedHash.length === storedHash.length && crypto.timingSafeEqual(suppliedHash, storedHash)
  if (!secretMatches) throw new ApiError(400, 'Badge QR is invalid.')

  const result = credential.status === 'active' ? 'accepted' : 'revoked'
  const scanResult = await query(
    `INSERT INTO check_in_events (badge_credential_id, member_id, scanned_by_account_id, checkpoint, result)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [credential.id, credential.member_id, optionalString(req.body.scannedByAccountId), checkpoint, result],
  )
  res.status(result === 'accepted' ? 201 : 409).json({
    accepted: result === 'accepted',
    member: {
      id: credential.member_id,
      displayName: credential.display_name,
      badgeName: credential.badge_name,
      role: credential.role,
    },
    scan: camelizeRow(scanResult.rows[0]),
  })
}))

app.get('/api/registration/admin/dashboard', asyncHandler(async (_req, res) => {
  const [delegationCounts, paymentCounts, travelCounts] = await Promise.all([
    query('SELECT registration_status, count(*)::int AS count FROM delegations GROUP BY registration_status ORDER BY registration_status'),
    query('SELECT payment_status, count(*)::int AS count FROM delegations GROUP BY payment_status ORDER BY payment_status'),
    query('SELECT travel_status, count(*)::int AS count FROM delegations GROUP BY travel_status ORDER BY travel_status'),
  ])
  res.json({
    delegations: camelizeRows(delegationCounts.rows),
    payments: camelizeRows(paymentCounts.rows),
    travel: camelizeRows(travelCounts.rows),
  })
}))

app.use((error, _req, res, _next) => {
  const status = error.status || 500
  if (status >= 500) console.error(error)
  res.status(status).json({ error: error.message || 'Internal server error' })
})

app.listen(port, () => {
  console.log(`IOL 2027 registration API listening on http://localhost:${port}`)
})
