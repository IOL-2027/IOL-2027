// QR badges. Each person gets one credential. The QR is a link to the portal's badge page,
// `<portal>/b#<public id>.<secret>`, with no personal data in it: staff who open it sign in and see whose badge it is.
// The code sits after `#`, so it never reaches a server log. The secret is derived from the public id with
// BADGE_SIGNING_KEY, so the same QR can be drawn again later (printed badges, a lost email) without storing the
// secret; only its hash is kept for checking scans.
// Once a registration is settled (submitted, payment approved, everyone's arrival and departure entered),
// every person gets a credential and the Team Leader is emailed each person's badge as a PDF. After that, a change to
// a name, role, team or QR, or a person added or removed, is emailed again the next morning (jobs.js). Staff, guides,
// volunteers and guests (event_staff) get theirs when they are added in the back office.
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { HttpError } from './auth.js'
import { badgesPdf, unprintable } from './badge-pdf.js'
import { buildBadgesEmail, deliverEmail, queueEmail } from './email.js'
import { loadSettings } from './fees.js'
import { hashToken, insertAudit, portalUrl, query, requireDb, withTransaction } from './lib.js'

const signingKey = process.env.BADGE_SIGNING_KEY

/** The secret for a public id. Without a signing key (local development) it is random and cannot be redrawn. */
export function badgeSecret(publicId) {
  if (!signingKey) return crypto.randomBytes(24).toString('base64url')
  return crypto.createHmac('sha256', signingKey).update(publicId).digest('base64url').slice(0, 32)
}

// The public id (a UUID) is written in 22 characters rather than 36, which keeps the QR less dense.
const shortId = (publicId) => Buffer.from(publicId.replace(/-/g, ''), 'hex').toString('base64url')
const longId = (short) => Buffer.from(short, 'base64url').toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')

export const badgePayload = (publicId, secret) => `${portalUrl}/b#${shortId(publicId)}.${secret}`

/**
 * The public id and secret in whatever a scanner read or someone typed: the badge link, the code after its `#`,
 * or the `IOL2027:<uuid>.<secret>` form of the QR codes emailed before badges became links. Null if it is none of these.
 */
export function parseBadgeCode(text) {
  let code = String(text ?? '').trim()
  if (code.includes('#')) code = code.slice(code.lastIndexOf('#') + 1)
  else if (code.startsWith('IOL2027:')) code = code.slice('IOL2027:'.length)
  const separator = code.indexOf('.')
  if (separator < 1) return null
  let publicId = code.slice(0, separator)
  const secret = code.slice(separator + 1)
  if (/^[A-Za-z0-9_-]{22}$/.test(publicId)) publicId = longId(publicId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId) || !/^[A-Za-z0-9_-]{16,64}$/.test(secret)) return null
  return { publicId: publicId.toLowerCase(), secret }
}

/** The badge's QR content drawn again from the signing key, or null if it was issued without the key (reissue it). */
export function redrawPayload(credential) {
  const secret = badgeSecret(credential.public_id)
  return hashToken(secret) === credential.secret_hash ? badgePayload(credential.public_id, secret) : null
}

const qrOptions = { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#160c1b', light: '#ffffff' } }
export const badgeQrDataUrl = (payload) => QRCode.toDataURL(payload, qrOptions)

const roleLabels = { contestant: 'Contestant', team_leader: 'Team Leader', observer: 'Observer', staff: 'Staff', guide: 'Guide', volunteer: 'Volunteer', guest: 'Guest' }

/** The first of these names that every badge font can print: a name in a script without a font falls back to another. */
const printableName = (...names) => names.find((name) => name && !unprintable(name)) ?? names.find(Boolean)

/**
 * What is printed on a badge, and a fingerprint of it (with the QR) to tell when a printed or emailed badge is out of
 * date. `row` has kind ('member' or 'staff'), public_id, badge_name, display_name, official_name, role, place, team_name.
 */
export function badgeContent(row) {
  const name = printableName(row.badge_name, row.display_name, row.official_name)
  const fullName = row.official_name && !unprintable(row.official_name) && row.official_name !== name ? row.official_name : null
  const content = {
    kind: row.kind, name, fullName, place: row.place, role: roleLabels[row.role] ?? row.role,
    detail: row.role === 'contestant' && row.team_name ? `Team ${row.team_name}` : null,
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([row.public_id, content])).digest('hex').slice(0, 24)
  return { content, fingerprint }
}

/** Issues (or reissues) a credential for a delegation member ({ memberId }) or an event staff member ({ staffId }). */
export async function issueBadge(db, { memberId = null, staffId = null }) {
  const publicId = crypto.randomUUID()
  const secret = badgeSecret(publicId)
  const credential = (await db.query(
    `INSERT INTO badge_credentials (member_id, staff_id, public_id, secret_hash, status) VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (${memberId ? 'member_id' : 'staff_id'}) DO UPDATE SET public_id = EXCLUDED.public_id, secret_hash = EXCLUDED.secret_hash,
       status = 'active', issued_at = now(), revoked_at = NULL
     RETURNING id, member_id, staff_id, public_id, status, issued_at`,
    [memberId, staffId, publicId, hashToken(secret)],
  )).rows[0]
  return { credential, payload: badgePayload(publicId, secret) }
}

/**
 * The credential a scanned code belongs to, with whose badge it is. Throws 400 for a code that is not a badge or
 * whose secret does not match, and 404 for one that is no longer on file (replaced by a new QR, or removed).
 */
export async function findBadge(text) {
  const code = parseBadgeCode(text)
  if (!code) throw new HttpError(400, 'This is not an IOL 2027 badge code.')
  const credential = (await query(
    `SELECT bc.id, bc.member_id, bc.staff_id, bc.secret_hash, bc.status, bc.issued_at,
       COALESCE(m.display_name, s.full_name) AS display_name, COALESCE(m.badge_name, s.badge_name) AS badge_name,
       COALESCE(m.official_name, s.full_name) AS official_name, COALESCE(m.role, s.category) AS role,
       COALESCE(d.country_territory, s.assignment) AS place, t.name AS team_name
     FROM badge_credentials bc
     LEFT JOIN members m ON m.id = bc.member_id LEFT JOIN delegations d ON d.id = m.delegation_id LEFT JOIN teams t ON t.id = m.team_id
     LEFT JOIN event_staff s ON s.id = bc.staff_id
     WHERE bc.public_id = $1`,
    [code.publicId],
  )).rows[0]
  if (!credential) throw new HttpError(404, 'This badge is no longer valid. It may have been replaced by a new one.')
  const supplied = Buffer.from(hashToken(code.secret), 'hex')
  const stored = Buffer.from(credential.secret_hash, 'hex')
  if (!(supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored))) throw new HttpError(400, 'This badge code is not valid.')
  return credential
}

/** People who still need an arrival or a departure (with a date) in the Travel step, e.g. "Mali Phan: departure details". */
export async function missingTravel(delegationId) {
  const people = await query(
    `SELECT m.display_name,
       EXISTS (SELECT 1 FROM travel_record_people tp JOIN travel_records tr ON tr.id = tp.travel_record_id
               WHERE tp.member_id = m.id AND tr.direction = 'arrival' AND tr.local_date IS NOT NULL) AS has_arrival,
       EXISTS (SELECT 1 FROM travel_record_people tp JOIN travel_records tr ON tr.id = tp.travel_record_id
               WHERE tp.member_id = m.id AND tr.direction = 'departure' AND tr.local_date IS NOT NULL) AS has_departure
     FROM members m WHERE m.delegation_id = $1 ORDER BY m.created_at`,
    [delegationId],
  )
  if (!people.rowCount) return ['Add the people in the delegation']
  return people.rows
    .map((person) => ({ name: person.display_name, gaps: [!person.has_arrival && 'arrival', !person.has_departure && 'departure'].filter(Boolean) }))
    .filter((person) => person.gaps.length)
    .map((person) => `${person.name}: ${person.gaps.join(' and ')} details`)
}

/** What still stands between this registration and its QR badges. Empty when it is settled. */
export async function badgeBlockers(delegationId) {
  const d = (await query('SELECT registration_status, payment_status FROM delegations WHERE id = $1', [delegationId])).rows[0]
  if (!d) return ['Registration not found']
  const blockers = []
  if (d.registration_status === 'draft' || d.registration_status === 'cancelled') blockers.push('Submit the registration')
  if (d.payment_status !== 'approved') blockers.push('Payment confirmed by Finance')
  return [...blockers, ...(await missingTravel(delegationId))]
}

// Delegation members with a badge, in the order the email lists them.
const memberBadges = (db, delegationId) => db.query(
  `SELECT bc.id, bc.member_id, bc.public_id, bc.secret_hash, 'member' AS kind, m.display_name, m.badge_name, m.official_name, m.role,
     d.country_territory AS place, t.name AS team_name
   FROM badge_credentials bc JOIN members m ON m.id = bc.member_id JOIN delegations d ON d.id = m.delegation_id LEFT JOIN teams t ON t.id = m.team_id
   WHERE m.delegation_id = $1 AND bc.status = 'active'
   ORDER BY CASE m.role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 ELSE 2 END, t.name NULLS LAST, m.display_name`,
  [delegationId],
)

/** Marks each badge new, changed or with a new QR since the badges last emailed, and lists the people since removed. */
function changesSince(mailed, badges) {
  const before = new Map(mailed.map((b) => [b.id, b]))
  const marked = badges.map((b) => {
    const was = before.get(b.id)
    return { ...b, change: !was ? 'new' : was.publicId !== b.publicId ? 'new_qr' : was.fingerprint !== b.fingerprint ? 'changed' : null }
  })
  const now = new Set(badges.map((b) => b.id))
  return { badges: marked, removed: mailed.filter((b) => !now.has(b.id)).map((b) => b.name) }
}

/** A PDF file name for each badge, "IOL 2027 badge - Mali Phan.pdf", numbered when two people share a name. */
function pdfNames(badges) {
  const seen = new Map()
  return badges.map((b) => {
    const base = `IOL 2027 badge - ${b.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'badge'}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}${n > 1 ? ` (${n})` : ''}.pdf`
  })
}

/** Today's date in Bangkok, as YYYY-MM-DD. */
export const bangkokDate = (at = new Date()) => new Date(at.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * Called after anything that can settle a registration (submission, payment approval, travel changes), and by the
 * scheduled job. Issues badges for people who have none yet, then emails the Team Leader every person's badge as a
 * PDF, exactly as it will be printed: the first time as soon as the registration is settled; after that only with
 * `update` (the morning run in jobs.js) and only if a badge changed, so a day of edits becomes one email.
 * Safe to call repeatedly.
 */
export async function sendBadgesIfSettled(delegationId, { update = false } = {}) {
  if ((await badgeBlockers(delegationId)).length) return { sent: false }
  const { badges: { printCutoff } } = await loadSettings(requireDb())
  const delivery = await withTransaction(async (client) => {
    // One delegation at a time, so two triggers at once cannot both issue the same badges or both send the email.
    const d = (await client.query(
      'SELECT id, country_territory, primary_team_leader_name, team_leader_email, badges_mailed FROM delegations WHERE id = $1 FOR UPDATE',
      [delegationId],
    )).rows[0]
    const missing = (await client.query(
      `SELECT m.id FROM members m LEFT JOIN badge_credentials bc ON bc.member_id = m.id
       WHERE m.delegation_id = $1 AND bc.id IS NULL`,
      [delegationId],
    )).rows
    const issued = new Map()
    for (const { id } of missing) issued.set(id, (await issueBadge(client, { memberId: id })).payload)
    if (missing.length) await insertAudit(client, { delegationId, eventType: 'badges_issued', entityType: 'delegation', entityId: delegationId, details: { count: missing.length } })
    const mailed = d.badges_mailed
    if (mailed && !update) return null

    const badges = []
    for (const row of (await memberBadges(client, delegationId)).rows) {
      // New badges from this run, earlier ones redrawn from the signing key (null if issued without it; staff reissue those).
      const payload = issued.get(row.member_id) ?? redrawPayload(row)
      if (!payload) continue
      const { content, fingerprint } = badgeContent(row)
      badges.push({ id: row.id, publicId: row.public_id, name: content.name, fingerprint, content, payload, skippedName: unprintable(row.badge_name ?? '') ? row.badge_name : null })
    }
    const { badges: marked, removed } = changesSince(mailed ?? [], badges)
    if (!marked.length || (mailed && !removed.length && !marked.some((b) => b.change))) return null

    const files = pdfNames(marked)
    const attachments = []
    for (const [i, b] of marked.entries()) {
      const content = await badgesPdf([{ ...b.content, payload: b.payload }], { layout: 'preview', title: `IOL 2027 badge, ${b.name}` })
      attachments.push({ filename: files[i], content, contentType: 'application/pdf' })
    }
    const { subject, html } = buildBadgesEmail({
      countryTerritory: d.country_territory, fullName: d.primary_team_leader_name, update: Boolean(mailed), removed,
      people: marked.map((b) => ({ ...b.content, change: mailed ? b.change : null, skippedName: b.skippedName })),
      printCutoff, cutoffPassed: bangkokDate() > printCutoff, portalUrl,
    })
    await client.query(
      'UPDATE delegations SET badges_mailed = $2, badges_mailed_at = now() WHERE id = $1',
      [delegationId, JSON.stringify(badges.map(({ id, name, fingerprint, publicId }) => ({ id, name, fingerprint, publicId })))],
    )
    return queueEmail(client, { to: d.team_leader_email, subject, html, attachments, purpose: mailed ? 'badges_updated' : 'badges_issued', delegationId, retry: true })
  })
  if (!delivery) return { sent: false }
  // A failed send is kept, and the scheduled job tries it again.
  if (delivery.status === 'sending') await deliverEmail(requireDb(), delivery).catch((error) => console.error('badges email failed', error.message))
  return { sent: true, status: delivery.status }
}
