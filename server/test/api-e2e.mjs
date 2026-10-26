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
const inline = await S.finance.get(`/api/registration/attachments/${pay.proofAttachmentId}?inline=1`)
check('proof preview is served inline with nosniff', /^inline/.test(inline.headers.get('content-disposition') ?? '') && inline.headers.get('x-content-type-options') === 'nosniff')
check('Viewer cannot download the proof (404)', (await S.viewer.get(`/api/registration/attachments/${pay.proofAttachmentId}`)).status === 404)
const approved = await S.finance.post(`/api/admin/payments/${pay.id}/approve`)
check('Finance approves (status bug fixed)', approved.status === 200 && approved.json.payment.status === 'approved', JSON.stringify(approved.json))
check('approval issues a receipt number', /^IOL2027-R-\d{4,}$/.test(approved.json.payment.receiptNumber ?? ''), approved.json.payment.receiptNumber)
check('approved by the signed-in finance user (audit)', approved.json.payment.reviewedByAccountId === (await S.finance.get('/api/auth/me')).json.user.id)
check('approving twice -> 409', (await S.finance.post(`/api/admin/payments/${pay.id}/approve`)).status === 409)

// --- sign-up with an invite code
const signup = new Client()
check('invite verify (unused code)', (await signup.post('/api/registration/invite/verify', { code: 'iol2027-tst-0001' })).status === 200)
const usedCode = await signup.post('/api/registration/invite/verify', { code: 'IOL2027-THA-TEST' })
check('used invite code -> 409, sign in instead', usedCode.status === 409 && usedCode.json.codeUsed === true && usedCode.json.accountHint === 't•••••@iol2027.test')
check('unknown invite code -> 404', (await signup.post('/api/registration/invite/verify', { code: 'IOL2027-ZZZ-0000' })).status === 404)
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

// --- the reusable test code (test servers only): each sign-up replaces the account made with it before
const loop = { inviteCode: 'IOL2027-TST-LOOP', email: 'loop@iol2027.test', fullName: 'Loop Leader', password: 'a-long-enough-password' }
const firstLoop = await new Client().post('/api/registration/team-leader-account', loop)
check('reusable code creates an account', firstLoop.status === 201, JSON.stringify(firstLoop.json))
check('reusable code still verifies after use', (await new Client().post('/api/registration/invite/verify', { code: 'IOL2027-TST-LOOP' })).status === 200)
const secondLoop = await new Client().post('/api/registration/team-leader-account', loop)
check('reusable code works again with the same email', secondLoop.status === 201 && secondLoop.json.user.id !== firstLoop.json.user?.id, JSON.stringify(secondLoop.json))

// --- super admin changes a role; that user's sessions end
const accounts = (await S.superadmin.get('/api/admin/accounts')).json.accounts
const viewerAcc = accounts.find((a) => a.email === 'viewer@iol2027.test')
check('super admin changes a role', (await S.superadmin.patch(`/api/admin/accounts/${viewerAcc.id}`, { role: 'checkin_staff' })).status === 200)
check('changed user is signed out', (await S.viewer.get('/api/auth/me')).json.user === null)
check('super admin cannot change own role', (await S.superadmin.patch(`/api/admin/accounts/${accounts.find((a) => a.email === 'superadmin@iol2027.test').id}`, { role: 'viewer' })).status === 400)

// --- people status
const people = await S.admin.get('/api/admin/people')
check('admin people list has stages and missing details', people.status === 200 && people.json.people.length > 0 && people.json.people.every((p) => Array.isArray(p.missingDetails)))
check('approved Thailand people show as paid', people.json.people.filter((p) => p.delegationId === thaiId).every((p) => p.stage === 'paid'))
check('check-in staff sees people without their missing details', (await S.checkin.get('/api/admin/people')).json.people.every((p) => !('missingDetails' in p)))
check('Content editor cannot list people (403)', await can(S.content, '/api/admin/people') === 403)
check('dashboard has people stages', ((await S.finance.get('/api/admin/dashboard')).json.stages ?? []).length === 5)

// --- exports
const peopleCsv = await S.admin.get('/api/admin/exports/people')
check('people CSV: header and download name', peopleCsv.status === 200 && peopleCsv.text.includes('Passport number') && /attachment; filename="iol2027-people-/.test(peopleCsv.headers.get('content-disposition') ?? ''))
const csvBytes = new Uint8Array(await (await fetch(BASE + '/api/admin/exports/people', { headers: { Cookie: S.admin.cookie } })).arrayBuffer())
check('CSV starts with a UTF-8 byte-order mark so Excel keeps Thai text', csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf)
check('Finance cannot export people (403)', (await S.finance.get('/api/admin/exports/people')).status === 403)
check('Finance exports payments', (await S.finance.get('/api/admin/exports/payments')).text.includes('Receipt number'))
const narin = (await S.admin.get(`/api/registration/delegations/${thaiId}`)).json.members.find((m) => m.role === 'contestant')
await S.admin.patch(`/api/registration/members/${narin.id}`, { foodAllergyNotes: '=HYPERLINK("http://example.com")' })
const welfareCsv = await S.welfare.get('/api/admin/exports/welfare')
check('welfare CSV has no passport column', welfareCsv.status === 200 && !welfareCsv.text.includes('Passport'))
check('spreadsheet formulas are neutralised in CSV', welfareCsv.text.includes("'=HYPERLINK"), welfareCsv.text.slice(0, 300))
check('Content editor has no exports', (await S.content.get('/api/admin/exports')).json.kinds.length === 0)
check('unknown export -> 404', (await S.admin.get('/api/admin/exports/everything')).status === 404)

// --- activity log
const audit = await S.admin.get(`/api/admin/audit?delegationId=${thaiId}`)
check('activity log shows the approval by Finance', audit.json.events.some((e) => e.eventType === 'payment_approved' && e.actorEmail === 'finance@iol2027.test'))
check('activity log records exports', (await S.admin.get('/api/admin/audit?eventType=export_downloaded')).json.events.length >= 3)
check('Finance cannot read the activity log (403)', await can(S.finance, '/api/admin/audit') === 403)

// --- invitation codes
check('Finance cannot list invitation codes (403)', await can(S.finance, '/api/admin/invites') === 403)
const made = await S.admin.post('/api/admin/invites', { invites: [
  { countryTerritory: 'Testopia (TEST)', accreditedOrganisation: 'Testopia Olympiad', contactEmail: 'contact@testopia.test' },
  { countryTerritory: 'Mockland (TEST)' },
] })
check('admin creates invitation codes in bulk', made.status === 201 && made.json.invites.length === 2 && made.json.invites.every((i) => /^IOL2027-[A-Z]{3}-[A-Z2-9]{4}$/.test(i.code)), JSON.stringify(made.json))
check('a second code for the same country is refused (409)', (await S.admin.post('/api/admin/invites', { countryTerritory: 'testopia (test)' })).status === 409)
check('a bad contact email is refused (400)', (await S.admin.post('/api/admin/invites', { countryTerritory: 'Elsewhere (TEST)', contactEmail: 'not-an-email' })).status === 400)
const [testopia, mockland] = made.json.invites
const sentInvite = await S.admin.post(`/api/admin/invites/${testopia.id}/send`)
// With email off (local) the send is recorded; on the dev server Resend's test mode refuses .test addresses (502).
check('sending an invite records it, or reports the refusal', (sentInvite.status === 200 && sentInvite.json.invite.sendCount === 1 && sentInvite.json.emailSent === false) || sentInvite.status === 502, JSON.stringify(sentInvite.json))
check('sending without a contact email -> 400', (await S.admin.post(`/api/admin/invites/${mockland.id}/send`)).status === 400)
check('a new code verifies for sign-up', (await new Client().post('/api/registration/invite/verify', { code: testopia.code })).status === 200)
check('revoking a code', (await S.admin.patch(`/api/admin/invites/${testopia.id}`, { status: 'revoked' })).json?.invite?.status === 'revoked')
check('a revoked code no longer verifies', (await new Client().post('/api/registration/invite/verify', { code: testopia.code })).status === 404)
const usedInvite = (await S.admin.get('/api/admin/invites')).json.invites.find((i) => i.code === 'IOL2027-THA-TEST')
check('a used code cannot be changed (409)', (await S.admin.patch(`/api/admin/invites/${usedInvite.id}`, { status: 'revoked' })).status === 409)

// --- organiser settings: fees and guardian consent
const s0 = await S.finance.get('/api/admin/settings')
check('Finance reads the fee settings', s0.status === 200 && s0.json.fees.roomRate === 220 && s0.json.fees.teamFee.early_bird === 1000)
check('Admin cannot change fees (403)', (await S.admin.put('/api/admin/settings/fees', s0.json.fees)).status === 403)
check('a negative fee is refused (400)', (await S.finance.put('/api/admin/settings/fees', { ...s0.json.fees, roomRate: -1 })).status === 400)
const s1 = await S.finance.put('/api/admin/settings/fees', { ...s0.json.fees, observerFee: 300 })
check('Finance sets the observer fee', s1.status === 200 && s1.json.fees.observerFee === 300)
const thaiFees = (await S.admin.get(`/api/registration/delegations/${thaiId}`)).json.fees
check('the observer fee reaches delegation invoices', thaiFees.lines.find((l) => l.key === 'observers').amount === 300 && thaiFees.observersPending === false, JSON.stringify(thaiFees))
check('fees restored', (await S.finance.put('/api/admin/settings/fees', s0.json.fees)).json?.fees?.observerFee === null)
check('Finance cannot change the consent policy (403)', (await S.finance.put('/api/admin/settings/guardian-consent', { required: true, ageThreshold: 18, referenceDate: '2027-07-21' })).status === 403)
const policy = await S.admin.put('/api/admin/settings/guardian-consent', { required: true, ageThreshold: 18, referenceDate: '2027-07-21' })
check('Admin switches guardian consent on', policy.status === 200 && policy.json.guardianConsent.required === true)
const yui = (await S.admin.get(`/api/registration/delegations/${japanId}`)).json.members.find((m) => m.role === 'contestant')
await S.admin.patch(`/api/registration/members/${yui.id}`, { dateOfBirth: '2011-05-01' })
const japanNow = (await S.admin.get(`/api/registration/delegations/${japanId}`)).json
check('a contestant under 18 is flagged for consent', japanNow.members.find((m) => m.id === yui.id).needsGuardianConsent === true)
const consentMissing = await S.admin.post(`/api/registration/delegations/${japanId}/submit`)
check('submission lists the missing consent form', consentMissing.status === 409 && consentMissing.json.missing.some((m) => m.includes('guardian consent form')), JSON.stringify(consentMissing.json))
const consentForm = new FormData(); consentForm.append('consent', new Blob(['%PDF-1.4 consent'], { type: 'application/pdf' }), 'consent.pdf')
check('consent form upload', (await S.admin.post(`/api/registration/members/${yui.id}/guardian-consent`, undefined, { form: consentForm })).status === 201)
const afterConsent = await S.admin.post(`/api/registration/delegations/${japanId}/submit`)
check('uploaded consent clears that item', afterConsent.status === 409 && !afterConsent.json.missing.some((m) => m.includes('guardian consent form')))
check('consent policy switched back off', (await S.admin.put('/api/admin/settings/guardian-consent', { required: false, ageThreshold: 18, referenceDate: '2027-07-21' })).json?.guardianConsent?.required === false)

// --- staff accounts
check('Admin cannot create accounts (403)', (await S.admin.post('/api/admin/accounts', { email: 'x@iol2027.test', fullName: 'X', role: 'viewer' })).status === 403)
check('a Team Leader cannot be created directly (400)', (await S.superadmin.post('/api/admin/accounts', { email: 'tl.direct@iol2027.test', fullName: 'X', role: 'team_leader' })).status === 400)
const staff = await S.superadmin.post('/api/admin/accounts', { email: 'new.staff@iol2027.test', fullName: 'New Staff (TEST)', role: 'welfare_staff' })
check('super admin creates a staff account with a setup code', staff.status === 201 && /^\d{6}$/.test(staff.json.developmentCode ?? ''), JSON.stringify(staff.json))
check('the same email twice -> 409', (await S.superadmin.post('/api/admin/accounts', { email: 'NEW.staff@iol2027.test', fullName: 'Dup', role: 'viewer' })).status === 409)
const staffClient = new Client()
const staffSetup = await staffClient.post('/api/auth/password-reset/confirm', { email: 'new.staff@iol2027.test', code: staff.json.developmentCode, password: 'new-staff-password-2027' })
check('new staff set a password with the code and are verified', staffSetup.status === 200 && staffSetup.json.user.emailVerified === true && staffSetup.json.user.role === 'welfare_staff', JSON.stringify(staffSetup.json))
check('new staff can use their role', (await staffClient.get('/api/admin/welfare')).status === 200)
check('a staff account cannot become a Team Leader (400)', (await S.superadmin.patch(`/api/admin/accounts/${staff.json.account.id}`, { role: 'team_leader' })).status === 400)
const disabled = await S.superadmin.patch(`/api/admin/accounts/${staff.json.account.id}`, { disabled: true })
check('disabling an account signs that person out', disabled.status === 200 && Boolean(disabled.json.account.disabledAt) && (await staffClient.get('/api/auth/me')).json.user === null)
check('a disabled account cannot sign in', (await new Client().post('/api/auth/login', { email: 'new.staff@iol2027.test', password: 'new-staff-password-2027' })).status === 401)

// --- password reset
const resetAsk = await new Client().post('/api/auth/password-reset/request', { email: 'TL.Japan@iol2027.test' })
check('reset request -> 202 with a dev code', resetAsk.status === 202 && /^\d{6}$/.test(resetAsk.json.developmentCode ?? ''), JSON.stringify(resetAsk.json))
const unknownAsk = await new Client().post('/api/auth/password-reset/request', { email: 'nobody@iol2027.test' })
check('unknown email gets the same answer and no code', unknownAsk.status === 202 && unknownAsk.json.developmentCode === undefined)
check('a second request within a minute sends nothing', (await new Client().post('/api/auth/password-reset/request', { email: 'tl.japan@iol2027.test' })).json.developmentCode === undefined)
const resetter = new Client()
check('wrong reset code -> 400', (await resetter.post('/api/auth/password-reset/confirm', { email: 'tl.japan@iol2027.test', code: '000000', password: 'japan-new-password-2027' })).status === 400)
check('short new password -> 400', (await resetter.post('/api/auth/password-reset/confirm', { email: 'tl.japan@iol2027.test', code: resetAsk.json.developmentCode, password: 'short' })).status === 400)
const resetDone = await resetter.post('/api/auth/password-reset/confirm', { email: 'tl.japan@iol2027.test', code: resetAsk.json.developmentCode, password: 'japan-new-password-2027' })
check('right code sets the password and signs in', resetDone.status === 200 && resetDone.json.user.email === 'tl.japan@iol2027.test', JSON.stringify(resetDone.json))
check('existing sessions end after a reset', (await jp.get('/api/auth/me')).json.user === null)
check('the old password stops working', (await new Client().post('/api/auth/login', { email: 'tl.japan@iol2027.test', password: PW })).status === 401)
check('the new password works', (await new Client().post('/api/auth/login', { email: 'tl.japan@iol2027.test', password: 'japan-new-password-2027' })).status === 200)
check('a used code cannot be reused', (await new Client().post('/api/auth/password-reset/confirm', { email: 'tl.japan@iol2027.test', code: resetAsk.json.developmentCode, password: 'another-new-password-1' })).status === 400)
const guessed = await new Client().post('/api/auth/password-reset/request', { email: 'results@iol2027.test' })
for (let i = 0; i < 5; i++) await new Client().post('/api/auth/password-reset/confirm', { email: 'results@iol2027.test', code: String(100000 + i), password: 'guessing-password-123' })
check('five wrong guesses retire the code', (await new Client().post('/api/auth/password-reset/confirm', { email: 'results@iol2027.test', code: guessed.json.developmentCode, password: 'guessing-password-123' })).status === 400)

// --- logout, lockout
check('logout ends the session', (await tl.post('/api/auth/logout')).status === 204 && (await tl.get('/api/auth/me')).json.user === null)
const lock = new Client()
for (let i = 0; i < 5; i++) await lock.post('/api/auth/login', { email: 'nobody@iol2027.test', password: 'wrong-password-' + i })
check('6th failed sign-in within 15 minutes -> 429', (await lock.post('/api/auth/login', { email: 'nobody@iol2027.test', password: 'whatever-password' })).status === 429)

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
