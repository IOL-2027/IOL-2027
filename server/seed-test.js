// Creates (or recreates) the test accounts and test delegations listed in docs/ROLES.md.
// Only rows belonging to @iol2027.test accounts and TEST invite codes are touched.
// usage: TEST_ACCOUNT_PASSWORD=... npm run db:seed-test
import 'dotenv/config'
import pg from 'pg'
import { checkPasswordRules, hashPassword } from './auth.js'

const password = process.env.TEST_ACCOUNT_PASSWORD
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
if (!password) { console.error('TEST_ACCOUNT_PASSWORD is not set.'); process.exit(1) }
checkPasswordRules(password)

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()

const staff = [
  ['admin@iol2027.test', 'Registration Admin (TEST)', 'registration_admin'],
  ['finance@iol2027.test', 'Finance Admin (TEST)', 'finance_admin'],
  ['checkin@iol2027.test', 'Check-in Staff (TEST)', 'checkin_staff'],
  ['welfare@iol2027.test', 'Welfare Staff (TEST)', 'welfare_staff'],
  ['content@iol2027.test', 'Content Editor (TEST)', 'content_editor'],
  ['results@iol2027.test', 'Results Staff (TEST)', 'results_staff'],
  ['viewer@iol2027.test', 'Viewer (TEST)', 'viewer'],
  ['superadmin@iol2027.test', 'Super Admin (TEST)', 'super_admin'],
]

const delegations = [
  {
    code: 'IOL2027-THA-TEST', country: 'Thailand (TEST)', org: 'National Linguistics Olympiad Thailand',
    leader: ['tl.thailand@iol2027.test', 'Dr. Ananya Somchai'], teams: ['Thailand A', 'Thailand B'], codes: ['THA-A', 'THA-B'],
    contestLanguage: ['English', null],
    people: [
      { name: 'Narin Chaiwat', team: 0, gender: 'Male', dob: '2009-02-12', passport: 'AA1234567', passportName: 'CHAIWAT NARIN', shirt: 'M', food: 'No shellfish', medical: 'No special requirements', emergency: 'Somchai Chaiwat, +66 82 111 2233' },
      { name: 'Mali Phan', team: 0, gender: 'Female', dob: null, passport: 'AA7654321', passportName: 'PHAN MALI', shirt: 'S', food: 'Vegetarian', medical: 'No special requirements', emergency: 'Nok Phan, +66 82 222 3344' },
      { name: 'Kiet Rattanakul', team: 0, gender: 'Male', dob: '2009-06-03', passport: 'AA2468101', passportName: 'RATTANAKUL KIET', shirt: 'M', food: 'No pork', medical: 'Carries an inhaler', emergency: 'Arun Rattanakul, +66 82 333 4455' },
    ],
    participant: ['participant.thailand@iol2027.test', 'Narin Chaiwat'],
  },
  {
    code: 'IOL2027-JPN-TEST', country: 'Japan (TEST)', org: 'Japan Linguistics Olympiad',
    leader: ['tl.japan@iol2027.test', 'Prof. Haruki Sato'], teams: ['Japan A'], codes: ['JAP-A'], contestLanguage: ['English'],
    people: [
      { name: 'Yui Tanaka', team: 0, gender: 'Female', dob: '2008-09-30', passport: 'TK0012345', passportName: 'TANAKA YUI', shirt: 'S', food: 'No restrictions', medical: 'No special requirements', emergency: 'Kenji Tanaka, +81 90 1234 5678' },
    ],
  },
]

// A Team Leader at the very start of the flow, as if they had just used their invitation code: for walking
// through every step (payment, people, travel, submit) with a staff account approving the payment.
// DEMO_LEADER_EMAIL can point it at a real inbox so the emails arrive; otherwise it uses a .test address (no emails).
const demo = {
  email: (process.env.DEMO_LEADER_EMAIL || 'demo.leader@iol2027.test').toLowerCase(),
  name: 'Demo Team Leader (TEST)', country: 'Demoland (TEST)', org: 'Demoland Linguistics Olympiad', code: 'IOL2027-DEM-TEST',
}

const hash = hashPassword(password)
try {
  await db.query('BEGIN')
  // Remove previous test data: delegations first (members cascade), then accounts, then codes. Test accounts are
  // @iol2027.test addresses, the demo address, and anyone who signed up with a test code (e.g. the demo pointed at a
  // real inbox on an earlier run, or someone trying the sign-up with IOL2027-TST-0001).
  const testCodes = `code LIKE 'IOL2027-%-TEST' OR code LIKE 'IOL2027-TST-%' OR country_territory LIKE '%(TEST)'`
  const testAccounts = (await db.query(
    `SELECT id FROM accounts WHERE email LIKE '%@iol2027.test' OR email = $1 OR id IN (SELECT used_by_account_id FROM invite_codes WHERE ${testCodes})
       OR id IN (SELECT account_id FROM delegations WHERE invite_code_id IN (SELECT id FROM invite_codes WHERE ${testCodes}))`,
    [demo.email],
  )).rows.map((row) => row.id)
  await db.query(`DELETE FROM delegations WHERE country_territory LIKE '%(TEST)' OR account_id = ANY($1)`, [testAccounts])
  await db.query('DELETE FROM accounts WHERE id = ANY($1)', [testAccounts])
  await db.query(`DELETE FROM invite_codes WHERE ${testCodes}`)

  for (const [email, name, role] of staff) {
    await db.query(`INSERT INTO accounts (email, full_name, password_hash, role, email_verified_at) VALUES ($1, $2, $3, $4, now())`, [email, name, hash, role])
  }

  for (const d of delegations) {
    const account = (await db.query(
      `INSERT INTO accounts (email, full_name, password_hash, role, email_verified_at) VALUES ($1, $2, $3, 'team_leader', now()) RETURNING id`,
      [d.leader[0], d.leader[1], hash],
    )).rows[0]
    const invite = (await db.query(
      `INSERT INTO invite_codes (code, country_territory, accredited_organisation, contact_email, status, used_at, used_by_account_id)
       VALUES ($1, $2, $3, $4, 'used', now(), $5) RETURNING id`,
      [d.code, d.country, d.org, d.leader[0], account.id],
    )).rows[0]
    const delegation = (await db.query(
      `INSERT INTO delegations (account_id, invite_code_id, country_territory, accredited_organisation, primary_team_leader_name, team_leader_email,
         number_of_teams, number_of_contestants, number_of_observers, completed_steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, '{start,setup}') RETURNING id`,
      [account.id, invite.id, d.country, d.org, d.leader[1], d.leader[0], d.teams.length, d.teams.length * 4],
    )).rows[0]
    await db.query(
      `INSERT INTO members (delegation_id, role, display_name, badge_name, official_name, email) VALUES ($1, 'team_leader', $2, $2, $2, $3)`,
      [delegation.id, d.leader[1], d.leader[0]],
    )
    const teamIds = []
    for (const [i, name] of d.teams.entries()) {
      teamIds.push((await db.query(
        `INSERT INTO teams (delegation_id, name, code, contest_language, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [delegation.id, name, d.codes[i], d.contestLanguage[i], d.contestLanguage[i] ? 'ready' : 'draft'],
      )).rows[0].id)
    }
    let firstMemberId = null
    for (const p of d.people) {
      const id = (await db.query(
        `INSERT INTO members (delegation_id, team_id, role, display_name, badge_name, official_name, passport_name, passport_number, passport_nationality,
           date_of_birth, gender_for_room_allocation, exam_language, tshirt_size, polo_size, food_allergy_notes, medical_accessibility_notes, emergency_contact)
         VALUES ($1, $2, 'contestant', $3, $4, $3, $5, $6, $7, $8, $9, 'English', $10, $10, $11, $12, $13) RETURNING id`,
        [delegation.id, teamIds[p.team], p.name, p.name.split(' ')[0], p.passportName, p.passport, d.country.replace(' (TEST)', ''), p.dob, p.gender, p.shirt, p.food, p.medical, p.emergency],
      )).rows[0].id
      firstMemberId ??= id
    }
    if (d.participant) {
      await db.query(
        `INSERT INTO accounts (email, full_name, password_hash, role, member_id, email_verified_at) VALUES ($1, $2, $3, 'participant', $4, now())`,
        [d.participant[0], d.participant[1], hash, firstMemberId],
      )
    }
  }

  for (const [code, country] of [['IOL2027-TST-0001', 'Testland (TEST)'], ['IOL2027-TST-0002', 'Sampleland (TEST)']]) {
    await db.query(`INSERT INTO invite_codes (code, country_territory, accredited_organisation, status) VALUES ($1, $2, 'Test organisation', 'active')`, [code, country])
  }
  // Works every time on a test server: each use replaces the account made with it before (server/index.js).
  await db.query(`INSERT INTO invite_codes (code, country_territory, accredited_organisation, status, reusable) VALUES ('IOL2027-TST-LOOP', 'Loopland (TEST)', 'Test organisation', 'active', true)`)

  // The demo Team Leader: same starting point as a new sign-up (one team, four contestant places, nothing filled in).
  const demoAccount = (await db.query(
    `INSERT INTO accounts (email, full_name, password_hash, role, email_verified_at) VALUES ($1, $2, $3, 'team_leader', now()) RETURNING id`,
    [demo.email, demo.name, hash],
  )).rows[0]
  const demoInvite = (await db.query(
    `INSERT INTO invite_codes (code, country_territory, accredited_organisation, contact_email, status, used_at, used_by_account_id)
     VALUES ($1, $2, $3, $4, 'used', now(), $5) RETURNING id`,
    [demo.code, demo.country, demo.org, demo.email, demoAccount.id],
  )).rows[0]
  const demoDelegation = (await db.query(
    `INSERT INTO delegations (account_id, invite_code_id, country_territory, accredited_organisation, primary_team_leader_name, team_leader_email,
       registration_contact_email, number_of_teams, number_of_contestants, number_of_observers)
     VALUES ($1, $2, $3, $4, $5, $6, $6, 1, 4, 0) RETURNING id`,
    [demoAccount.id, demoInvite.id, demo.country, demo.org, demo.name, demo.email],
  )).rows[0]
  await db.query(
    `INSERT INTO members (delegation_id, role, display_name, badge_name, official_name, email) VALUES ($1, 'team_leader', $2, $2, $2, $3)`,
    [demoDelegation.id, demo.name, demo.email],
  )
  await db.query(`INSERT INTO teams (delegation_id, name, code, status) VALUES ($1, 'Demoland A', 'DEM-A', 'draft')`, [demoDelegation.id])
  await db.query('COMMIT')
  const count = (await db.query(`SELECT count(*)::int AS n FROM accounts WHERE email LIKE '%@iol2027.test'`)).rows[0].n
  console.log(`test data ready: ${count} @iol2027.test accounts, 3 delegations (demo leader ${demo.email}), 2 unused invite codes and the reusable IOL2027-TST-LOOP`)
} catch (error) {
  await db.query('ROLLBACK')
  throw error
} finally {
  await db.end()
}
