// QR badges. Each person gets one credential; the QR holds `IOL2027:<public id>.<secret>` and no personal data.
// The secret is derived from the public id with BADGE_SIGNING_KEY, so the same QR can be drawn again later
// (printed badges, a lost email) without storing the secret; only its hash is kept for checking scans.
// Once a registration is settled (submitted, payment approved, everyone's arrival and departure entered),
// every person gets a credential and the Team Leader is emailed all the QR codes.
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { buildBadgesEmail, sendEmail } from './email.js'
import { hashToken, insertAudit, query, requireDb, withTransaction } from './lib.js'

const signingKey = process.env.BADGE_SIGNING_KEY

/** The secret for a public id. Without a signing key (local development) it is random and cannot be redrawn. */
export function badgeSecret(publicId) {
  if (!signingKey) return crypto.randomBytes(24).toString('base64url')
  return crypto.createHmac('sha256', signingKey).update(publicId).digest('base64url').slice(0, 32)
}

export const badgePayload = (publicId, secret) => `IOL2027:${publicId}.${secret}`

const qrOptions = { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#160c1b', light: '#ffffff' } }
export const badgeQrDataUrl = (payload) => QRCode.toDataURL(payload, qrOptions)
const badgeQrPng = (payload) => QRCode.toBuffer(payload, { ...qrOptions, type: 'png', width: 360 })

/** Issues (or reissues) one person's credential and returns it with its QR payload. */
export async function issueBadge(db, memberId) {
  const publicId = crypto.randomUUID()
  const secret = badgeSecret(publicId)
  const credential = (await db.query(
    `INSERT INTO badge_credentials (member_id, public_id, secret_hash, status) VALUES ($1, $2, $3, 'active')
     ON CONFLICT (member_id) DO UPDATE SET public_id = EXCLUDED.public_id, secret_hash = EXCLUDED.secret_hash, status = 'active', issued_at = now(), revoked_at = NULL
     RETURNING id, member_id, public_id, status, issued_at`,
    [memberId, publicId, hashToken(secret)],
  )).rows[0]
  return { credential, payload: badgePayload(publicId, secret) }
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

/**
 * Called after anything that can settle a registration (submission, payment approval, travel changes).
 * Issues credentials for people who have none yet and, if any were issued, emails the Team Leader every
 * person's QR code. Safe to call repeatedly: people who already have a badge are not issued again.
 */
export async function sendBadgesIfSettled(delegationId) {
  if ((await badgeBlockers(delegationId)).length) return { sent: false }
  const issued = await withTransaction(async (client) => {
    // One delegation at a time, so two simultaneous triggers cannot both issue the same badges.
    await client.query('SELECT 1 FROM delegations WHERE id = $1 FOR UPDATE', [delegationId])
    const missing = (await client.query(
      `SELECT m.id FROM members m LEFT JOIN badge_credentials bc ON bc.member_id = m.id
       WHERE m.delegation_id = $1 AND bc.id IS NULL`,
      [delegationId],
    )).rows
    const payloads = new Map()
    for (const { id } of missing) payloads.set(id, (await issueBadge(client, id)).payload)
    if (missing.length) await insertAudit(client, { delegationId, eventType: 'badges_issued', entityType: 'delegation', entityId: delegationId, details: { count: missing.length } })
    return payloads
  })
  if (!issued.size) return { sent: false }

  // Everyone's code goes in the email: new badges from this run, earlier ones redrawn from the signing key.
  const d = (await query('SELECT id, country_territory, primary_team_leader_name, team_leader_email FROM delegations WHERE id = $1', [delegationId])).rows[0]
  const people = (await query(
    `SELECT m.id, m.display_name, m.badge_name, m.role, t.name AS team_name, bc.public_id, bc.secret_hash
     FROM members m JOIN badge_credentials bc ON bc.member_id = m.id AND bc.status = 'active' LEFT JOIN teams t ON t.id = m.team_id
     WHERE m.delegation_id = $1 ORDER BY CASE m.role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 ELSE 2 END, t.name NULLS LAST, m.display_name`,
    [delegationId],
  )).rows
  const attachments = []
  const listed = []
  for (const [index, person] of people.entries()) {
    let payload = issued.get(person.id)
    if (!payload) {
      const secret = badgeSecret(person.public_id)
      if (hashToken(secret) !== person.secret_hash) continue // issued without the signing key; staff can reissue it
      payload = badgePayload(person.public_id, secret)
    }
    const cid = `badge-${index}@iol2027`
    attachments.push({ filename: `IOL2027-badge-${(person.badge_name || person.display_name).replace(/[^\w-]+/g, '-')}.png`, content: await badgeQrPng(payload), contentType: 'image/png', cid })
    listed.push({ name: person.display_name, role: person.role, team: person.team_name, cid })
  }
  const { subject, html } = buildBadgesEmail({ countryTerritory: d.country_territory, fullName: d.primary_team_leader_name, people: listed, newCount: issued.size })
  await sendEmail({ pool: requireDb(), to: d.team_leader_email, subject, html, attachments, purpose: 'badges_issued', delegationId })
  return { sent: true, count: listed.length }
}
