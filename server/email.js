/**
 * IOL 2027 transactional email.
 *
 * Every outbound email goes through sendEmail(), which records it in email_deliveries and sends it with:
 *   - Gmail (the organisers' own mailbox, iol2027.th@gmail.com) when GMAIL_USER and GMAIL_APP_PASSWORD are set, or
 *   - Resend when RESEND_API_KEY and EMAIL_FROM are set (needs a verified domain to reach anyone but the account owner), or
 *   - nothing: the email is only recorded ("queued").
 * Nothing is retried; callers send again if they need to. See docs/EMAIL_SETUP.md.
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
function layout(previewText, bodyHtml) {
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
          This message was sent to you because you are registered or registering as a Team Leader for IOL 2027.
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
  return { subject, html: layout(preview, body) }
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
    ${notice('<strong>Next: add your flights.</strong> Enter each person’s arrival and departure, with flight number, date and time, in the Travel step. Once your registration is submitted and everyone’s travel is in, we will email the QR codes for their badges.')}
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
      ? 'Everything is in. The QR codes for everyone’s badges follow in a separate email.'
      : 'Once the payment is confirmed and everyone’s travel is in, we will email the QR codes for their badges.',
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

const roleLabel = (role) => ({ team_leader: 'Team Leader', contestant: 'Contestant', observer: 'Observer' }[role] ?? role.replace(/_/g, ' '))

export function buildBadgesEmail({ countryTerritory, fullName, people, newCount }) {
  const subject = `QR badges for ${countryTerritory} — IOL 2027`
  const preview = `The QR codes for ${people.length} people in ${countryTerritory} are ready.`
  const card = (person) => person ? `<td width="50%" valign="top" style="padding:8px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.line};border-radius:10px">
        <tr><td align="center" style="padding:16px 12px 6px"><img src="cid:${person.cid}" width="150" height="150" alt="QR code for ${esc(person.name)}" style="display:block;width:150px;height:150px"></td></tr>
        <tr><td align="center" style="padding:0 12px 16px">
          <p style="margin:0;font-size:16px;font-weight:700;color:${C.ink}">${esc(person.name)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:${C.muted}">${esc(roleLabel(person.role))}${person.team ? ` · ${esc(person.team)}` : ''}</p>
        </td></tr>
      </table></td>` : '<td width="50%" style="padding:8px"></td>'
  const rows = []
  for (let i = 0; i < people.length; i += 2) rows.push(`<tr>${card(people[i])}${card(people[i + 1])}</tr>`)
  const body = `
    ${h1('Your QR badges are ready')}
    ${p(`Hi ${esc(fullName)},`)}
    ${p(`Everything for <strong style="color:${C.ink}">${esc(countryTerritory)}</strong> is in: the registration is submitted, the payment is confirmed and everyone’s travel is added. Here is the QR code for each person in your delegation.`)}
    ${newCount < people.length ? p(`This email includes ${newCount} new ${newCount === 1 ? 'badge' : 'badges'}. Everyone else’s code is unchanged.`) : ''}
    ${notice('Each code is personal. Staff scan it at the arrival desk and at event checkpoints, and the printed badges you receive in Bangkok carry the same codes. The images are also attached, so you can forward each person their own.')}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 16px">${rows.join('')}</table>
    ${p('If a code is lost or someone’s details change, reply to this email and we will issue a new one.', SMALL)}
  `
  return { subject, html: layout(preview, body) }
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

/**
 * Send one email and record the delivery.
 *
 * @param {object} opts
 * @param {pg.Pool} opts.pool
 * @param {string}  opts.to           - recipient email address
 * @param {string}  opts.subject
 * @param {string}  opts.html
 * @param {string}  opts.purpose      - stored in email_deliveries
 * @param {{ filename: string, content: Buffer, contentType?: string, cid?: string }[]} [opts.attachments]
 *   files to attach; one with a cid can be shown in the body as <img src="cid:...">
 * @param {string}  [opts.accountId]
 * @param {string}  [opts.delegationId]
 * @returns {{ delivery: object, configured: boolean }} configured is true only when the email really went out.
 */
export async function sendEmail({ pool, to, subject, html, purpose, attachments = [], accountId = null, delegationId = null }) {
  const provider = emailProvider()
  const skip = provider && isTestAddress(to)
  const delivery = (await pool.query(
    `INSERT INTO email_deliveries (account_id, delegation_id, recipient_email, purpose, provider, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [accountId, delegationId, to, purpose, provider ?? 'none', skip ? 'skipped' : 'queued', skip ? 'Test address: not sent.' : null],
  )).rows[0]
  if (!provider || skip) return { delivery, configured: false }

  try {
    const messageId = provider === 'gmail' ? await sendWithGmail({ to, subject, html, attachments }) : await sendWithResend({ to, subject, html, attachments })
    const sent = await pool.query(
      `UPDATE email_deliveries SET status = 'sent', provider_message_id = $1, sent_at = now() WHERE id = $2 RETURNING *`,
      [messageId, delivery.id],
    )
    return { delivery: sent.rows[0], configured: true }
  } catch (error) {
    await pool.query(`UPDATE email_deliveries SET status = 'failed', error_message = $1 WHERE id = $2`, [error.message, delivery.id])
    throw error
  }
}
