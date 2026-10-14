// End-to-end API checks against a running server. usage: BASE=http://localhost:4000 PW=... node api-test.mjs
import fs from 'node:fs'
const BASE = process.env.BASE ?? 'http://localhost:4000'
const PW = process.env.PW
let pass = 0, fail = 0
const results = []
function check(name, ok, detail = '') { ok ? pass++ : fail++; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`) }

class Client {
  cookie = ''
  async req(method, path, body, { header = true, form } = {}) {
    const headers = {}
    if (header) headers['X-IOL-Request'] = '1'
    if (this.cookie) headers.Cookie = this.cookie
    let payload
    if (form) payload = form
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' })
    const set = res.headers.get('set-cookie')
    if (set) { const m = set.match(/__session=([^;]*)/); if (m) this.cookie = m[1] ? `__session=${m[1]}` : '' }
    const text = await res.text()
    let json = null; try { json = JSON.parse(text) } catch {}
    return { status: res.status, json, headers: res.headers, text }
  }
  get(p) { return this.req('GET', p) }
  post(p, b, o) { return this.req('POST', p, b ?? {}, o) }
  patch(p, b) { return this.req('PATCH', p, b) }
  put(p, b) { return this.req('PUT', p, b) }
}
async function login(email) {
  const c = new Client()
  const r = await c.post('/api/auth/login', { email, password: PW })
  return { c, r }
}

// --- basics
const anon = new Client()
check('health', (await anon.get('/api/health')).json?.ok === true)
check('me without session is null', (await anon.get('/api/auth/me')).json?.user === null)
check('POST without X-IOL-Request is refused (403)', (await anon.req('POST', '/api/auth/login', { email: 'x', password: 'y' }, { header: false })).status === 403)
check('wrong password -> 401', (await anon.post('/api/auth/login', { email: 'admin@iol2027.test', password: 'wrong-password-123' })).status === 401)
check('unknown route -> 404 JSON', (await anon.get('/api/nope')).status === 404)

// --- every role signs in, cookie flags
const roles = {
  'tl.thailand@iol2027.test': 'team_leader', 'tl.japan@iol2027.test': 'team_leader', 'participant.thailand@iol2027.test': 'participant',
  'admin@iol2027.test': 'registration_admin', 'finance@iol2027.test': 'finance_admin', 'checkin@iol2027.test': 'checkin_staff',
  'welfare@iol2027.test': 'welfare_staff', 'content@iol2027.test': 'content_editor', 'results@iol2027.test': 'results_staff',
  'viewer@iol2027.test': 'viewer', 'superadmin@iol2027.test': 'super_admin',
}
const S = {}
for (const [email, role] of Object.entries(roles)) {
  const { c, r } = await login(email)
  S[email.split('@')[0]] = c
  check(`login ${email} -> role ${role}`, r.status === 200 && r.json?.user?.role === role, `${r.status} ${JSON.stringify(r.json)}`)
}
const raw = await new Client().post('/api/auth/login', { email: 'admin@iol2027.test', password: PW })
const setCookie = raw.headers.get('set-cookie') ?? ''
check('session cookie is HttpOnly + SameSite=Lax + named __session', /__session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), setCookie)
check('API responses are not cacheable', raw.headers.get('cache-control') === 'no-store')

const tl = S['tl.thailand'], jp = S['tl.japan']
const thaiId = (await tl.get('/api/auth/me')).json.user.delegationId
const japanId = (await jp.get('/api/auth/me')).json.user.delegationId
check('TL me includes delegationId and country', Boolean(thaiId) && (await tl.get('/api/auth/me')).json.user.country === 'Thailand (TEST)')

// --- delegation isolation + field filtering
const own = await tl.get(`/api/registration/delegations/${thaiId}`)
check('TL reads own delegation', own.status === 200)
check('TL sees own passport numbers', own.json.members.some((m) => m.passportNumber))
check('TL cannot read another country (404)', (await tl.get(`/api/registration/delegations/${japanId}`)).status === 404)
check('TL cannot edit another country (404)', (await tl.patch(`/api/registration/delegations/${japanId}`, { numberOfObservers: 3 })).status === 404)
check('Japan TL cannot read Thailand (404)', (await jp.get(`/api/registration/delegations/${thaiId}`)).status === 404)
const japanMember = (await S.admin.get(`/api/registration/delegations/${japanId}`)).json.members.find((m) => m.role === 'contestant')
check('TL cannot edit another country\'s person (404)', (await tl.patch(`/api/registration/members/${japanMember.id}`, { displayName: 'hijack' })).status === 404)
const fin = await S.finance.get(`/api/registration/delegations/${thaiId}`)
check('Finance reads delegation', fin.status === 200)
check('Finance does NOT see passport, DOB, food, medical, emergency', fin.json.members.every((m) => !('passportNumber' in m) && !('dateOfBirth' in m) && !('foodAllergyNotes' in m) && !('medicalAccessibilityNotes' in m) && !('emergencyContact' in m)))
const wel = await S.welfare.get(`/api/registration/delegations/${thaiId}`)
check('Welfare sees food/medical but NOT passport', wel.json.members.some((m) => 'foodAllergyNotes' in m) && wel.json.members.every((m) => !('passportNumber' in m)))
check('Welfare cannot edit (404)', (await S.welfare.patch(`/api/registration/delegations/${thaiId}`, { numberOfObservers: 1 })).status === 404)
check('Viewer cannot read a delegation (404)', (await S.viewer.get(`/api/registration/delegations/${thaiId}`)).status === 404)
check('Check-in staff cannot read a delegation (404)', (await S.checkin.get(`/api/registration/delegations/${thaiId}`)).status === 404)
check('Participant cannot read the delegation (404)', (await S['participant.thailand'].get(`/api/registration/delegations/${thaiId}`)).status === 404)
check('Participant reads own record', (await S['participant.thailand'].get('/api/participant/me')).json?.member?.displayName === 'Narin Chaiwat')

// --- staff endpoints by role
const can = async (c, path) => (await c.get(path)).status
check('Viewer: dashboard 200', await can(S.viewer, '/api/admin/dashboard') === 200)
check('Viewer: delegations list 403', await can(S.viewer, '/api/admin/delegations') === 403)
check('Content editor: dashboard 403', await can(S.content, '/api/admin/dashboard') === 403)
check('Results staff: dashboard 403', await can(S.results, '/api/admin/dashboard') === 403)
check('Check-in: dashboard 403', await can(S.checkin, '/api/admin/dashboard') === 403)
check('Welfare: welfare list 200', await can(S.welfare, '/api/admin/welfare') === 200)
check('Welfare: payments 403', await can(S.welfare, '/api/admin/payments') === 403)
check('TL: dashboard 403', await can(tl, '/api/admin/dashboard') === 403)
check('Admin: email log 200', await can(S.admin, '/api/admin/email-deliveries') === 200)
check('Finance: email log 403', await can(S.finance, '/api/admin/email-deliveries') === 403)
check('Super admin: accounts 200', await can(S.superadmin, '/api/admin/accounts') === 200)
check('Admin: accounts 403', await can(S.admin, '/api/admin/accounts') === 403)

// --- Team Leader journey with payment gate
check('setup: 2 teams, 1 observer', (await tl.patch(`/api/registration/delegations/${thaiId}`, { numberOfTeams: 2, numberOfObservers: 1 })).status === 200)
check('invalid team count rejected', (await tl.patch(`/api/registration/delegations/${thaiId}`, { numberOfTeams: 3 })).status === 400)
check('departure before arrival rejected', (await tl.patch(`/api/registration/delegations/${thaiId}`, { declaredArrivalDate: '2027-07-20', declaredDepartureDate: '2027-07-19' })).status === 400)
check('adding a person before payment -> 409', (await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'contestant', displayName: 'Early Bird' })).status === 409)
check('proof before invoice -> 409', (await tl.post(`/api/registration/delegations/${thaiId}/payment-proof`, undefined, { form: (() => { const f = new FormData(); f.append('proof', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'p.pdf'); return f })() })).status === 409)
const inv = await tl.put(`/api/registration/delegations/${thaiId}/invoice`, { recipientName: 'National Linguistics Olympiad Thailand', invoiceCount: 1 })
check('invoice saved, amount computed by server (2 teams = 2880)', inv.status === 200 && Number(inv.json.payment.amountDue) === 2880, JSON.stringify(inv.json))
const form = new FormData(); form.append('proof', new Blob(['%PDF-1.4 test proof'], { type: 'application/pdf' }), 'transfer.pdf')
const proof = await tl.post(`/api/registration/delegations/${thaiId}/payment-proof`, undefined, { form })
check('proof upload -> awaiting_review', proof.status === 201 && proof.json.payment.status === 'awaiting_review', JSON.stringify(proof.json))
const bad = new FormData(); bad.append('proof', new Blob(['x'], { type: 'text/plain' }), 'x.txt')
check('non-PDF/JPG/PNG proof rejected', (await tl.post(`/api/registration/delegations/${thaiId}/payment-proof`, undefined, { form: bad })).status === 400)
const added = await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'contestant', displayName: 'Arun Songsiri', dateOfBirth: '2008-11-18' })
check('person added after proof', added.status === 201)
check('TL cannot add a second Team Leader', (await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'team_leader', displayName: 'x' })).status === 400)
const blocked = await tl.post(`/api/registration/delegations/${thaiId}/submit`)
check('submit with missing steps -> 409 + list', blocked.status === 409 && Array.isArray(blocked.json.missing) && blocked.json.missing.length > 0, JSON.stringify(blocked.json))
await tl.patch(`/api/registration/delegations/${thaiId}`, { completedSteps: ['start', 'setup', 'teams', 'people', 'welfare', 'travel'], declaredArrivalDate: '2027-07-20', declaredDepartureDate: '2027-07-28' })
const gaps = await tl.post(`/api/registration/delegations/${thaiId}/submit`)
check('submit with incomplete people -> 409 naming them', gaps.status === 409 && gaps.json.missing.some((m) => m.startsWith('Arun Songsiri:')), JSON.stringify(gaps.json))
const snapshot = (await tl.get(`/api/registration/delegations/${thaiId}`)).json
const details = { badgeName: 'Test', officialName: 'Test Person', passportName: 'TEST PERSON', passportNumber: 'T1234567', passportNationality: 'Thai', dateOfBirth: '2008-01-01', genderForRoomAllocation: 'Male', tshirtSize: 'M', poloSize: 'M', emergencyContact: 'Test Contact +66 80 000 0000' }
for (const m of snapshot.members) await tl.patch(`/api/registration/members/${m.id}`, { ...details, ...(m.role === 'contestant' ? { teamId: m.teamId ?? snapshot.teams[0].id, examLanguage: 'English' } : {}) })
for (const t of snapshot.teams) await tl.patch(`/api/registration/teams/${t.id}`, { contestLanguage: t.contestLanguage ?? 'English' })
check('submit when complete -> 200', (await tl.post(`/api/registration/delegations/${thaiId}/submit`)).status === 200)
check('submit twice -> 409', (await tl.post(`/api/registration/delegations/${thaiId}/submit`)).status === 409)

// --- finance review
const queue = await S.finance.get('/api/admin/payments?status=awaiting_review')
const pay = queue.json.payments.find((p) => p.delegationId === thaiId)
check('Finance sees proof in queue', Boolean(pay))
check('TL cannot approve own payment (403)', (await tl.post(`/api/admin/payments/${pay.id}/approve`)).status === 403)
check('Admin (not finance) cannot approve (403)', (await S.admin.post(`/api/admin/payments/${pay.id}/approve`)).status === 403)
const file = await S.finance.get(`/api/registration/attachments/${pay.proofAttachmentId}`)
check('Finance downloads the proof file', file.status === 200 && file.text.startsWith('%PDF'), String(file.status))
check('Viewer cannot download the proof (404)', (await S.viewer.get(`/api/registration/attachments/${pay.proofAttachmentId}`)).status === 404)
const approved = await S.finance.post(`/api/admin/payments/${pay.id}/approve`)
check('Finance approves (status bug fixed)', approved.status === 200 && approved.json.payment.status === 'approved', JSON.stringify(approved.json))
check('approved by the signed-in finance user (audit)', approved.json.payment.reviewedByAccountId === (await S.finance.get('/api/auth/me')).json.user.id)
check('approving twice -> 409', (await S.finance.post(`/api/admin/payments/${pay.id}/approve`)).status === 409)

// --- sign-up with an invite code
const signup = new Client()
check('invite verify (unused code)', (await signup.post('/api/registration/invite/verify', { code: 'iol2027-tst-0001' })).status === 200)
check('used invite code is refused', (await signup.post('/api/registration/invite/verify', { code: 'IOL2027-THA-TEST' })).status === 404)
check('sign-up with an existing email -> 409 (takeover fixed)', (await signup.post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'tl.thailand@iol2027.test', fullName: 'Attacker', password: 'attacker-password-1' })).status === 409)
check('existing account still signs in with its own password', (await login('tl.thailand@iol2027.test')).r.status === 200)
check('short password rejected', (await signup.post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'new.leader@iol2027.test', fullName: 'New Leader', password: 'short' })).status === 400)
const created = await signup.post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'new.leader@iol2027.test', fullName: 'New Leader', password: 'a-long-enough-password' })
check('sign-up creates account + session + dev code', created.status === 201 && created.json.user.emailVerified === false && /^\d{6}$/.test(created.json.developmentCode ?? ''), JSON.stringify(created.json))
const newId = created.json.user.delegationId
check('unverified account cannot open its delegation (403)', (await signup.get(`/api/registration/delegations/${newId}`)).status === 403)
check('wrong code -> 400', (await signup.post('/api/auth/verify-email', { code: '000000' })).status === 400)
check('resend within a minute -> 429', (await signup.post('/api/auth/verify-email/request')).status === 429)
check('right code verifies', (await signup.post('/api/auth/verify-email', { code: created.json.developmentCode })).json?.user?.emailVerified === true)
const fresh = await signup.get(`/api/registration/delegations/${newId}`)
check('verified account opens its delegation with 1 team auto-created', fresh.status === 200 && fresh.json.teams.length === 1, JSON.stringify(fresh.json?.teams))
check('used invite code cannot create a second account (hijack fixed)', (await new Client().post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'hijacker@iol2027.test', fullName: 'H', password: 'another-long-password' })).status === 404)

// --- super admin changes a role; that user's sessions end
const accounts = (await S.superadmin.get('/api/admin/accounts')).json.accounts
const viewerAcc = accounts.find((a) => a.email === 'viewer@iol2027.test')
check('super admin changes a role', (await S.superadmin.patch(`/api/admin/accounts/${viewerAcc.id}`, { role: 'checkin_staff' })).status === 200)
check('changed user is signed out', (await S.viewer.get('/api/auth/me')).json.user === null)
check('super admin cannot change own role', (await S.superadmin.patch(`/api/admin/accounts/${accounts.find((a) => a.email === 'superadmin@iol2027.test').id}`, { role: 'viewer' })).status === 400)

// --- logout, lockout
check('logout ends the session', (await tl.post('/api/auth/logout')).status === 204 && (await tl.get('/api/auth/me')).json.user === null)
const lock = new Client()
for (let i = 0; i < 5; i++) await lock.post('/api/auth/login', { email: 'nobody@iol2027.test', password: 'wrong-password-' + i })
check('6th failed sign-in within 15 minutes -> 429', (await lock.post('/api/auth/login', { email: 'nobody@iol2027.test', password: 'whatever-password' })).status === 429)

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
