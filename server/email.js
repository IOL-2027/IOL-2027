/**
 * IOL 2027 — transactional email module (Resend)
 *
 * Every outbound email goes through sendEmail(). Caller provides purpose,
 * delegationId and accountId for the audit row; the function handles
 * delivery tracking in email_deliveries and retries nothing — upstream
 * should re-call if needed.
 */

const RESEND_API = 'https://api.resend.com/emails'

// ── base colours (match site CSS variables) ──────────────────────────────────
const C = {
  night:  '#160c1b',
  cream:  '#f3eed4',
  orange: '#eda363',
  jade:   '#719a79',
  paper:  '#faf8f5',
  line:   '#e0d9cc',
  ink:    '#160c1b',
  muted:  '#706774',
}

// ── shared layout ─────────────────────────────────────────────────────────────
function layout(previewText, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>IOL 2027 Thailand</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.paper};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<span style="display:none;max-height:0;overflow:hidden">${previewText}&nbsp;</span>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.paper};padding:32px 16px 56px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%">

      <!-- header -->
      <tr><td style="background:${C.night};border-radius:16px 16px 0 0;padding:28px 40px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td>
              <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.orange}">IOL 2027</p>
              <p style="margin:6px 0 0;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:rgba(243,238,212,.42)">INTERNATIONAL OLYMPIAD IN LINGUISTICS · BANGKOK</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- body -->
      <tr><td style="background:#ffffff;padding:40px 40px 36px;border-left:1px solid ${C.line};border-right:1px solid ${C.line}">
        ${bodyHtml}
      </td></tr>

      <!-- footer -->
      <tr><td style="background:${C.paper};border:1px solid ${C.line};border-top:none;border-radius:0 0 16px 16px;padding:24px 40px">
        <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.6">
          IOL 2027 Organising Committee · Bangkok, Thailand<br>
          <a href="mailto:iol2027.th@gmail.com" style="color:${C.muted}">iol2027.th@gmail.com</a>
        </p>
        <p style="margin:14px 0 0;font-size:11px;color:#b0a8b4;line-height:1.5">
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
  return `<h1 style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:-.04em;line-height:1.05;color:${C.night}">${text}</h1>`
}

function p(text, style = '') {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.72;color:${C.muted};${style}">${text}</p>`
}

function codeBlock(code) {
  return `<div style="margin:24px 0;background:${C.night};border-radius:12px;padding:28px;text-align:center">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(243,238,212,.42)">VERIFICATION CODE</p>
    <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:.3em;color:${C.orange};font-family:'Courier New',Courier,monospace">${code}</p>
    <p style="margin:10px 0 0;font-size:12px;color:rgba(243,238,212,.4)">Expires in 30 minutes</p>
  </div>`
}

function infoTable(rows) {
  const cells = rows.map(([label, value]) => `
    <tr>
      <td style="padding:11px 16px;border-bottom:1px solid ${C.line};font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#b0a8b4;white-space:nowrap;width:40%">${label}</td>
      <td style="padding:11px 16px;border-bottom:1px solid ${C.line};font-size:14px;font-weight:600;color:${C.night}">${value}</td>
    </tr>`).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.line};border-radius:12px;overflow:hidden;margin:24px 0">
    <tbody>${cells}</tbody>
  </table>`
}

function button(label, href) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 8px">
    <tr><td style="background:${C.orange};border-radius:99px">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;letter-spacing:-.01em;color:${C.night};text-decoration:none">${label} →</a>
    </td></tr>
  </table>`
}

function notice(text, color = C.jade) {
  return `<div style="border-left:3px solid ${color};background:rgba(113,154,121,.08);padding:14px 18px;border-radius:0 8px 8px 0;margin:20px 0">
    <p style="margin:0;font-size:14px;line-height:1.6;color:${C.night}">${text}</p>
  </div>`
}

// ── email builders ────────────────────────────────────────────────────────────

export function buildVerificationEmail({ countryTerritory, fullName, code }) {
  const subject = 'Your IOL 2027 verification code'
  const preview = `Your verification code is ${code} — expires in 30 minutes.`
  const body = `
    ${h1('Verify your email')}
    ${p(`Hi ${fullName},`)}
    ${p(`You're creating a Team Leader account for <strong style="color:${C.night}">${countryTerritory}</strong> at IOL 2027.
         Enter the code below to verify your email address and continue.`)}
    ${codeBlock(code)}
    ${p(`If you did not request this code, please ignore this email.`, 'font-size:13px;color:#b0a8b4')}
  `
  return { subject, html: layout(preview, body) }
}

export function buildProofReceivedEmail({ countryTerritory, fullName, paymentReference, amountDue, currency, invoiceCount }) {
  const subject = 'Payment proof received — IOL 2027'
  const preview = `We received your payment proof for ${countryTerritory}. Finance will review it within 5 business days.`
  const body = `
    ${h1('Payment proof received')}
    ${p(`Hi ${fullName},`)}
    ${p(`We have received your proof of payment for the IOL 2027 registration of <strong style="color:${C.night}">${countryTerritory}</strong>.
         Finance will review the transfer and update your registration status within 5 business days.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Payment reference', paymentReference],
      ['Amount declared', amountDue ? `${Number(amountDue).toLocaleString()} ${currency || 'USD'}` : 'Not specified'],
      ['Invoices requested', String(invoiceCount || 1)],
      ['Review status', 'Awaiting Finance review'],
    ])}
    ${notice('No further action is needed at this stage. We will email you once the payment has been confirmed.')}
    ${p(`If you have questions about your payment, reply to this email with your payment reference.`, 'font-size:13px;color:#b0a8b4')}
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

export function buildPaymentConfirmedEmail({ countryTerritory, fullName, paymentReference, amountPaid, currency, receiptUrl }) {
  const subject = 'Payment confirmed — IOL 2027 registration'
  const preview = `Your payment for ${countryTerritory} has been confirmed. Your registration is now active.`
  const body = `
    ${h1('Payment confirmed')}
    ${p(`Hi ${fullName},`)}
    ${p(`Great news — Finance has confirmed your payment for <strong style="color:${C.night}">${countryTerritory}</strong>.
         Your IOL 2027 registration is now active.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Payment reference', paymentReference],
      ['Amount confirmed', amountPaid ? `${Number(amountPaid).toLocaleString()} ${currency || 'USD'}` : '—'],
      ['Registration status', 'Active'],
    ])}
    ${notice('<strong>Next steps:</strong> Log in to complete member details, teams and travel information. Invitation letters will be sent to registered email addresses.')}
    ${receiptUrl ? button('Download receipt', receiptUrl) : ''}
    ${p(`QR badges will be issued once participant names are finalised. You will receive a separate email when they are ready.`, 'font-size:13px;color:#b0a8b4')}
  `
  return { subject, html: layout(preview, body) }
}

export function buildRegistrationSubmittedEmail({ countryTerritory, fullName, numberOfTeams, numberOfObservers, missingItems }) {
  const subject = 'Registration submitted — IOL 2027'
  const preview = `Your initial registration for ${countryTerritory} has been submitted.`
  const missing = missingItems?.length
    ? `<ul style="margin:8px 0 0;padding-left:20px">${missingItems.map((item) => `<li style="margin:4px 0;font-size:14px;color:${C.muted}">${item}</li>`).join('')}</ul>`
    : ''
  const body = `
    ${h1('Registration submitted')}
    ${p(`Hi ${fullName},`)}
    ${p(`Your initial registration for <strong style="color:${C.night}">${countryTerritory}</strong> at IOL 2027 has been submitted successfully.`)}
    ${infoTable([
      ['Delegation', countryTerritory],
      ['Teams', String(numberOfTeams || 1)],
      ['Observers', String(numberOfObservers || 0)],
      ['Status', 'Submitted — awaiting payment proof'],
    ])}
    ${missingItems?.length ? `
      ${notice(`<strong>Still needed before final submission:</strong>${missing}`, C.orange)}
    ` : notice('Your registration is complete for now. You can return to add travel details after flights are booked.')}
    ${p(`You will receive a separate email once Finance confirms your payment.`, 'font-size:13px;color:#b0a8b4')}
  `
  return { subject, html: layout(preview, body) }
}

// ── delivery ──────────────────────────────────────────────────────────────────

/**
 * Send one email via Resend and record the delivery.
 *
 * @param {object} opts
 * @param {pg.Pool} opts.pool
 * @param {string}  opts.to           - recipient email address
 * @param {string}  opts.subject
 * @param {string}  opts.html
 * @param {string}  opts.purpose      - stored in email_deliveries
 * @param {string}  [opts.accountId]
 * @param {string}  [opts.delegationId]
 * @returns {{ delivery: object, configured: boolean }}
 */
export async function sendEmail({ pool, to, subject, html, purpose, accountId = null, delegationId = null }) {
  const deliveryResult = await pool.query(
    `INSERT INTO email_deliveries (account_id, delegation_id, recipient_email, purpose, status)
     VALUES ($1, $2, $3, $4, 'queued')
     RETURNING *`,
    [accountId, delegationId, to, purpose],
  )
  const delivery = deliveryResult.rows[0]

  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    return { delivery, configured: false }
  }

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.message || 'Resend rejected the request.')

    const sent = await pool.query(
      `UPDATE email_deliveries
       SET status = 'sent', provider_message_id = $1, sent_at = now()
       WHERE id = $2
       RETURNING *`,
      [payload.id, delivery.id],
    )
    return { delivery: sent.rows[0], configured: true }
  } catch (error) {
    await pool.query(
      `UPDATE email_deliveries SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error.message, delivery.id],
    )
    throw error
  }
}
