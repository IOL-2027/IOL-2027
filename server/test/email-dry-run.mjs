// Every email the registration system sends, built exactly as it would go out (subject, HTML, the plain-text part and
// the PDF attachments) for a country, a jury member and a volunteer, and saved as .eml files instead of being sent.
// Open them in Outlook, Thunderbird or Apple Mail to see them as a reader would. Needs no database and no email account.
//
// usage: node server/test/email-dry-run.mjs <output folder>
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
import {
  buildBadgesEmail, buildConsentFormsEmail, buildFinanceAlertEmail, buildInviteEmail, buildPasswordCodeEmail, buildPaymentConfirmedEmail,
  buildPickupEmail, buildProofReceivedEmail, buildProofReturnedEmail, buildRegistrationSubmittedEmail, buildReminderEmail, buildSummaryEmail,
  buildVerificationEmail, htmlToText,
} from '../email.js'
import { consentFileName, consentPdf } from '../consent-pdf.js'
import { invoicePdf } from '../invoice-pdf.js'
import { badgeContent, badgePayload, badgeSecret } from '../badges.js'
import { badgesPdf } from '../badge-pdf.js'
import { defaultSettings, delegationFees } from '../fees.js'

const out = path.resolve(process.argv[2] ?? 'email-dry-run')
fs.mkdirSync(out, { recursive: true })
const portalUrl = 'https://iol2027-dev.web.app/portal'
const from = 'IOL 2027 Registration <iol2027.th@gmail.com>'
const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
const event = { peopleDeadline: '2027-05-31', travelDeadline: '2027-06-30' }
const pdf = (filename, content) => ({ filename, content, contentType: 'application/pdf' })

// One country (two teams, an under-18), one jury member with an observer, one volunteer.
const country = {
  id: crypto.randomUUID(), kind: 'country', country_territory: 'Reviewland', national_representative_name: 'Rita Rep', team_leader_email: 'rita@example.org',
  number_of_teams: 2, number_of_observers: 1, fee_category: 'accredited', single_rooms: { teamLeaders: [false, false], observers: [true] }, accredited_organisation: 'Reviewland Linguistics Olympiad',
}
const jury = { ...country, id: crypto.randomUUID(), kind: 'jury', country_territory: 'IOL 2027 jury', national_representative_name: 'Julia Juror', team_leader_email: 'julia@example.org', number_of_teams: 1, number_of_observers: 1, single_rooms: { teamLeaders: [false], observers: [false] } }
const volunteer = { ...country, id: crypto.randomUUID(), kind: 'volunteer', country_territory: 'IOL 2027 volunteers', national_representative_name: 'Victor Volunteer', team_leader_email: 'victor@example.org', number_of_teams: 1, number_of_observers: 0, single_rooms: { teamLeaders: [false], observers: [] } }
const member = (name, dob, role = 'contestant') => ({ display_name: name, official_name: name, date_of_birth: dob, role })
const countryPeople = [member('Rita Rep', '1980-02-02', 'team_leader'), member('Ann Alpha', '2009-03-03'), member('Ben Beta', '2008-01-01')]

const payment = (d) => ({
  id: crypto.randomUUID(), payment_reference: `IOL27-${d.kind.toUpperCase().slice(0, 3)}-0001`, invoice_number: 'IOL2027/30', amount_due: delegationFees(defaultSettings.fees, d).total,
  currency: 'USD', fee_tier: 'early_bird', invoice_recipient_name: d.kind === 'country' ? d.accredited_organisation : d.national_representative_name, invoice_count: 1, created_at: new Date('2027-02-01'),
  status: 'awaiting_review', receipt_number: 'R-2027-0001',
})
const invoice = async (d) => pdf(`IOL2027-invoice-${d.kind}.pdf`, await invoicePdf({ delegation: d, payment: payment(d), fees: delegationFees(defaultSettings.fees, d, 'early_bird'), invoice: defaultSettings.invoice }))
const consents = async (d, people) => Promise.all(people.map(async (m) => pdf(consentFileName(m, d.kind === 'country' ? d.country_territory : 'IOL 2027'), await consentPdf(m, d.kind === 'country' ? d.country_territory : 'IOL 2027'))))
const badges = async (d, people) => Promise.all(people.map(async (m) => {
  const publicId = crypto.randomUUID()
  const { content } = badgeContent({ kind: 'member', public_id: publicId, badge_name: m.display_name.split(' ')[0], display_name: m.display_name, official_name: m.official_name, role: m.role, place: d.kind === 'country' ? d.country_territory : null, team_name: m.role === 'contestant' ? 'A' : null })
  return { content, file: pdf(`IOL2027-badge_${m.display_name.replace(/\W+/g, '-')}.pdf`, await badgesPdf([{ ...content, payload: badgePayload(publicId, badgeSecret(publicId)) }], { layout: 'preview', title: `IOL 2027 badge, ${m.display_name}` })) }
}))
const transfers = ['Arrival 21 July: pickup 10:30 at Suvarnabhumi (BKK), bus A2, meeting point Gate 3', 'Departure 28 July: time and bus to follow']

const emails = []
const add = (name, to, built, attachments = []) => emails.push({ name, to, ...built, attachments })

for (const d of [country, jury, volunteer]) {
  const k = d.kind
  const people = k === 'country' ? countryPeople : k === 'jury' ? [member('Julia Juror', '1975-05-05', 'jury'), member('Oscar Observer', '1976-06-06', 'observer')] : [member('Victor Volunteer', '2003-07-07', 'volunteer')]
  const owes = delegationFees(defaultSettings.fees, d).total > 0
  const ctx = { countryTerritory: d.country_territory, fullName: d.national_representative_name, kind: k }
  const pay = payment(d)
  add(`${k}-01-verification`, d.team_leader_email, buildVerificationEmail({ ...ctx, code: '482913' }))
  if (owes) {
    add(`${k}-02-proof-received`, d.team_leader_email, buildProofReceivedEmail({ ...ctx, paymentReference: pay.payment_reference, amountDue: pay.amount_due, currency: 'USD', invoiceCount: 1, peopleUrl: `${portalUrl}/?step=people` }))
    add(`${k}-03-proof-returned`, d.team_leader_email, buildProofReturnedEmail({ ...ctx, paymentReference: pay.payment_reference, note: 'The second transfer is missing.', paymentUrl: `${portalUrl}/?step=payment` }))
    add(`${k}-04-payment-confirmed`, d.team_leader_email, buildPaymentConfirmedEmail({ ...ctx, paymentReference: pay.payment_reference, amountPaid: pay.amount_due, currency: 'USD', receiptNumber: pay.receipt_number, travelUrl: `${portalUrl}/?step=travel`, paymentUrl: `${portalUrl}/?step=payment` }))
  }
  add(`${k}-05-consent-forms`, d.team_leader_email, buildConsentFormsEmail({ ...ctx, countryTerritory: k === 'country' ? d.country_territory : 'IOL 2027', people: people.map((m) => ({ name: m.display_name, form: m.date_of_birth > '2009-07-21' ? 'under18' : 'adult' })), url: `${portalUrl}/?step=consent` }), await consents(d, people))
  add(`${k}-06-submitted`, d.team_leader_email, buildRegistrationSubmittedEmail({ ...ctx, numberOfTeams: d.number_of_teams, numberOfObservers: d.number_of_observers, paymentConfirmed: false, travelComplete: false, travelUrl: `${portalUrl}/?step=travel`, owes, ...event }), owes ? [await invoice(d)] : [])
  const made = await badges(d, people)
  add(`${k}-07-badges`, d.team_leader_email, buildBadgesEmail({ ...ctx, people: made.map((b) => ({ ...b.content, transfers })), printCutoff: '2027-07-07', cutoffPassed: false, portalUrl }), made.map((b) => b.file))
  add(`${k}-08-pickup`, d.team_leader_email, buildPickupEmail({ ...ctx, trips: [{ direction: 'arrival', date: '21 July 2027', flight: 'TG 661', pickupTime: '10:30', group: 'A2', meeting: 'Gate 3', people: people.map((m) => m.display_name).join(', ') }], url: `${portalUrl}/?step=travel` }))
  add(`${k}-09-reminder`, d.team_leader_email, buildReminderEmail({ ...ctx, title: 'People closes soon', lead: 'People’s details are due by', deadline: '31 May 2027', items: ['Ann Alpha: passport number'], buttonLabel: 'Continue your registration', url: `${portalUrl}/?step=people` }))
}
add('staff-invite', 'contact@example.org', buildInviteEmail({ countryTerritory: 'Reviewland', organisation: 'Reviewland Linguistics Olympiad', code: 'IOL2027-REV-0001', portalUrl }))
add('staff-account-setup', 'staff@example.org', buildPasswordCodeEmail({ fullName: 'Sam Staff', code: '731204', setup: true, portalUrl, email: 'staff@example.org' }))
add('account-password-reset', 'rita@example.org', buildPasswordCodeEmail({ fullName: 'Rita Rep', code: '554120', setup: false, portalUrl, email: 'rita@example.org' }))
add('staff-finance-alert', 'finance@example.org', buildFinanceAlertEmail({ countryTerritory: 'Reviewland', paymentReference: 'IOL27-COU-0001', amountDue: 8425, currency: 'USD', proofFilename: 'transfer.pdf', delegationId: country.id }))
add('staff-daily-summary', 'admin@example.org', buildSummaryEmail({ fullName: 'Ada Admin', toPrint: 12, staffToPrint: 2, reprint: 1, needQr: 0, waiting: { countries: 3, people: 27 }, badgeEmails: 4, failedEmails: 1, printCutoff: '2027-07-07', daysToCutoff: 30, portalUrl }))

const rows = []
for (const email of emails) {
  const text = htmlToText(email.html)
  const { message } = await composer.sendMail({ from, to: email.to, subject: email.subject, html: email.html, text, attachments: email.attachments })
  fs.writeFileSync(path.join(out, `${email.name}.eml`), message)
  fs.writeFileSync(path.join(out, `${email.name}.html`), email.html)
  fs.writeFileSync(path.join(out, `${email.name}.txt`), text)
  rows.push({ email: email.name, subject: email.subject, kb: Math.round(message.length / 1024), files: email.attachments.map((a) => a.filename).join(', ') || '-' })
}
console.table(rows)
console.log(`${emails.length} emails written to ${out}`)
