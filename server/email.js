/**
 * IOL 2027 transactional email.
 *
 * Every outbound email goes through sendEmail(), which records it in email_deliveries and sends it with:
 *   - Gmail (the organisers' own mailbox, iol2027.th@gmail.com) when GMAIL_USER and GMAIL_APP_PASSWORD are set, or
 *   - Resend when RESEND_API_KEY and EMAIL_FROM are set (needs a verified domain to reach anyone but the account owner), or
 *   - nothing: the email is only recorded ("queued").
 * Emails that go out on their own (payment, registration, badges, the daily summary) are sent with `retry`: if
 * sending fails, the message is kept and the scheduled job (jobs.js) tries again later. Codes and invitations are
 * not: whoever asked for them sees the failure and can send again. See docs/EMAIL_SETUP.md.
 */
import nodemailer from 'nodemailer'

const RESEND_API = 'https://api.resend.com/emails'

// ── colours (site palette) ─────────────────────────────────────────────────────
// White page, near-black text, no dark blocks: mail apps that force dark mode invert a plain white email cleanly.
const C = {
  ink:    '#160c1b',
  text:   '#2b2230',
  muted:  '#574e5c',
  line:   '#ddd6cb',
  orange: '#eda363',
  jade:   '#719a79',
}

const SMALL = `font-size:14px;color:${C.muted}`

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ── shared layout ─────────────────────────────────────────────────────────────
// Why the reader got the email, in the footer.
const TEAM_LEADER_REASON = 'This message was sent to you because you are registered or registering as a Team Leader for IOL 2027.'
const ORGANISER_REASON = 'This message was sent to you because you are an IOL 2027 organiser with access to the registration back office.'

function layout(previewText, bodyHtml, reason = TEAM_LEADER_REASON) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>IOL 2027 Thailand</title>
<style>:root{color-scheme:light only;supported-color-schemes:light only}</style>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#ffffff;color:${C.text};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<span style="display:none;max-height:0;overflow:hidden">${previewText}&nbsp;</span>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="background:#ffffff">
  <tr><td align="center" style="padding:32px 20px 40px">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff">

      <!-- header -->
      <tr><td style="padding:0 0 16px;border-bottom:3px solid ${C.orange}">
        <p style="margin:0;font-size:20px;font-weight:700;line-height:1.2;color:${C.ink}">IOL 2027</p>
        <p style="margin:4px 0 0;font-size:14px;line-height:1.4;color:${C.muted}">International Olympiad in Linguistics · Bangkok, Thailand</p>
      </td></tr>

      <!-- body -->
      <tr><td style="padding:32px 0 12px">
        ${bodyHtml}
      </td></tr>

      <!-- footer -->
      <tr><td style="padding:20px 0 0;border-top:1px solid ${C.line}">
        <p style="margin:0;font-size:14px;color:${C.muted};line-height:1.6">
          IOL 2027 Organising Committee · Bangkok, Thailand<br>
          <a href="mailto:iol2027.th@gmail.com" style="color:${C.ink}">iol2027.th@gmail.com</a>
        </p>
        <p style="margin:12px 0 0;font-size:13px;color:${C.muted};line-height:1.5">
          ${reason}
          Do not share this email with unauthorised parties.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

function h1(text) {
  return `<h1 style="margin:0 0 20px;font-size:26px;font-weight:700;line-height:1.25;color:${C.ink}">${text}</h1>`
}

function p(text, style = '') {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${C.text};${style}">${text}</p>`
}

function codeBlock(code, expiry = 'Expires in 30 minutes') {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0">
    <tr><td align="center" style="border:2px solid ${C.ink};border-radius:10px;padding:20px 16px">
      <p style="margin:0 0 6px;font-size:14px;color:${C.muted}">Your code</p>
      <p style="margin:0;padding-left:.25em;font-size:34px;font-weight:700;letter-spacing:.25em;color:${C.ink};font-family:'Courier New',Courier,monospace">${code}</p>
      <p style="margin:8px 0 0;font-size:14px;color:${C.muted}">${expiry}</p>
    </td></tr>
  </table>`
}

function infoTable(rows) {
  const cells = rows.map(([label, value], index) => {
    const rule = index < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : ''
    return `
    <tr>
      <td style="padding:12px 16px;${rule}font-size:14px;line-height:1.4;color:${C.muted};width:40%;vertical-align:top">${label}</td>
      <td style="padding:12px 16px;${rule}font-size:16px;line-height:1.4;font-weight:600;color:${C.ink};word-break:break-word">${esc(value)}</td>
    </tr>`
  }).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;margin:24px 0">
    <tbody>${cells}</tbody>
  </table>`
}

function button(label, href) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 8px">
    <tr><td bgcolor="${C.orange}" style="background:${C.orange};border-radius:8px">
      <a href="${href}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;color:${C.ink};text-decoration:none">${label} →</a>
    </td></tr>
  </table>`
}

function notice(text, color = C.jade) {
  const tint = color === C.orange ? '#fdf4ea' : '#f0f6f1'
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0">
    <tr><td bgcolor="${tint}" style="border-left:4px solid ${color};background:${tint};padding:14px 18px;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6;color:${C.ink}">${text}</td></tr>
  </table>`
}

// ── email builders ────────────────────────────────────────────────────────────

export function buildVerificationEmail({ countryTerritory, fullName, code }) {
  const subject = 'Your IOL 2027 verification code'
  const preview = `Your verification code is ${code} — expires in 30 minutes.`
  const body = `
    ${h1('Verify your email')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p(`You're creating a Team Leader account for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong> at IOL 2027.
         Enter the code below to verify your email address and continue.`)}
    ${codeBlock(code)}
    ${p(`If you did not request this code, please ignore this email.`, SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

export function buildProofReceivedEmail({ countryTerritory, fullName, paymentReference, amountDue, currency, invoiceCount }) {
  const subject = 'Payment proof received — IOL 2027'
  const preview = `We received your payment proof for ${countryTerritory}. Finance will review it within 5 business days.`
  const body = `
    ${h1('Payment proof received')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p(`We have received your proof of payment for the IOL 2027 registration of <strong style="color:${C.ink}">${esc(countryTerritory)}</strong>.
         Finance will review the transfer and update your registration status within 5 business days.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Payment reference', paymentReference],
      ['Amount declared', amountDue ? `${Number(amountDue).toLocaleString()} ${currency || 'USD'}` : 'Not specified'],
      ['Invoices requested', String(invoiceCount || 1)],
      ['Review status', 'Awaiting Finance review'],
    ])}
    ${notice('No further action is needed at this stage. We will email you once the payment has been confirmed.')}
    ${p(`If you have questions about your payment, reply to this email with your payment reference.`, SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

export function buildFinanceAlertEmail({ countryTerritory, paymentReference, amountDue, currency, proofFilename, delegationId }) {
  const subject = `[IOL 2027 Finance] Proof received — ${countryTerritory} · ${paymentReference}`
  const preview = `New payment proof uploaded for ${countryTerritory}.`
  const body = `
    ${h1('New payment proof')}
    ${p(`A Team Leader has uploaded a proof of payment and is awaiting Finance review.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Payment reference', paymentReference],
      ['Amount declared', amountDue ? `${Number(amountDue).toLocaleString()} ${currency || 'USD'}` : 'Not specified'],
      ['File uploaded', proofFilename || '—'],
      ['Delegation ID', delegationId],
    ])}
    ${notice(`Use the admin dashboard to confirm or reject this payment. Confirming will automatically send a confirmation email to the Team Leader.`, C.orange)}
  `
  return { subject, html: layout(preview, body, ORGANISER_REASON) }
}

export function buildPaymentConfirmedEmail({ countryTerritory, fullName, paymentReference, amountPaid, currency, receiptNumber, travelUrl, paymentUrl }) {
  const subject = 'Payment confirmed — IOL 2027 registration'
  const preview = `Your payment for ${countryTerritory} is confirmed. Next, add everyone's flights.`
  const body = `
    ${h1('Payment confirmed')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p(`Finance has confirmed your payment for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong>. Thank you.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Payment reference', paymentReference],
      ['Amount confirmed', amountPaid ? `${Number(amountPaid).toLocaleString()} ${currency || 'USD'}` : '—'],
      ...(receiptNumber ? [['Receipt number', receiptNumber]] : []),
    ])}
    ${notice('<strong>Next: add your flights.</strong> Enter each person’s arrival and departure, with flight number, date and time, in the Travel step. Once your registration is submitted and everyone’s travel is in, we will email you everyone’s badges.')}
    ${button('Add flight details', travelUrl)}
    ${p(`Your e-receipt is in the Payment step of the registration system: <a href="${paymentUrl}" style="color:${C.ink}">download the receipt</a>.`, SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

export function buildRegistrationSubmittedEmail({ countryTerritory, fullName, numberOfTeams, numberOfObservers, paymentConfirmed, travelComplete, travelUrl }) {
  const subject = 'Registration submitted — IOL 2027'
  const preview = `The registration for ${countryTerritory} is submitted. Your invoice is attached.`
  const settled = paymentConfirmed && travelComplete
  const next = [
    !paymentConfirmed && 'Finance is checking your transfer. We will email you when the payment is confirmed.',
    !travelComplete && 'Add each person’s arrival and departure in the Travel step.',
    settled
      ? 'Everything is in. Everyone’s badges follow in a separate email.'
      : 'Once the payment is confirmed and everyone’s travel is in, we will email you everyone’s badges.',
  ].filter(Boolean)
  const body = `
    ${h1('Registration submitted')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p(`The registration for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong> at IOL 2027 has been submitted. Your invoice is attached to this email as a PDF.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Teams', String(numberOfTeams || 1)],
      ['Observers', String(numberOfObservers || 0)],
      ['Registration', 'Submitted'],
      ['Payment', paymentConfirmed ? 'Confirmed' : 'Being checked by Finance'],
    ])}
    ${notice(`<strong>What happens next</strong><ul style="margin:8px 0 0;padding-left:20px">${next.map((item) => `<li style="margin:4px 0">${item}</li>`).join('')}</ul>`, settled ? C.jade : C.orange)}
    ${travelComplete ? '' : button('Add flight details', travelUrl)}
    ${p('You can still update people and travel in the registration system until the change deadline.', SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

/** "1 July 2027" from "2027-07-01". */
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

function tag(text) {
  return `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;background:#fdf4ea;font-size:12px;font-weight:700;line-height:1.5;color:${C.ink};vertical-align:2px">${text}</span>`
}

const changeTag = { new: 'New', changed: 'Changed', new_qr: 'New QR code' }
const changeText = {
  new: (name) => `New badge for ${name}`,
  changed: (name) => `Name, role or team changed for ${name}`,
  new_qr: (name) => `New QR code for ${name}. The old one no longer scans`,
}

/**
 * Every person's badge, attached to the email as a PDF. `people` is what each badge says ({ name, fullName, role,
 * detail, change, skippedName }). An `update` follows a change since the last email: `change` marks each badge that
 * is new or different, and `removed` names the people no longer in the delegation.
 */
export function buildBadgesEmail({ countryTerritory, fullName, people, removed = [], update = false, printCutoff, cutoffPassed, portalUrl }) {
  const subject = update ? `Badge update for ${countryTerritory} — IOL 2027` : `Badges for ${countryTerritory}: please check the names — IOL 2027`
  const preview = update
    ? `The badges for ${countryTerritory} have changed. Every badge is attached again.`
    : `${people.length} badges for ${countryTerritory}, attached as PDFs. Please check the names${cutoffPassed ? '' : ` by ${longDate(printCutoff)}`}.`
  const changes = [
    ...people.filter((person) => person.change).map((person) => changeText[person.change](esc(person.name))),
    ...removed.map((name) => `${esc(name)} is no longer in the delegation, so their badge no longer scans`),
  ]
  const rows = people.map((person, i) => {
    const rule = i < people.length - 1 ? `border-bottom:1px solid ${C.line};` : ''
    return `<tr><td style="padding:14px 16px;${rule}">
      <p style="margin:0;font-size:17px;font-weight:700;line-height:1.35;color:${C.ink}">${esc(person.name)}${person.change ? tag(changeTag[person.change]) : ''}</p>
      ${person.fullName ? `<p style="margin:2px 0 0;font-size:14px;line-height:1.45;color:${C.text}">${esc(person.fullName)}</p>` : ''}
      <p style="margin:2px 0 0;font-size:14px;line-height:1.45;color:${C.muted}">${esc(person.role)}${person.detail ? ` · ${esc(person.detail)}` : ''}</p>
      ${person.skippedName ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.45;color:${C.muted}">“${esc(person.skippedName)}” has characters the badge fonts cannot print, so the name above is printed instead.</p>` : ''}
    </td></tr>`
  }).join('')
  const cutoff = cutoffPassed
    ? `The print cut-off (${longDate(printCutoff)}) has passed, so a change made now is printed at the registration desk when you arrive.`
    : `<strong>Please check every name by ${longDate(printCutoff)}.</strong> That is the last day for changes to go to the print shop. Anything changed later is printed at the registration desk when you arrive.`
  const body = `
    ${h1(update ? 'Your badges have changed' : 'Your badges are ready')}
    ${p(`Hi ${esc(fullName)},`)}
    ${update
      ? p(`The badges for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong> have changed since our last email. Every badge is attached again, so this email replaces the earlier one.`)
      : p(`Everything for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong> is in: the registration is submitted, the payment is confirmed and everyone’s travel is added. Each person’s badge is attached as a PDF, exactly as it will be printed.`)}
    ${changes.length ? notice(`<strong>What changed</strong><ul style="margin:8px 0 0;padding-left:20px">${changes.map((line) => `<li style="margin:4px 0">${line}</li>`).join('')}</ul>`) : ''}
    ${notice(cutoff, C.orange)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;margin:24px 0">
      <tbody>${rows}</tbody>
    </table>
    ${notice('Each badge has a personal QR code. Staff scan it at the arrival desk and at event checkpoints. Forward each person their own PDF: the code scans from a phone screen as well as from the printed badge you collect in Bangkok.')}
    ${p(`To correct a name, change it in the People step of the <a href="${portalUrl}/?step=people" style="color:${C.ink}">registration system</a>, or reply to this email. Changes reach you the next morning, with every badge attached again.`, SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

/**
 * The registration admins' morning summary: badges waiting to be printed, the print cut-off, and emails that could not
 * be sent. Rows with nothing to report are left out.
 */
export function buildSummaryEmail({ fullName, toPrint, staffToPrint, reprint, needQr, waiting, badgeEmails, failedEmails, printCutoff, daysToCutoff, portalUrl }) {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const headline = [
    toPrint && plural(toPrint, 'badge to print', 'badges to print'),
    reprint && `${reprint} to print again`,
    failedEmails && plural(failedEmails, 'email not sent', 'emails not sent'),
  ].filter(Boolean).join(', ')
  const subject = `IOL 2027 registration: ${headline}`
  const cutoff = daysToCutoff > 1 ? `${longDate(printCutoff)}, in ${daysToCutoff} days` : daysToCutoff === 1 ? `${longDate(printCutoff)}, tomorrow`
    : daysToCutoff === 0 ? `${longDate(printCutoff)}, today` : `${longDate(printCutoff)}, passed`
  const rows = [
    toPrint && ['Badges to print', staffToPrint ? `${toPrint}, of which ${staffToPrint} for staff, guides, volunteers or guests` : String(toPrint)],
    reprint && ['Badges to print again', `${reprint}, changed after they were printed`],
    needQr && ['Badges that need a new QR first', String(needQr)],
    ['Print cut-off', cutoff],
    waiting.people && ['Countries still finishing registration', `${plural(waiting.countries, 'country', 'countries')}, ${plural(waiting.people, 'person', 'people')} without a badge yet`],
    ['Badge emails to Team Leaders in the last day', String(badgeEmails)],
    failedEmails && ['Emails not sent', `${failedEmails}, after trying for a day and a half`],
  ].filter(Boolean)
  const body = `
    ${h1('Daily summary')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p('Here is what is waiting in the registration back office this morning.')}
    ${infoTable(rows)}
    ${button('Open Badges', `${portalUrl}/staff#badges`)}
    ${failedEmails ? p(`<a href="${portalUrl}/staff#email" style="color:${C.ink}">Open the email log</a> to see why emails were not sent and to try them again.`) : ''}
    ${p('Sent at 8:00 Bangkok time on days when these numbers change. Printing stays with you: download the print file in Badges, send it to the print shop, then mark the badges as printed.', SMALL)}
  `
  return { subject, html: layout(headline, body, ORGANISER_REASON) }
}

export function buildPasswordCodeEmail({ fullName, code, setup, portalUrl }) {
  const subject = setup ? 'Set up your IOL 2027 staff account' : 'Reset your IOL 2027 password'
  const expiry = setup ? 'Expires in 7 days' : 'Expires in 30 minutes'
  const preview = `Your code is ${code}. ${expiry}.`
  const body = `
    ${h1(setup ? 'Set your password' : 'Reset your password')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p(setup
      ? 'An IOL 2027 organiser created a staff account for you. Open the organiser sign-in, choose “Forgot your password?”, and enter this code with your email address to set a password.'
      : 'Someone asked to reset the password for your IOL 2027 account. Enter this code on the sign-in page to choose a new password.')}
    ${codeBlock(code, expiry)}
    ${setup && portalUrl ? button('Open the organiser sign-in', `${portalUrl}/staff`) : ''}
    ${p('If you did not ask for this, you can ignore this email. Your password stays the same.', SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

export function buildInviteEmail({ countryTerritory, organisation, code, portalUrl }) {
  const subject = `Your IOL 2027 registration invitation — ${countryTerritory}`
  const preview = `Your invitation code for ${countryTerritory} is ${code}.`
  const body = `
    ${h1('Register your team for IOL 2027')}
    ${p(`You are receiving this as the official contact for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong>${organisation ? ` (${esc(organisation)})` : ''}. The 24th International Linguistics Olympiad takes place in Bangkok, Thailand, from 21 to 28 July 2027.`)}
    ${p('Use this code once to create the Team Leader account. It links the account to your country and its team allowance.')}
    ${infoTable([['Country or territory', countryTerritory], ['Invitation code', code]])}
    ${button('Create the Team Leader account', `${portalUrl}/?invite=${encodeURIComponent(code)}`)}
    ${notice('Registration happens in stages: team numbers and payment first, then people, then travel once flights are booked.')}
    ${p('Please do not forward this code outside your national organisation. If you are not the right contact, reply to this email.', SMALL)}
  `
  return { subject, html: layout(preview, body) }
}

// ── delivery ──────────────────────────────────────────────────────────────────

/** Which service sends email right now. Gmail wins when both are configured. */
export function emailProvider() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail'
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return 'resend'
  return null
}

// Reserved by RFC 2606 for testing: such addresses can never receive mail. Sending to them would only
// bounce back into the organisers' inbox, so they are recorded and skipped (the test accounts use .test).
const isTestAddress = (address) => /\.(test|example|invalid|localhost)$/i.test(address.trim())

let gmailTransport
function gmail() {
  gmailTransport ??= nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    // Google shows app passwords in groups of four; the spaces are not part of it.
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  })
  return gmailTransport
}

async function sendWithGmail({ to, subject, html, attachments }) {
  const user = process.env.GMAIL_USER
  // Gmail only sends as the signed-in mailbox, so the From address is always that account.
  const from = process.env.EMAIL_FROM?.includes(user) ? process.env.EMAIL_FROM : `IOL 2027 Registration <${user}>`
  const replyTo = process.env.EMAIL_REPLY_TO && process.env.EMAIL_REPLY_TO !== user ? process.env.EMAIL_REPLY_TO : undefined
  const info = await gmail().sendMail({ from, to, subject, html, replyTo, attachments })
  return info.messageId
}

async function sendWithResend({ to, subject, html, attachments }) {
  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // Replies go to the central mailbox (EMAIL_REPLY_TO), not the no-reply sending address.
    body: JSON.stringify({
      from: process.env.EMAIL_FROM, to: [to], subject, html, ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      ...(attachments.length ? { attachments: attachments.map((file) => ({ filename: file.filename, content: file.content.toString('base64') })) } : {}),
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.message || 'Resend rejected the request.')
  return payload.id
}

// After a failed send, an email kept for retrying is tried again after these waits (about a day and a half in all),
// then given up: the email log shows it as Failed, with Try again.
const RETRY_AFTER_MINUTES = [15, 60, 180, 480, 1440]
const MAX_ATTEMPTS = RETRY_AFTER_MINUTES.length + 1
// How long a send may take before the scheduled job assumes the server stopped mid-send and tries again.
const SENDING_LEASE = "interval '15 minutes'"

/**
 * Records an email, without sending it. `db` may be a transaction client, so the email is recorded with the change
 * that caused it; send it after the commit with deliverEmail().
 *
 * @param {object} opts
 * @param {string}  opts.to           - recipient email address
 * @param {string}  opts.subject
 * @param {string}  opts.html
 * @param {string}  opts.purpose      - stored in email_deliveries
 * @param {{ filename: string, content: Buffer, contentType?: string, cid?: string }[]} [opts.attachments]
 *   files to attach; one with a cid can be shown in the body as <img src="cid:...">
 * @param {boolean} [opts.retry]      - keep the message so a failed send is tried again later
 * @param {string}  [opts.accountId]
 * @param {string}  [opts.delegationId]
 * @returns the email_deliveries row: status 'sending' when it is ready to send, otherwise 'queued' (no email
 *   service configured) or 'skipped' (a test address).
 */
export async function queueEmail(db, { to, subject, html, purpose, attachments = [], retry = false, accountId = null, delegationId = null }) {
  const provider = emailProvider()
  const status = !provider ? 'queued' : isTestAddress(to) ? 'skipped' : 'sending'
  const message = status === 'sending' && retry
    ? { html, attachments: attachments.map(({ content, ...file }) => ({ ...file, content: content.toString('base64') })) }
    : null
  return (await db.query(
    `INSERT INTO email_deliveries (account_id, delegation_id, recipient_email, purpose, subject, provider, status, error_message, message, next_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::jsonb IS NULL THEN NULL ELSE now() + ${SENDING_LEASE} END)
     RETURNING *`,
    [accountId, delegationId, to, purpose, subject, provider ?? 'none', status, status === 'skipped' ? 'Test address: not sent.' : null, message],
  )).rows[0]
}

/**
 * Sends a recorded email ('sending'), from `content` or from the message kept for retrying. Resolves with the updated
 * row: 'sent', or 'retrying' when it failed and will be tried again. Throws when it failed and will not be.
 */
export async function deliverEmail(pool, delivery, content = null) {
  const kept = delivery.message && { html: delivery.message.html, attachments: delivery.message.attachments.map((file) => ({ ...file, content: Buffer.from(file.content, 'base64') })) }
  const { html, attachments = [] } = content ?? kept
  const attempts = delivery.attempts + 1
  try {
    const send = emailProvider() === 'gmail' ? sendWithGmail : emailProvider() === 'resend' ? sendWithResend : null
    if (!send) throw new Error('Email is switched off on this server.')
    const messageId = await send({ to: delivery.recipient_email, subject: delivery.subject, html, attachments })
    return (await pool.query(
      `UPDATE email_deliveries SET status = 'sent', provider_message_id = $1, sent_at = now(), attempts = $2, error_message = NULL,
         message = NULL, next_attempt_at = NULL WHERE id = $3 RETURNING *`,
      [messageId, attempts, delivery.id],
    )).rows[0]
  } catch (error) {
    const again = Boolean(delivery.message) && attempts < MAX_ATTEMPTS
    const row = (await pool.query(
      `UPDATE email_deliveries SET status = $1, attempts = $2, error_message = $3,
         next_attempt_at = CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(mins => $4::int) END WHERE id = $5 RETURNING *`,
      [again ? 'retrying' : 'failed', attempts, error.message, again ? RETRY_AFTER_MINUTES[attempts - 1] : null, delivery.id],
    )).rows[0]
    if (!again) throw error
    return row
  }
}

/**
 * Sends one email and records it (see queueEmail for the options). Resolves with `configured` true only when the email
 * really went out. With `retry`, a failed send resolves too (it is tried again later); otherwise it throws.
 */
export async function sendEmail({ pool, ...email }) {
  const delivery = await queueEmail(pool, email)
  if (delivery.status !== 'sending') return { delivery, configured: false }
  const sent = await deliverEmail(pool, delivery, { html: email.html, attachments: email.attachments })
  return { delivery: sent, configured: sent.status === 'sent' }
}

/** Takes a kept email for one more attempt now, unless another attempt has it. Null if it cannot be sent again. */
async function claim(pool, id, { due }) {
  return (await pool.query(
    `UPDATE email_deliveries SET status = 'sending', next_attempt_at = now() + ${SENDING_LEASE}
     WHERE id = $1 AND message IS NOT NULL AND (${due ? `status IN ('retrying', 'sending') AND next_attempt_at <= now()` : `status IN ('retrying', 'failed')`})
     RETURNING *`,
    [id],
  )).rows[0] ?? null
}

/** Try again (the email log's button): one more attempt now. Throws the error if it fails and will not be retried. */
export async function retryEmail(pool, id) {
  const delivery = await claim(pool, id, { due: false })
  return delivery && deliverEmail(pool, delivery)
}

/** The scheduled job's part: kept emails whose next attempt is due, oldest first. */
export async function retryDueEmails(pool, { limit = 25 } = {}) {
  const due = (await pool.query(
    `SELECT id FROM email_deliveries WHERE message IS NOT NULL AND status IN ('retrying', 'sending') AND next_attempt_at <= now()
     ORDER BY created_at LIMIT $1`,
    [limit],
  )).rows
  let sent = 0
  for (const { id } of due) {
    const delivery = await claim(pool, id, { due: true })
    if (!delivery) continue
    const row = await deliverEmail(pool, delivery).catch((error) => { console.error(`email ${id} failed again`, error.message); return null })
    if (row?.status === 'sent') sent++
  }
  return { due: due.length, sent }
}
