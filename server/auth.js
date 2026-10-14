// Sessions, passwords and roles. Permissions are described in docs/ROLES.md.
import crypto from 'node:crypto'

export const ROLES = [
  'team_leader', 'participant', 'registration_admin', 'finance_admin', 'checkin_staff',
  'welfare_staff', 'content_editor', 'results_staff', 'viewer', 'super_admin',
]

/** Roles that may read and change any delegation. */
export const DELEGATION_ADMINS = ['registration_admin', 'super_admin']
/** Roles that may read any delegation (with sensitive fields filtered by role). */
export const DELEGATION_READERS = [...DELEGATION_ADMINS, 'finance_admin', 'welfare_staff']

// Firebase Hosting forwards only a cookie with exactly this name to Cloud Run.
const COOKIE = '__session'
const IDLE_MS = 2 * 60 * 60 * 1000
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000
const LOCKOUT_WINDOW_MIN = 15
const LOCKOUT_FAILURES = 5

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const key = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${key}`
}

export function verifyPassword(password, stored) {
  if (!password || !stored?.startsWith('scrypt:')) return false
  const [, salt, key] = stored.split(':')
  const expected = Buffer.from(key, 'hex')
  const actual = crypto.scryptSync(password, salt, expected.length)
  return crypto.timingSafeEqual(expected, actual)
}

export function checkPasswordRules(password) {
  if (typeof password !== 'string' || password.length < 12) throw new HttpError(400, 'Use a password of at least 12 characters.')
  if (password.length > 200) throw new HttpError(400, 'Use a password of at most 200 characters.')
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=')).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]))
}

function writeCookie(req, res, value, maxAgeSeconds) {
  const secure = req.secure || process.env.NODE_ENV === 'production'
  res.append('Set-Cookie', [
    `${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, secure ? 'Secure' : '',
  ].filter(Boolean).join('; '))
}

export async function createSession(db, req, res, accountId) {
  const token = crypto.randomBytes(32).toString('base64url')
  await db.query(
    `INSERT INTO sessions (token_hash, account_id, expires_at, user_agent, ip)
     VALUES ($1, $2, now() + $3::interval, $4, $5)`,
    [sha256(token), accountId, `${ABSOLUTE_MS / 1000} seconds`, String(req.get('user-agent') ?? '').slice(0, 300), req.ip],
  )
  await db.query('UPDATE accounts SET last_login_at = now() WHERE id = $1', [accountId])
  writeCookie(req, res, token, ABSOLUTE_MS / 1000)
}

export async function destroySession(db, req, res) {
  const token = parseCookies(req.get('cookie'))[COOKIE]
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)])
  writeCookie(req, res, '', 0)
}

/** Attaches req.user when a valid session cookie is present. Never rejects on its own. */
export function sessionMiddleware(getDb) {
  return async (req, res, next) => {
    const token = parseCookies(req.get('cookie'))[COOKIE]
    if (!token) return next()
    try {
      const db = getDb()
      const { rows } = await db.query(
        `SELECT s.token_hash, s.last_seen_at, a.id, a.email, a.full_name, a.role, a.member_id, a.email_verified_at
         FROM sessions s JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND a.disabled_at IS NULL`,
        [sha256(token)],
      )
      const row = rows[0]
      if (!row || Date.now() - new Date(row.last_seen_at).getTime() > IDLE_MS) {
        if (row) await db.query('DELETE FROM sessions WHERE token_hash = $1', [row.token_hash])
        writeCookie(req, res, '', 0)
        return next()
      }
      if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
        await db.query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [row.token_hash])
      }
      req.user = {
        id: row.id, email: row.email, fullName: row.full_name, role: row.role,
        memberId: row.member_id, emailVerified: Boolean(row.email_verified_at),
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

/** Changing requests must carry a custom header, which other sites cannot send without CORS approval. */
export function requireRequestHeader(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('x-iol-request')) return next()
  next(new HttpError(403, 'Missing request header.'))
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'))
  next()
}

export function requireVerified(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'))
  if (!req.user.emailVerified) return next(new HttpError(403, 'Verify your email address first.'))
  next()
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.'))
    if (req.user.role === 'super_admin' || roles.includes(req.user.role)) return next()
    next(new HttpError(403, 'Your role does not allow this.'))
  }
}

export async function loginBlocked(db, email) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS failures FROM login_attempts
     WHERE lower(email) = lower($1) AND NOT succeeded AND attempted_at > now() - $2::interval`,
    [email, `${LOCKOUT_WINDOW_MIN} minutes`],
  )
  return rows[0].failures >= LOCKOUT_FAILURES
}

export async function recordLogin(db, email, ip, succeeded) {
  await db.query('INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1, $2, $3)', [email, ip, succeeded])
  if (succeeded) await db.query('DELETE FROM login_attempts WHERE lower(email) = lower($1) AND NOT succeeded', [email])
}

const SENSITIVE_HEALTH = ['food_allergy_notes', 'medical_accessibility_notes', 'emergency_contact']
const SENSITIVE_IDENTITY = ['passport_name', 'passport_number', 'date_of_birth']

/** Removes member fields a role is not allowed to see. Team Leaders and admins see everything in scope. */
export function filterMember(member, role) {
  if (['team_leader', 'participant', ...DELEGATION_ADMINS].includes(role)) return member
  const hidden = role === 'welfare_staff' ? SENSITIVE_IDENTITY : [...SENSITIVE_HEALTH, ...SENSITIVE_IDENTITY]
  return Object.fromEntries(Object.entries(member).filter(([key]) => !hidden.includes(key)))
}
