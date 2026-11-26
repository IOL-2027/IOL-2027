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
const thaiTotal = (await tl.get(`/api/registration/delegations/${thaiId}`)).json.fees.total
check('invoice saved, amount computed by server from the fee table', inv.status === 200 && thaiTotal > 0 && Number(inv.json.payment.amountDue) === thaiTotal, `${thaiTotal} ${JSON.stringify(inv.json.payment)}`)
check('the invoice is numbered like IOL2027/23', /^IOL2027\/\d+$/.test(inv.json.payment?.invoiceNumber ?? ''), JSON.stringify(inv.json.payment))
const invPdf = await tl.get(`/api/registration/delegations/${thaiId}/invoice`)
check('the invoice downloads as a PDF', invPdf.status === 200 && invPdf.headers.get('content-type') === 'application/pdf' && invPdf.text.startsWith('%PDF'), invPdf.status)
const form = new FormData(); form.append('proof', new Blob(['%PDF-1.4 test proof'], { type: 'application/pdf' }), 'transfer.pdf')
const proof = await tl.post(`/api/registration/delegations/${thaiId}/payment-proof`, undefined, { form })
check('proof upload -> awaiting_review', proof.status === 201 && proof.json.payment.status === 'awaiting_review', JSON.stringify(proof.json))
const bad = new FormData(); bad.append('proof', new Blob(['x'], { type: 'text/plain' }), 'x.txt')
check('non-PDF/JPG/PNG proof rejected', (await tl.post(`/api/registration/delegations/${thaiId}/payment-proof`, undefined, { form: bad })).status === 400)
const added = await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'contestant', displayName: 'Arun Songsiri', dateOfBirth: '2008-11-18' })
check('person added after proof', added.status === 201)
check('Team and observers locked once the proof is in (409)', (await tl.patch(`/api/registration/delegations/${thaiId}`, { numberOfObservers: 0 })).status === 409)
check('invoice details locked once the proof is in (409)', (await tl.put(`/api/registration/delegations/${thaiId}/invoice`, { recipientName: 'Someone Else', invoiceCount: 1 })).status === 409)
check('other delegation fields still save after the proof', (await tl.patch(`/api/registration/delegations/${thaiId}`, { welfareNote: 'None' })).status === 200)
// Finance returns the proof: People stays open, and a new proof can be uploaded.
const queued = (await S.finance.get('/api/admin/payments?status=awaiting_review')).json.payments.find((p) => p.delegationId === thaiId)
const returned = await S.finance.post(`/api/admin/payments/${queued.id}/reject`, { note: 'The amount is short.' })
check('Finance returns the proof', returned.status === 200 && returned.json.payment.status === 'rejected', JSON.stringify(returned.json))
check('People stays open after a returned proof', (await tl.patch(`/api/registration/members/${added.json.member.id}`, { badgeName: 'Arun' })).status === 200)
// Several files at once, of different types, added to the proof.
const again = new FormData()
again.append('proof', new Blob(['%PDF-1.4 new proof'], { type: 'application/pdf' }), 'transfer-2.pdf')
again.append('proof', new Blob(['\x89PNG test'], { type: 'image/png' }), 'transfer-2-screenshot.png')
const reproof = await tl.post(`/api/registration/delegations/${thaiId}/payment-proof`, undefined, { form: again })
check('files added after a returned proof -> awaiting_review', reproof.status === 201 && reproof.json.payment.status === 'awaiting_review' && reproof.json.attachments.length === 2, JSON.stringify(reproof.json))
const proofFiles = (await tl.get(`/api/registration/delegations/${thaiId}`)).json.attachments.filter((a) => a.kind === 'payment_proof' && a.paymentId === reproof.json.payment.id)
check('the proof is all three files', proofFiles.length === 3, JSON.stringify(proofFiles))
check('a proof file can be removed', (await tl.req('DELETE', `/api/registration/attachments/${proofFiles[0].id}/proof`)).status === 200)
const left = (await tl.get(`/api/registration/delegations/${thaiId}`)).json.attachments.filter((a) => a.kind === 'payment_proof' && a.paymentId === reproof.json.payment.id)
await tl.req('DELETE', `/api/registration/attachments/${left[0].id}/proof`)
check('the last proof file cannot be removed (409)', (await tl.req('DELETE', `/api/registration/attachments/${left[1].id}/proof`)).status === 409)
// Names in Team and observers still save after the proof (they do not change the fees).
const thaiNames = await tl.patch(`/api/registration/delegations/${thaiId}`, { nationalRepresentativeName: 'Dr. Ananya Somchai', representativeIsTeamLeader: true, teamLeaderNames: ['', 'Kittipong Rattana'] })
const thaiNow = (await tl.get(`/api/registration/delegations/${thaiId}`)).json
const thaiLeaders = thaiNow.members.filter((m) => m.role === 'team_leader')
check('names save after the proof; the second team gets its Team Leader', thaiNames.status === 200 && thaiLeaders.length === 2 && thaiLeaders[1].displayName === 'Kittipong Rattana' && thaiLeaders[1].teamId === thaiNow.teams[1]?.id, JSON.stringify(thaiLeaders.map((m) => [m.displayName, m.teamId])))
check('Team Leaders are not added in People (400)', (await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'team_leader', displayName: 'x' })).status === 400)
check('a Team Leader cannot be removed in People (400)', (await tl.req('DELETE', `/api/registration/members/${thaiLeaders[1].id}`)).status === 400)
check('two teams need two Team Leaders (400)', (await tl.patch(`/api/registration/delegations/${thaiId}`, { nationalRepresentativeName: 'Dr. Ananya Somchai', representativeTeam: 0, teamLeaderNames: ['', ''] })).status === 400)
check('the national representative may lead the second team instead', (await tl.patch(`/api/registration/delegations/${thaiId}`, { nationalRepresentativeName: 'Dr. Ananya Somchai', representativeTeam: 1, teamLeaderNames: ['Kittipong Rattana', ''] })).status === 200)
const swapped = (await tl.get(`/api/registration/delegations/${thaiId}`)).json
const leaderOf = (i) => swapped.members.find((m) => m.role === 'team_leader' && m.teamId === swapped.teams[i].id)
check('each team keeps its own Team Leader record, the representative’s with the account email', leaderOf(0)?.displayName === 'Kittipong Rattana' && leaderOf(1)?.displayName === 'Dr. Ananya Somchai' && leaderOf(1)?.email === 'tl.thailand@iol2027.test' && !leaderOf(0)?.email, JSON.stringify(swapped.members.filter((m) => m.role === 'team_leader').map((m) => [m.displayName, m.teamId, m.email])))
await tl.patch(`/api/registration/delegations/${thaiId}`, { nationalRepresentativeName: 'Dr. Ananya Somchai', representativeTeam: 0, teamLeaderNames: ['', 'Kittipong Rattana'] })
const blocked = await tl.post(`/api/registration/delegations/${thaiId}/submit`)
check('submit with missing steps -> 409 + list', blocked.status === 409 && Array.isArray(blocked.json.missing) && blocked.json.missing.length > 0, JSON.stringify(blocked.json))
await tl.patch(`/api/registration/delegations/${thaiId}`, { completedSteps: ['start', 'setup', 'teams', 'people', 'welfare', 'travel'], declaredArrivalDate: '2027-07-20', declaredDepartureDate: '2027-07-28' })
const gaps = await tl.post(`/api/registration/delegations/${thaiId}/submit`)
check('submit with incomplete people -> 409 naming them', gaps.status === 409 && gaps.json.missing.some((m) => m.startsWith('Arun Songsiri:')), JSON.stringify(gaps.json))
check('the observer chosen in Team and observers is added', (await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'observer', displayName: 'Pim Observer', teamId: thaiNow.teams[0].id, observerCategory: 'Parent', email: 'pim.observer@iol2027.test' })).status === 201)
check('a second observer beyond the one chosen is refused (400)', (await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'observer', displayName: 'Extra Observer' })).status === 400)
// Four contestants for each team (IOL Board, 16 Nov 2026): Thailand B has none yet.
const teamB = thaiNow.teams[1].id
for (const name of ['Ploy Srisuk', 'Tawan Boonmee', 'Fah Chaiyo', 'Krit Wongsa']) await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'contestant', displayName: name, teamId: teamB })
check('a fifth contestant in a team is refused (400)', (await tl.post(`/api/registration/delegations/${thaiId}/members`, { role: 'contestant', displayName: 'Too Many', teamId: teamB })).status === 400)
check('food must come from the list (400)', (await tl.patch(`/api/registration/members/${thaiLeaders[0].id}`, { diet: ['Pizza only'] })).status === 400)
check('“No special diet” stands alone (400)', (await tl.patch(`/api/registration/members/${thaiLeaders[0].id}`, { diet: ['No special diet', 'Vegan'] })).status === 400)
const snapshot = (await tl.get(`/api/registration/delegations/${thaiId}`)).json
const details = { badgeName: 'Test', officialName: 'Test Person', passportName: 'TEST PERSON', passportNumber: 'T1234567', passportNationality: 'Thai', dateOfBirth: '2008-01-01', genderForRoomAllocation: 'Male', tshirtSize: 'M', poloSize: 'M', emergencyContact: 'Test Contact +66 80 000 0000', diet: ['No special diet'], medicalAccessibilityNotes: 'None' }
for (const m of snapshot.members) await tl.patch(`/api/registration/members/${m.id}`, { ...details, ...(m.role === 'contestant' ? { teamId: m.teamId ?? snapshot.teams[0].id, examLanguage: 'English' } : {}) })
for (const t of snapshot.teams) await tl.patch(`/api/registration/teams/${t.id}`, { contestLanguage: t.contestLanguage ?? 'English' })
const early = await tl.post(`/api/registration/delegations/${thaiId}/submit`, { acknowledgeDressCode: true, acknowledgeInsurance: true })
check('submit lists the consent forms and travel still missing (409)', early.status === 409 && early.json.missing.some((m) => m.startsWith('Consent forms: upload')) && early.json.missing.some((m) => m.startsWith('Consent forms: tick')) && early.json.missing.some((m) => m.startsWith('Travel:')), JSON.stringify(early.json))

// --- consent forms (24 Nov 2026): a filled-in PDF per person, signed files uploaded, a tick for each person
const formPdf = await tl.req('GET', `/api/registration/members/${thaiLeaders[0].id}/consent-form`)
check('each person’s consent form downloads as a PDF', formPdf.status === 200, String(formPdf.status))
const signed = new FormData()
signed.append('files', new Blob(['%PDF-1.4 signed forms'], { type: 'application/pdf' }), 'thailand-signed.pdf')
signed.append('files', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'one-more.jpg')
const upSigned = await tl.post(`/api/registration/delegations/${thaiId}/consent-files`, undefined, { form: signed })
check('signed consent forms upload, several at once', upSigned.status === 201 && upSigned.json.attachments.length === 2, JSON.stringify(upSigned.json))
check('a signed form uploaded by mistake can be removed', (await tl.req('DELETE', `/api/registration/attachments/${upSigned.json.attachments[1].id}/consent`)).status === 200)
const thaiPeople = (await tl.get(`/api/registration/delegations/${thaiId}`)).json.members
check('a consent answer must be yes, no or blank (400)', (await tl.req('PUT', `/api/registration/delegations/${thaiId}/consents`, { answers: [{ memberId: thaiPeople[0].id, consents: 'maybe' }] })).status === 400)
const answers = await tl.req('PUT', `/api/registration/delegations/${thaiId}/consents`, { answers: thaiPeople.map((m, i) => ({ memberId: m.id, consents: i !== 1 })) })
check('each person’s consent is ticked', answers.status === 200 && answers.json.members.every((m) => m.photoConsent !== null), JSON.stringify(answers.json))

// --- travel: the two airports, dates around the programme, one arrival per person
const trip = (body) => tl.post(`/api/registration/delegations/${thaiId}/travel`, { direction: 'arrival', ...body })
check('pickup only from BKK or DMK (400)', (await trip({ travelPoint: 'Bangkok railway station', localDate: '2027-07-21' })).status === 400)
check('a date far from the Olympiad is refused (400)', (await trip({ travelPoint: 'Suvarnabhumi Airport (BKK)', localDate: '2026-12-03' })).status === 400)
const firstArrival = await trip({ travelPoint: 'Suvarnabhumi Airport (BKK)', flightServiceNumber: 'TG 661', localDate: '2027-07-21', localTime: '09:30', peopleIds: [thaiLeaders[0].id] })
check('an arrival at BKK saves', firstArrival.status === 201 && firstArrival.json.travelRecord.transport === 'organisers', JSON.stringify(firstArrival.json))
check('the same person on a second arrival is refused (400)', (await trip({ transport: 'own', localDate: '2027-07-21', localTime: '18:00', peopleIds: [thaiLeaders[0].id] })).status === 400)
const ownWay = await trip({ transport: 'own', travelPoint: 'Suvarnabhumi Airport (BKK)', localDate: '2027-07-21', localTime: '18:00', peopleIds: [thaiLeaders[1].id] })
check('making their own way to the hotel saves, without an airport', ownWay.status === 201 && ownWay.json.travelRecord.transport === 'own' && ownWay.json.travelRecord.travelPoint === null, JSON.stringify(ownWay.json))
// Everyone on an arrival and a departure, those who make their own way too (24 Nov 2026).
const rest = thaiPeople.filter((m) => m.id !== thaiLeaders[0].id && m.id !== thaiLeaders[1].id).map((m) => m.id)
await trip({ travelPoint: 'Don Mueang Airport (DMK)', flightServiceNumber: 'FD 3011', localDate: '2027-07-21', localTime: '11:00', peopleIds: rest })
const halfway = await tl.post(`/api/registration/delegations/${thaiId}/submit`, { acknowledgeDressCode: true, acknowledgeInsurance: true })
check('submit names the people without a departure (409)', halfway.status === 409 && halfway.json.missing.some((m) => m.startsWith('Travel:') && m.includes('departure')), JSON.stringify(halfway.json))
await tl.post(`/api/registration/delegations/${thaiId}/travel`, { direction: 'departure', transport: 'organisers', travelPoint: 'Suvarnabhumi Airport (BKK)', flightServiceNumber: 'TG 662', localDate: '2027-07-28', localTime: '20:00', peopleIds: thaiPeople.map((m) => m.id) })
const noTicks = await tl.post(`/api/registration/delegations/${thaiId}/submit`)
check('submitting needs the dress code and insurance boxes ticked (400)', noTicks.status === 400, JSON.stringify(noTicks.json))
const submitted = await tl.post(`/api/registration/delegations/${thaiId}/submit`, { acknowledgeDressCode: true, acknowledgeInsurance: true })
check('submit when complete -> 200', submitted.status === 200 && Boolean(submitted.json.delegation?.dressCodeAcknowledgedAt), JSON.stringify(submitted.json))
check('once submitted, the last signed-form file cannot be removed (409)', (await tl.req('DELETE', `/api/registration/attachments/${upSigned.json.attachments[0].id}/consent`)).status === 409)
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
check('sign-up with an existing email -> 409 (takeover fixed)', (await signup.post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'tl.thailand@iol2027.test', password: 'attacker-password-1' })).status === 409)
check('existing account still signs in with its own password', (await login('tl.thailand@iol2027.test')).r.status === 200)
check('short password rejected', (await signup.post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'new.leader@iol2027.test', password: 'short' })).status === 400)
const created = await signup.post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'new.leader@iol2027.test', password: 'a-long-enough-password' })
check('sign-up creates account + session + dev code', created.status === 201 && created.json.user.emailVerified === false && /^\d{6}$/.test(created.json.developmentCode ?? ''), JSON.stringify(created.json))
const newId = created.json.user.delegationId
check('unverified account cannot open its delegation (403)', (await signup.get(`/api/registration/delegations/${newId}`)).status === 403)
check('wrong code -> 400', (await signup.post('/api/auth/verify-email', { code: '000000' })).status === 400)
check('resend within a minute -> 429', (await signup.post('/api/auth/verify-email/request')).status === 429)
check('right code verifies', (await signup.post('/api/auth/verify-email', { code: created.json.developmentCode })).json?.user?.emailVerified === true)
const fresh = await signup.get(`/api/registration/delegations/${newId}`)
check('verified account opens its delegation with 1 team auto-created', fresh.status === 200 && fresh.json.teams.length === 1, JSON.stringify(fresh.json?.teams))
check('sign-up asks no name: no names and no Team Leader yet', fresh.json.delegation.nationalRepresentativeName === '' && !fresh.json.members.some((m) => m.role === 'team_leader'), JSON.stringify([fresh.json.delegation.nationalRepresentativeName, fresh.json.members]))
// Team and observers names the national representative and the Team Leader.
const namesAt = (body) => signup.patch(`/api/registration/delegations/${newId}`, body)
check('names without the representative -> 400', (await namesAt({ nationalRepresentativeName: '', representativeIsTeamLeader: true, teamLeaderNames: [] })).status === 400)
check('names without saying who leads -> 400', (await namesAt({ nationalRepresentativeName: 'Kanya Srisuk', teamLeaderNames: ['Somchai Boonmee'] })).status === 400)
check('a representative who does not lead needs a Team Leader -> 400', (await namesAt({ nationalRepresentativeName: 'Kanya Srisuk', representativeIsTeamLeader: false, teamLeaderNames: [''] })).status === 400)
check('representative and a separate Team Leader save', (await namesAt({ nationalRepresentativeName: 'Kanya Srisuk', representativeIsTeamLeader: false, teamLeaderNames: ['Somchai Boonmee'] })).status === 200)
let named = (await signup.get(`/api/registration/delegations/${newId}`)).json
let leaders = named.members.filter((m) => m.role === 'team_leader')
check('the Team Leader is added to People, without the account email', leaders.length === 1 && leaders[0].displayName === 'Somchai Boonmee' && !leaders[0].email && leaders[0].teamId === named.teams[0].id, JSON.stringify(leaders))
check("the account takes the representative's name", named.delegation.nationalRepresentativeName === 'Kanya Srisuk' && named.delegation.representativeIsTeamLeader === false && (await signup.get('/api/auth/me')).json.user.fullName === 'Kanya Srisuk')
check('ticking "also the Team Leader" saves', (await namesAt({ nationalRepresentativeName: 'Kanya Srisuk', representativeIsTeamLeader: true, teamLeaderNames: [] })).status === 200)
named = (await signup.get(`/api/registration/delegations/${newId}`)).json
leaders = named.members.filter((m) => m.role === 'team_leader')
check('the same record becomes the representative, with the account email', leaders.length === 1 && leaders[0].displayName === 'Kanya Srisuk' && leaders[0].email === 'new.leader@iol2027.test', JSON.stringify(leaders))
check('used invite code cannot create a second account (hijack fixed)', (await new Client().post('/api/registration/team-leader-account', { inviteCode: 'IOL2027-TST-0001', email: 'hijacker@iol2027.test', password: 'another-long-password' })).status === 404)

// --- the reusable test code (test servers only): each sign-up replaces the account made with it before
const loop = { inviteCode: 'IOL2027-TST-LOOP', email: 'loop@iol2027.test', password: 'a-long-enough-password' }
const firstLoop = await new Client().post('/api/registration/team-leader-account', loop)
check('reusable code creates an account', firstLoop.status === 201, JSON.stringify(firstLoop.json))
check('reusable code still verifies after use', (await new Client().post('/api/registration/invite/verify', { code: 'IOL2027-TST-LOOP' })).status === 200)
const secondLoop = await new Client().post('/api/registration/team-leader-account', loop)
check('reusable code works again with the same email', secondLoop.status === 201 && secondLoop.json.user.id !== firstLoop.json.user?.id, JSON.stringify(secondLoop.json))

// --- jury members and volunteers: one shared code each, an account each (IOL Board, 16 Nov 2026)
async function selfSignUp(code, email) {
  const c = new Client()
  const made = await c.post('/api/registration/team-leader-account', { inviteCode: code, email, password: 'a-long-enough-password' })
  await c.post('/api/auth/verify-email', { code: made.json?.developmentCode })
  return { c, made, id: made.json?.user?.delegationId }
}
check('the jury code verifies as a jury code', (await new Client().post('/api/registration/invite/verify', { code: 'IOL2027-JUR-TEST' })).json?.invite?.kind === 'jury')
const juror = await selfSignUp('IOL2027-JUR-TEST', 'juror.one@iol2027.test')
const juror2 = await selfSignUp('IOL2027-JUR-TEST', 'juror.two@iol2027.test')
check('the shared jury code makes an account for each person', juror.made.status === 201 && juror2.made.status === 201 && juror.id !== juror2.id, JSON.stringify([juror.made.json, juror2.made.json]))
check('the jury code is still not used up', (await new Client().post('/api/registration/invite/verify', { code: 'IOL2027-JUR-TEST' })).status === 200)
const jurySetup = await juror.c.patch(`/api/registration/delegations/${juror.id}`, { nationalRepresentativeName: 'Anna Juror', needsAccommodation: true, numberOfObservers: 1, observerTeams: [0], singleRooms: { teamLeaders: [true], observers: [false] }, completedSteps: ['start', 'setup'] })
const jury = (await juror.c.get(`/api/registration/delegations/${juror.id}`)).json
check('a jury member with an observer and a single room pays for those only', jurySetup.status === 200 && jury.fees.total === jury.feeRules.observerFee + jury.feeRules.singleRoomFee && jury.teams.length === 0, JSON.stringify([jurySetup.json, jury.fees]))
check('About you makes the jury member’s own record', jury.members.some((m) => m.role === 'jury' && m.displayName === 'Anna Juror' && m.email === 'juror.one@iol2027.test'), JSON.stringify(jury.members))
check('a jury member’s details open without a payment', (await juror.c.post(`/api/registration/delegations/${juror.id}/members`, { role: 'observer', displayName: 'Jury Guest' })).status === 201)
check('a jury member brings at most the observer chosen (400)', (await juror.c.post(`/api/registration/delegations/${juror.id}/members`, { role: 'observer', displayName: 'Second Guest' })).status === 400)
check('a jury member has no contestants (400)', (await juror.c.post(`/api/registration/delegations/${juror.id}/members`, { role: 'contestant', displayName: 'Kid' })).status === 400)
const volunteer = await selfSignUp('IOL2027-VOL-TEST', 'volunteer.one@iol2027.test')
check('a volunteer cannot bring an observer (400)', (await volunteer.c.patch(`/api/registration/delegations/${volunteer.id}`, { nationalRepresentativeName: 'Vee Volunteer', numberOfObservers: 1 })).status === 400)
await volunteer.c.patch(`/api/registration/delegations/${volunteer.id}`, { nationalRepresentativeName: 'Vee Volunteer', needsAccommodation: false, numberOfObservers: 0, observerTeams: [], singleRooms: { teamLeaders: [true], observers: [] }, completedSteps: ['start', 'setup'] })
const vol = (await volunteer.c.get(`/api/registration/delegations/${volunteer.id}`)).json
check('a volunteer without a room pays nothing, even if a single room was ticked', vol.fees.total === 0 && vol.delegation.needsAccommodation === false, JSON.stringify(vol.fees))
const vSelf = vol.members.find((m) => m.role === 'volunteer')
const photo = new FormData(); photo.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'photo.jpg')
check('a volunteer uploads a photo', (await volunteer.c.post(`/api/registration/members/${vSelf.id}/photo`, undefined, { form: photo })).status === 201)
const badPhoto = new FormData(); badPhoto.append('photo', new Blob(['%PDF'], { type: 'application/pdf' }), 'photo.pdf')
check('a photo must be a JPG or PNG (400)', (await volunteer.c.post(`/api/registration/members/${vSelf.id}/photo`, undefined, { form: badPhoto })).status === 400)
await volunteer.c.patch(`/api/registration/members/${vSelf.id}`, { ...details })
await volunteer.c.patch(`/api/registration/delegations/${volunteer.id}`, { completedSteps: ['start', 'setup', 'people', 'welfare', 'travel'] })
for (const direction of ['arrival', 'departure']) await volunteer.c.post(`/api/registration/delegations/${volunteer.id}/travel`, { direction, transport: 'own', localDate: direction === 'arrival' ? '2027-07-20' : '2027-07-29', localTime: '10:00', peopleIds: [vSelf.id] })
const volForm = new FormData(); volForm.append('files', new Blob(['%PDF-1.4 signed'], { type: 'application/pdf' }), 'my-form.pdf')
await volunteer.c.post(`/api/registration/delegations/${volunteer.id}/consent-files`, undefined, { form: volForm })
await volunteer.c.req('PUT', `/api/registration/delegations/${volunteer.id}/consents`, { answers: [{ memberId: vSelf.id, consents: true }] })
const volSubmit = await volunteer.c.post(`/api/registration/delegations/${volunteer.id}/submit`, { acknowledgeDressCode: true, acknowledgeInsurance: true })
check('a volunteer submits without any payment', volSubmit.status === 200, JSON.stringify(volSubmit.json))
check('the incomplete list shows the jury member, not the submitted volunteer', await (async () => {
  const list = (await S.admin.get('/api/admin/incomplete')).json?.registrations ?? []
  return list.some((r) => r.id === juror.id && r.kind === 'jury') && !list.some((r) => r.id === volunteer.id)
})())

// --- super admin changes a role; that user's sessions end
const accounts = (await S.superadmin.get('/api/admin/accounts')).json.accounts
const viewerAcc = accounts.find((a) => a.email === 'viewer@iol2027.test')
check('super admin changes a role', (await S.superadmin.patch(`/api/admin/accounts/${viewerAcc.id}`, { role: 'checkin_staff' })).status === 200)
check('changed user is signed out', (await S.viewer.get('/api/auth/me')).json.user === null)
check('super admin cannot change own role', (await S.superadmin.patch(`/api/admin/accounts/${accounts.find((a) => a.email === 'superadmin@iol2027.test').id}`, { role: 'viewer' })).status === 400)

// --- people status
const people = await S.admin.get('/api/admin/people')
check('admin people list has stages and missing details', people.status === 200 && people.json.people.length > 0 && people.json.people.every((p) => Array.isArray(p.missingDetails)))
// Thailand is submitted with everyone's travel in, so its badges are issued on submit (stage after "paid").
check('approved Thailand people show as paid, or badged', people.json.people.filter((p) => p.delegationId === thaiId).every((p) => ['paid', 'badge_issued'].includes(p.stage)), JSON.stringify(people.json.people.filter((p) => p.delegationId === thaiId).map((p) => p.stage)))
check('check-in staff sees people without their missing details', (await S.checkin.get('/api/admin/people')).json.people.every((p) => !('missingDetails' in p)))
check('Content editor cannot list people (403)', await can(S.content, '/api/admin/people') === 403)
check('dashboard has people stages', ((await S.finance.get('/api/admin/dashboard')).json.stages ?? []).length === 5)

// --- exports
const peopleCsv = await S.admin.get('/api/admin/exports/people')
check('people CSV: header and download name', peopleCsv.status === 200 && peopleCsv.text.includes('Passport number') && /attachment; filename="iol2027-people-/.test(peopleCsv.headers.get('content-disposition') ?? ''))
const csvBytes = new Uint8Array(await (await fetch(BASE + '/api/admin/exports/people', { headers: { Cookie: S.admin.cookie } })).arrayBuffer())
check('CSV starts with a UTF-8 byte-order mark so Excel keeps Thai text', csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf)
check('every staff role can export (Finance: people)', (await S.finance.get('/api/admin/exports/people')).status === 200)
check('Finance exports payments', (await S.finance.get('/api/admin/exports/payments')).text.includes('Receipt number'))
const narin = (await S.admin.get(`/api/registration/delegations/${thaiId}`)).json.members.find((m) => m.role === 'contestant')
await S.admin.patch(`/api/registration/members/${narin.id}`, { foodAllergyNotes: '=HYPERLINK("http://example.com")' })
const welfareCsv = await S.welfare.get('/api/admin/exports/welfare')
check('welfare CSV has no passport column', welfareCsv.status === 200 && !welfareCsv.text.includes('Passport'))
check('spreadsheet formulas are neutralised in CSV', welfareCsv.text.includes("'=HYPERLINK"), welfareCsv.text.slice(0, 300))
check('Content editor lists the exports', (await S.content.get('/api/admin/exports')).json.kinds.includes('people'))
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
check('Finance reads the fee settings', s0.status === 200 && s0.json.fees.singleRoomFee === 400 && s0.json.fees.teamFees.early_bird.accredited[0] === 2475, JSON.stringify(s0.json.fees))
check('Admin cannot change fees (403)', (await S.admin.put('/api/admin/settings/fees', s0.json.fees)).status === 403)
check('a negative fee is refused (400)', (await S.finance.put('/api/admin/settings/fees', { ...s0.json.fees, singleRoomFee: -1 })).status === 400)
const s1 = await S.finance.put('/api/admin/settings/fees', { ...s0.json.fees, observerFee: 300 })
check('Finance sets the observer fee', s1.status === 200 && s1.json.fees.observerFee === 300)
const thaiFees = (await S.admin.get(`/api/registration/delegations/${thaiId}`)).json.fees
check('the observer fee reaches delegation invoices', thaiFees.lines.find((l) => l.key === 'observers').amount === 300 && thaiFees.observersPending === false, JSON.stringify(thaiFees))
check('fees restored', (await S.finance.put('/api/admin/settings/fees', s0.json.fees)).json?.fees?.observerFee === s0.json.fees.observerFee)
const bankForm = { ...s0.json.invoice, bank: { beneficiaryName: 'Test Foundation', bankName: 'Test Bank', accountNumber: '000-000000-0', swiftCode: 'TESTTHBK' } }
check('Admin cannot change the bank account (403)', (await S.admin.put('/api/admin/settings/invoice', bankForm)).status === 403)
check('a malformed SWIFT code is refused (400)', (await S.finance.put('/api/admin/settings/invoice', { ...bankForm, bank: { ...bankForm.bank, swiftCode: 'TEST' } })).status === 400)
check('Finance saves the bank account', (await S.finance.put('/api/admin/settings/invoice', bankForm)).json?.invoice?.bank?.swiftCode === 'TESTTHBK')
check('the Payment step shows the bank account', (await tl.get(`/api/registration/delegations/${thaiId}`)).json?.bank?.accountNumber === '000-000000-0')
check('bank account restored', (await S.finance.put('/api/admin/settings/invoice', s0.json.invoice)).status === 200)
check('Finance cannot change the consent policy (403)', (await S.finance.put('/api/admin/settings/guardian-consent', { required: true, ageThreshold: 18, referenceDate: '2027-07-21' })).status === 403)
const policy = await S.admin.put('/api/admin/settings/guardian-consent', { required: true, ageThreshold: 18, referenceDate: '2027-07-21' })
check('Admin switches guardian consent on', policy.status === 200 && policy.json.guardianConsent.required === true)
const yui = (await S.admin.get(`/api/registration/delegations/${japanId}`)).json.members.find((m) => m.role === 'contestant')
await S.admin.patch(`/api/registration/members/${yui.id}`, { dateOfBirth: '2011-05-01' })
const japanNow = (await S.admin.get(`/api/registration/delegations/${japanId}`)).json
// The old per-contestant guardian upload is superseded by the Consent forms step (review of 27 Nov 2026): even with the
// stored policy on, nobody is flagged and submitting never asks for it.
check('the old guardian consent policy flags nobody', japanNow.members.find((m) => m.id === yui.id).needsGuardianConsent === false)
const consentMissing = await S.admin.post(`/api/registration/delegations/${japanId}/submit`)
check('submission never asks for the old guardian consent form', consentMissing.status === 409 && !consentMissing.json.missing.some((m) => m.includes('guardian consent form')), JSON.stringify(consentMissing.json))
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
