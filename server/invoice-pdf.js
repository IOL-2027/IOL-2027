// The registration invoice as a PDF, attached to the "registration submitted" email. Same content as the
// printable invoice in the portal (src/registration/invoice.ts), with the payment status added.
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url))
const C = { night: '#1d0929', ink: '#160c1b', cream: '#f3eee4', orange: '#eda363', muted: '#5f5763', line: '#ddd6cb', paper: '#f6f3ee', jade: '#2c6338' }
const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDate = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })

function paymentStatus(payment) {
  if (payment?.status === 'approved') return { text: `Paid · receipt ${payment.receipt_number ?? ''}`.trim(), color: C.jade }
  if (payment?.status === 'awaiting_review') return { text: 'Proof of payment received · Finance is checking the transfer', color: C.muted }
  return { text: 'Awaiting payment', color: C.muted }
}

/**
 * @param {object} opts
 * @param {object} opts.delegation  delegations row
 * @param {object|null} opts.payment payments row (latest), or null
 * @param {object} opts.fees        calculateFees() result
 * @returns {Promise<Buffer>}
 */
export function invoicePdf({ delegation, payment, fees, issuedOn = new Date() }) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `IOL 2027 invoice, ${delegation.country_territory}`, Author: 'IOL 2027 Local Organising Committee' } })
  doc.registerFont('Regular', asset('fonts/NotoSans-Regular.ttf'))
  doc.registerFont('Bold', asset('fonts/NotoSans-Bold.ttf'))
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })

  const left = 48
  const width = doc.page.width - 96

  // Header band
  doc.rect(0, 0, doc.page.width, 118).fill(C.night)
  doc.image(asset('iol2027-mark.png'), left, 22, { height: 74 })
  doc.font('Bold').fontSize(9).fillColor(C.orange).text('IOL 2027 · BANGKOK, THAILAND', left + 82, 40, { characterSpacing: 1 })
  doc.font('Bold').fontSize(24).fillColor(C.cream).text('Registration invoice', left + 82, 54)

  // Details
  const status = paymentStatus(payment)
  const billTo = [payment?.invoice_recipient_name || delegation.accredited_organisation || delegation.country_territory, payment?.invoice_recipient_address].filter(Boolean).join('\n')
  const details = [
    ['Bill to', billTo],
    ['Country or territory', delegation.country_territory],
    ['Payment reference', payment?.payment_reference || '—'],
    ['Invoice date', longDate(issuedOn)],
    ['Fee tier', fees.tierLabel],
    ['Invoices requested', String(payment?.invoice_count ?? 1) + (payment?.invoice_split_note ? ` (${payment.invoice_split_note})` : '')],
  ]
  let y = 146
  const colWidth = (width - 24) / 2
  for (let i = 0; i < details.length; i += 2) {
    let rowHeight = 0
    for (const [j, [label, value]] of details.slice(i, i + 2).entries()) {
      const x = left + j * (colWidth + 24)
      doc.font('Regular').fontSize(8.5).fillColor(C.muted).text(label.toUpperCase(), x, y, { width: colWidth, characterSpacing: 0.6 })
      doc.font('Bold').fontSize(11).fillColor(C.ink).text(value, x, y + 13, { width: colWidth })
      rowHeight = Math.max(rowHeight, 13 + doc.heightOfString(value, { width: colWidth }))
    }
    y += rowHeight + 16
  }
  doc.roundedRect(left, y, width, 30, 6).fill(C.paper)
  doc.font('Bold').fontSize(10).fillColor(status.color).text(status.text, left + 14, y + 9, { width: width - 28 })
  y += 50

  // Fee table
  const cols = [{ x: left, w: 150 }, { x: left + 160, w: width - 160 - 130 }, { x: left + width - 120, w: 120 }]
  doc.font('Bold').fontSize(9).fillColor(C.muted)
  doc.text('ITEM', cols[0].x, y, { width: cols[0].w })
  doc.text('CALCULATION', cols[1].x, y, { width: cols[1].w })
  doc.text(`AMOUNT (${fees.currency})`, cols[2].x, y, { width: cols[2].w, align: 'right' })
  y += 16
  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.5).strokeColor(C.line).stroke()
  for (const line of fees.lines) {
    y += 10
    const value = line.amount === null ? (fees.observersPending ? 'To be confirmed' : '—') : money(line.amount)
    const height = Math.max(doc.font('Regular').fontSize(10.5).heightOfString(line.detail, { width: cols[1].w }), 14)
    doc.font('Bold').fontSize(10.5).fillColor(C.ink).text(line.label, cols[0].x, y, { width: cols[0].w })
    doc.font('Regular').fontSize(10.5).fillColor(C.ink).text(line.detail, cols[1].x, y, { width: cols[1].w })
    doc.font('Regular').fontSize(10.5).text(value, cols[2].x, y, { width: cols[2].w, align: 'right' })
    y += height + 10
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.75).strokeColor(C.line).stroke()
  }
  y += 14
  doc.font('Bold').fontSize(13).fillColor(C.ink).text('Total to transfer', cols[0].x, y, { width: 260 })
  doc.text(`${fees.currency} ${money(fees.total)}${fees.observersPending ? ' + observer fees' : ''}`, left + width - 260, y, { width: 260, align: 'right' })
  y += 40

  // How to pay
  const pay = [
    'Transfer the full amount to the Promotion of Academic Olympiad and Development of Science Education Foundation (POSN) at Siam Commercial Bank (SCB).',
    `Choose OUR for bank charges so the organisers receive the full amount, and put ${payment?.payment_reference || 'your payment reference'} in the transfer description.`,
    'The account name, number and SWIFT code are shown in the registration system once Finance approves them.',
  ]
  const payHeight = pay.reduce((sum, text) => sum + doc.font('Regular').fontSize(10).heightOfString(text, { width: width - 36 }) + 6, 0) + 40
  doc.roundedRect(left, y, width, payHeight, 8).fill(C.paper)
  doc.font('Bold').fontSize(11).fillColor(C.ink).text('How to pay', left + 18, y + 16)
  let py = y + 36
  for (const text of pay) {
    doc.font('Regular').fontSize(10).fillColor(C.ink).text(text, left + 18, py, { width: width - 36 })
    py += doc.heightOfString(text, { width: width - 36 }) + 6
  }

  // Footer
  doc.font('Regular').fontSize(8.5).fillColor(C.muted).text(
    'IOL 2027 Local Organising Committee · iol2027.th@gmail.com\nThis invoice is not a tax receipt. An e-receipt is available in the registration system after Finance confirms the transfer.',
    left, doc.page.height - 86, { width, lineGap: 2 },
  )
  doc.end()
  return done
}
