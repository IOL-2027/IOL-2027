// The back office's Badges section: every badge, for delegation members and for event staff, ready to send to
// print. Registration admins (and super admins) download print files, mark them printed, give a badge a new QR,
// and add the staff, guides, volunteers and guests who are not in any delegation. See docs/ROLES.md.
import crypto from 'node:crypto'
import { HttpError, requireRole } from './auth.js'
import { badgesPdf, unprintable } from './badge-pdf.js'
import { issueBadge, redrawPayload } from './badges.js'
import { loadSettings } from './fees.js'
import { asyncHandler, insertAudit, isEmail, optionalString, query, requireDb, withTransaction } from './lib.js'

const STAFF_CATEGORIES = ['staff', 'guide', 'volunteer', 'guest']
const roleLabels = { contestant: 'Contestant', team_leader: 'Team Leader', observer: 'Observer', staff: 'Staff', guide: 'Guide', volunteer: 'Volunteer', guest: 'Guest' }
const PRINT_STATES = ['not_printed', 'reprint', 'printed']

const badgeRows = (where = 'TRUE', params = []) => query(
  `SELECT * FROM (
     SELECT bc.id, bc.public_id, bc.secret_hash, bc.status, bc.issued_at, bc.printed_at, bc.printed_fingerprint,
       'member' AS kind, m.id AS holder_id, m.display_name, m.badge_name, m.official_name, m.role,
       d.country_territory AS place, d.id AS delegation_id, t.name AS team_name, NULL AS email
     FROM badge_credentials bc JOIN members m ON m.id = bc.member_id JOIN delegations d ON d.id = m.delegation_id
     LEFT JOIN teams t ON t.id = m.team_id
     UNION ALL
     SELECT bc.id, bc.public_id, bc.secret_hash, bc.status, bc.issued_at, bc.printed_at, bc.printed_fingerprint,
       'staff', s.id, s.full_name, s.badge_name, s.full_name, s.category, s.assignment, NULL, NULL, s.email
     FROM badge_credentials bc JOIN event_staff s ON s.id = bc.staff_id
   ) b WHERE ${where}
   ORDER BY b.kind, b.place NULLS LAST, CASE b.role WHEN 'team_leader' THEN 0 WHEN 'contestant' THEN 1 WHEN 'observer' THEN 2 ELSE 3 END, b.display_name`,
  params,
)

/** The first of these names that every badge font can print: a name in a script without a font falls back to another. */
const printableName = (...names) => names.find((name) => name && !unprintable(name)) ?? names.find(Boolean)

/** What is printed on a badge, and a fingerprint of it (with the QR) to tell when a printed badge is out of date. */
function badgeContent(row) {
  const name = printableName(row.badge_name, row.display_name, row.official_name)
  const fullName = row.official_name && !unprintable(row.official_name) && row.official_name !== name ? row.official_name : null
  const content = {
    kind: row.kind, name, fullName, place: row.place, role: roleLabels[row.role] ?? row.role,
    detail: row.role === 'contestant' && row.team_name ? `Team ${row.team_name}` : null,
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([row.public_id, content])).digest('hex').slice(0, 24)
  return { content, fingerprint }
}

/** A badge as the back office lists it. */
function listed(row) {
  const { content, fingerprint } = badgeContent(row)
  return {
    id: row.id, kind: row.kind, holderId: row.holder_id, delegationId: row.delegation_id, ...content,
    category: row.kind === 'staff' ? row.role : null, badgeName: row.badge_name, email: row.email,
    status: row.status, issuedAt: row.issued_at, printedAt: row.printed_at, fingerprint,
    printState: !row.printed_at ? 'not_printed' : row.printed_fingerprint === fingerprint ? 'printed' : 'reprint',
    // Characters that would not print in the names shown (the badge falls back to another name where it can).
    unprintable: unprintable(`${row.badge_name ?? ''}${row.official_name ?? ''}`),
    // Issued without the signing key (local development): its QR cannot be drawn again, so it needs a new one.
    canPrint: row.status === 'active' && Boolean(redrawPayload(row)),
  }
}

/** The badges matching the back office's filters: kind, print state, country or assignment, and a name search. */
function matching(badges, filters) {
  const term = String(filters.search ?? '').trim().toLowerCase()
  return badges.filter((b) => (!filters.kind || b.kind === filters.kind)
    && (!filters.state || filters.state === 'all' || b.printState === filters.state)
    && (!filters.place || b.place === filters.place)
    && (!term || `${b.name} ${b.fullName ?? ''} ${b.place ?? ''}`.toLowerCase().includes(term)))
}

function cleanStaff(input, where = '') {
  const fullName = optionalString(input.fullName)
  if (!fullName) throw new HttpError(400, `${where}Full name is required.`)
  if (fullName.length > 120) throw new HttpError(400, `${where}Full name must be at most 120 characters.`)
  const category = String(input.category ?? '').trim().toLowerCase()
  if (!STAFF_CATEGORIES.includes(category)) throw new HttpError(400, `${where}Role must be staff, guide, volunteer or guest.`)
  const badgeName = optionalString(input.badgeName)
  if (badgeName && badgeName.length > 60) throw new HttpError(400, `${where}Badge name must be at most 60 characters.`)
  const assignment = optionalString(input.assignment)
  if (assignment && assignment.length > 80) throw new HttpError(400, `${where}Assignment must be at most 80 characters.`)
  const email = optionalString(input.email)?.toLowerCase() ?? null
  if (email && !isEmail(email)) throw new HttpError(400, `${where}“${email}” is not an email address.`)
  return { fullName, badgeName, category, assignment, email }
}

const fileSafe = (text) => text.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'badge'

export function registerBadgeRoutes(app, { signedIn }) {
  const admin = [...signedIn, requireRole('registration_admin')]

  app.get('/api/admin/badges', ...admin, asyncHandler(async (_req, res) => {
    const [rows, waiting, settings] = await Promise.all([
      badgeRows(),
      // Members of countries that are not settled yet have no badge; their countries still need to finish.
      query(
        `SELECT d.country_territory AS country, count(*)::int AS people FROM members m JOIN delegations d ON d.id = m.delegation_id
         LEFT JOIN badge_credentials bc ON bc.member_id = m.id WHERE bc.id IS NULL GROUP BY 1 ORDER BY 1`,
      ),
      loadSettings(requireDb()),
    ])
    res.json({ badges: rows.rows.map(listed), waiting: waiting.rows, printCutoff: settings.badges.printCutoff, categories: STAFF_CATEGORIES })
  }))

  // A print file for the badges matching the filters (or one badge, `id`): `layout` shop, a4 or preview.
  app.get('/api/admin/badges/print', ...admin, asyncHandler(async (req, res) => {
    const layout = ['shop', 'a4', 'preview'].includes(req.query.layout) ? req.query.layout : 'shop'
    const id = optionalString(req.query.id)
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Unknown badge.')
    const filters = { kind: optionalString(req.query.kind), state: optionalString(req.query.state), place: optionalString(req.query.place), search: req.query.search }
    if (filters.state && filters.state !== 'all' && !PRINT_STATES.includes(filters.state)) throw new HttpError(400, 'Unknown print state.')
    const rows = (await badgeRows(id ? 'b.id = $1' : 'TRUE', id ? [id] : [])).rows
    const byId = new Map(rows.map((row) => [row.id, row]))
    const chosen = (id ? rows.map(listed) : matching(rows.map(listed), filters)).filter((b) => b.canPrint)
    if (!chosen.length) throw new HttpError(404, id ? 'This badge cannot be printed. Give it a new QR first.' : 'No badges match, or none of them can be printed yet.')
    const pdf = await badgesPdf(chosen.map((b) => ({ ...b, payload: redrawPayload(byId.get(b.id)) })), { layout, title: id ? `IOL 2027 badge, ${chosen[0].name}` : 'IOL 2027 badges' })
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'badges_print_file', entityType: 'badge', entityId: id, details: { count: chosen.length, layout, ...filters } })
    const name = id ? `IOL2027-badge-${fileSafe(chosen[0].name)}` : `IOL2027-badges-${filters.kind ?? 'all'}-${filters.state ?? 'all'}-${new Date().toISOString().slice(0, 10)}`
    res.set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${name}.pdf"`)
      .send(pdf)
  }))

  // After the print file went to print: records what was printed on each badge (the fingerprint the list showed).
  app.post('/api/admin/badges/printed', ...admin, asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.badges) ? req.body.badges : []
    if (!list.length || list.length > 2000) throw new HttpError(400, 'Choose between 1 and 2000 badges.')
    if (!list.every((b) => /^[0-9a-f-]{36}$/i.test(String(b?.id)) && /^[0-9a-f]{24}$/.test(String(b?.fingerprint)))) throw new HttpError(400, 'Unknown badge.')
    const marked = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE badge_credentials bc SET printed_at = now(), printed_fingerprint = x.fingerprint
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, fingerprint text) WHERE bc.id = x.id`,
        [JSON.stringify(list.map(({ id, fingerprint }) => ({ id, fingerprint })))],
      )
      await insertAudit(client, { actorAccountId: req.user.id, eventType: 'badges_marked_printed', entityType: 'badge', details: { count: result.rowCount } })
      return result.rowCount
    })
    res.json({ marked })
  }))

  // A new QR for a lost or misused badge. The old one stops working at once; the badge needs printing again.
  app.post('/api/admin/badges/:badgeId/new-qr', ...admin, asyncHandler(async (req, res) => {
    const row = (await query('SELECT id, member_id, staff_id FROM badge_credentials WHERE id = $1', [req.params.badgeId])).rows[0]
    if (!row) throw new HttpError(404, 'Badge not found.')
    const { credential } = await issueBadge(requireDb(), { memberId: row.member_id, staffId: row.staff_id })
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'badge_new_qr', entityType: 'badge', entityId: credential.id })
    res.json({ badge: listed((await badgeRows('b.id = $1', [credential.id])).rows[0]) })
  }))

  /* Staff, guides, volunteers and guests ---------------------------- */

  app.post('/api/admin/event-staff', ...admin, asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.people) ? req.body.people : [req.body]
    if (!list.length || list.length > 300) throw new HttpError(400, 'Add between 1 and 300 people at a time.')
    const people = list.map((item, i) => cleanStaff(item ?? {}, list.length > 1 ? `Line ${i + 1}: ` : ''))
    const ids = await withTransaction(async (client) => {
      const out = []
      for (const p of people) {
        const staff = (await client.query(
          `INSERT INTO event_staff (full_name, badge_name, category, assignment, email, created_by_account_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [p.fullName, p.badgeName, p.category, p.assignment, p.email, req.user.id],
        )).rows[0]
        out.push((await issueBadge(client, { staffId: staff.id })).credential.id)
      }
      await insertAudit(client, { actorAccountId: req.user.id, eventType: 'event_staff_added', entityType: 'event_staff', details: { count: out.length } })
      return out
    })
    res.status(201).json({ badges: (await badgeRows('b.id = ANY($1)', [ids])).rows.map(listed) })
  }))

  app.patch('/api/admin/event-staff/:staffId', ...admin, asyncHandler(async (req, res) => {
    const current = (await query('SELECT * FROM event_staff WHERE id = $1', [req.params.staffId])).rows[0]
    if (!current) throw new HttpError(404, 'Not found.')
    const p = cleanStaff({
      fullName: req.body.fullName ?? current.full_name, badgeName: 'badgeName' in req.body ? req.body.badgeName : current.badge_name,
      category: req.body.category ?? current.category, assignment: 'assignment' in req.body ? req.body.assignment : current.assignment,
      email: 'email' in req.body ? req.body.email : current.email,
    })
    await query(
      `UPDATE event_staff SET full_name = $1, badge_name = $2, category = $3, assignment = $4, email = $5, updated_at = now() WHERE id = $6`,
      [p.fullName, p.badgeName, p.category, p.assignment, p.email, current.id],
    )
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'event_staff_updated', entityType: 'event_staff', entityId: current.id })
    res.json({ badge: listed((await badgeRows(`b.kind = 'staff' AND b.holder_id = $1`, [current.id])).rows[0]) })
  }))

  app.delete('/api/admin/event-staff/:staffId', ...admin, asyncHandler(async (req, res) => {
    const removed = (await query('DELETE FROM event_staff WHERE id = $1 RETURNING id, full_name', [req.params.staffId])).rows[0]
    if (!removed) throw new HttpError(404, 'Not found.')
    await insertAudit(requireDb(), { actorAccountId: req.user.id, eventType: 'event_staff_removed', entityType: 'event_staff', entityId: removed.id, details: { name: removed.full_name } })
    res.status(204).end()
  }))
}
