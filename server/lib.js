// Database and request helpers shared by the API modules (index.js, admin.js).
import crypto from 'node:crypto'
import pg from 'pg'
import { HttpError } from './auth.js'

const { Pool } = pg
// Return DATE columns as YYYY-MM-DD text. The default parser builds a local-midnight Date, which shifts
// birthdays and travel dates by a day on servers ahead of UTC (Thailand is UTC+7).
pg.types.setTypeParser(1082, (value) => value)

const databaseUrl = process.env.DATABASE_URL
export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX || 5) }) : null
// Development only: return emailed codes in API responses while no email provider is configured.
export const exposeDevCodes = process.env.EXPOSE_DEV_CODES === 'true'
// Where links in emails point. The dev deployment sets this to the dev site.
// Where links in emails point: the registration portal, /portal on the website, e.g. https://iol2027-dev.web.app/portal.
export const portalUrl = (process.env.PORTAL_URL || 'https://iol2027-dev.web.app/portal').replace(/\/$/, '')

export function requireDb() {
  if (!pool) throw new HttpError(503, 'DATABASE_URL is not configured.')
  return pool
}

export async function query(sql, params = []) {
  return requireDb().query(sql, params)
}

export async function withTransaction(work) {
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

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

export function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${name} is required.`)
  return value.trim()
}

export function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) throw new HttpError(400, 'Expected a numeric value.')
  return number
}

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')
const toCamel = (value) => value.replace(/_([a-z])/g, (_match, char) => char.toUpperCase())
export const camelizeRow = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value]))
export const camelizeRows = (rows) => rows.map(camelizeRow)

export async function insertAudit(db, { actorAccountId = null, delegationId = null, eventType, entityType, entityId = null, details = {} }) {
  await db.query(
    `INSERT INTO audit_events (actor_account_id, delegation_id, event_type, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorAccountId, delegationId, eventType, entityType, entityId, details],
  )
}

export function buildUpdate(body, fieldMap) {
  const sets = []
  const values = []
  for (const [bodyKey, column] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(body, bodyKey)) {
      values.push(body[bodyKey] === '' ? null : body[bodyKey])
      sets.push(`${column} = $${values.length}`)
    }
  }
  values.push(new Date())
  sets.push(`updated_at = $${values.length}`)
  return { sets, values }
}

/** Person details that must be filled in before submission, by role. Mirrors the portal (src/registration/live.ts). */
export const requiredMemberColumns = {
  all: [['badge_name', 'badge name'], ['official_name', 'official name'], ['passport_name', 'passport name'], ['passport_number', 'passport number'],
    ['passport_nationality', 'passport nationality'], ['date_of_birth', 'date of birth'], ['gender_for_room_allocation', 'gender for room allocation'],
    ['tshirt_size', 'T-shirt size'], ['polo_size', 'polo shirt size'], ['emergency_contact', 'emergency contact']],
  contestant: [['team_id', 'team assignment'], ['exam_language', 'exam language']],
  team_leader: [['room_type_preference', 'single room']],
  observer: [['observer_category', 'observer category'], ['email', 'email'], ['room_type_preference', 'single room']],
}

/** Labels of required details this member is still missing. */
export function missingMemberDetails(member) {
  return [...requiredMemberColumns.all, ...requiredMemberColumns[member.role]]
    .filter(([column]) => member[column] === null || member[column] === undefined || String(member[column]).trim() === '')
    .map(([, label]) => label)
}
