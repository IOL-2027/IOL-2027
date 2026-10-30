// The registration invoice as a PDF, laid out like Finance's invoice template: the event, the invoice number
// and dates, payer and recipient, the items and the bank transfer details. The "registration submitted"
// email attaches it and the portal's Payment step downloads it, so both are the same document.
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url))
// As on the template: "1467.00 USD", "February 20, 2027".
const price = (amount, currency) => `${amount.toFixed(2)} ${currency}`
const usDate = (value) => new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Bangkok' })

/** The invoice's numbered items, worded as on the template ("Participation fee for the first team of Thailand"). */
function invoiceItems(fees, country) {
  const each = (line) => (line.quantity > 1 ? ` (${line.quantity} × ${price(line.unit, fees.currency)})` : '')
  const items = []
  for (const line of fees.lines) {
    if (!line.quantity) continue
    if (line.key === 'team1' || line.key === 'team2') {
      const which = fees.category === 'non_accredited' ? 'the team' : line.key === 'team1' ? 'the first team' : 'the second team'
      items.push({ text: `Participation fee for ${which} of ${country} (${fees.tierLabel.toLowerCase()} rate${fees.category === 'previous_host' ? ', previous host' : ''})`, amount: line.amount })
    } else if (line.key === 'observers') {
      const who = line.quantity === 1 ? 'one observer' : `${line.quantity} observers`
      items.push(line.unit === null
        ? { text: `Participation fee for ${who} (rate to be confirmed)`, amount: null }
        : { text: `Participation fee for ${who}${each(line)}`, amount: line.amount })
    } else if (line.key === 'singleRooms') {
      items.push({ text: `Single room supplement, ${line.quantity === 1 ? 'one person' : `${line.quantity} people`}${each(line)}`, amount: line.amount })
    }
  }
  return items
}

/**
 * The invoices to print: one with every item, or, when the Team Leader split the fees between payers, one per payer
 * for their amount, numbered IOL2027/23-1, IOL2027/23-2 and so on.
 */
function invoiceParts(delegation, payment, fees) {
  const items = invoiceItems(fees, delegation.country_territory)
  const total = `${price(fees.total, fees.currency)}${fees.observersPending ? ' + observer fees' : ''}`
  const splits = payment?.invoice_splits
  if (!splits?.length) {
    return [{
      number: payment?.invoice_number ?? 'Issued when the invoice details are saved',
      payer: { name: payment?.invoice_recipient_name || delegation.accredited_organisation || delegation.country_territory, tin: payment?.invoice_recipient_tin, address: payment?.invoice_recipient_address },
      items, total,
    }]
  }
  const numberOf = (i) => `${payment.invoice_number}-${i + 1}`
  const inFull = `${items.map((item) => `${item.text}: ${item.amount === null ? 'to be confirmed' : price(item.amount, fees.currency)}`).join('; ')}. Total ${total}.`
  return splits.map((split, i) => ({
    number: numberOf(i),
    payer: { name: split.recipientName, tin: split.recipientTin, address: split.recipientAddress },
    items: [{ text: `Part ${i + 1} of ${splits.length} of the registration fees of ${delegation.country_territory}`, amount: Number(split.amount) }],
    total: price(Number(split.amount), fees.currency),
    note: `The registration fees of ${delegation.country_territory} are split into ${splits.length} invoices: ${splits.map((s, j) => `${numberOf(j)}, ${price(Number(s.amount), fees.currency)} (${s.recipientName})`).join('; ')}. In full: ${inFull}`,
  }))
}

/**
 * @param {object} opts
 * @param {object} opts.delegation  delegations row
 * @param {object|null} opts.payment payments row (latest), or null before the invoice details are saved
 * @param {object} opts.fees        calculateFees() result, at the invoice's own fee tier
 * @param {object} opts.invoice     settings.invoice: the issuer and, once Finance enters it, the bank account
 * @param {number|null} [opts.part] one invoice of a split, from 1; without it, every invoice
 * @returns {Promise<Buffer>} one page per invoice
 */
export function invoicePdf({ delegation, payment, fees, invoice, part = null, issuedOn = payment?.created_at ?? new Date() }) {
  const all = invoiceParts(delegation, payment, fees)
  const parts = part && all.length > 1 ? [all[part - 1]] : all
  const doc = new PDFDocument({
    size: 'LETTER', margins: { top: 40, bottom: 40, left: 42, right: 42 }, autoFirstPage: false,
    info: { Title: `IOL 2027 invoice ${parts.length === 1 && payment?.invoice_number ? parts[0].number : payment?.invoice_number ?? ''}, ${delegation.country_territory}`.replace('  ', ' '), Author: invoice.issuerName },
  })
  doc.registerFont('Regular', asset('fonts/NotoSans-Regular.ttf'))
  doc.registerFont('Bold', asset('fonts/NotoSans-Bold.ttf'))
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  for (const part of parts) {
    doc.addPage()
    drawInvoice(doc, { part, payment, fees, invoice, issuedOn })
  }
  doc.end()
  return done
}

function drawInvoice(doc, { part, payment, fees, invoice, issuedOn }) {
  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right
  doc.fillColor('#000000').strokeColor('#000000').lineWidth(0.6)
  const write = (text, font, size, x, y, options = {}) => {
    doc.font(font).fontSize(size).text(text, x, y, options)
    return doc.y
  }
  /** A bordered table like the template's; each cell is { text, bold?, align? }. Returns the y below it. */
  const grid = (y, widths, rows) => {
    const pad = 3
    for (const row of rows) {
      const height = Math.max(...row.map((cell, i) => doc.font(cell.bold ? 'Bold' : 'Regular').fontSize(10).heightOfString(cell.text, { width: widths[i] - pad * 2 }))) + pad * 2
      let x = left
      row.forEach((cell, i) => {
        doc.rect(x, y, widths[i], height).stroke()
        write(cell.text, cell.bold ? 'Bold' : 'Regular', 10, x + pad, y + pad, { width: widths[i] - pad * 2, align: cell.align ?? 'left' })
        x += widths[i]
      })
      y += height
    }
    return y
  }

  // The event and the title
  let y = write('24th International Linguistics Olympiad', 'Bold', 14, left, 40, { width, align: 'center' }) + 8
  y = write('21–28 July 2027', 'Regular', 10, left, y, { width, align: 'center' }) + 8
  y = write('Bangkok, Thailand', 'Regular', 10, left, y, { width, align: 'center' }) + 12
  y = write('Invoice', 'Bold', 16, left, y, { width, align: 'center' }) + 8

  // Number, method and dates
  const half = [width / 2, width / 2]
  y = grid(y, half, [
    [{ text: `Invoice No.: ${part.number}` }, { text: 'Method of Payment: Bank Transfer' }],
    [{ text: `Issue Date: ${usDate(issuedOn)}` }, { text: `Due Date: ${usDate(`${fees.dueDate}T12:00:00+07:00`)}` }],
  ]) + 26

  // Payer and recipient
  const party = (x, heading, name, tin, address) => {
    const columnWidth = width / 2 - 30
    let py = write(heading, 'Bold', 10, x, y, { width: columnWidth }) + 14
    py = write(name, 'Regular', 10, x, py, { width: columnWidth })
    py = write(`Tax Identification Number (TIN):${tin ? ` ${tin}` : ''}`, 'Regular', 10, x, py, { width: columnWidth }) + 14
    if (address) {
      py = write('Address', 'Regular', 10, x, py, { width: columnWidth }) + 2
      py = write(address, 'Regular', 10, x, py, { width: columnWidth })
    }
    return py
  }
  y = Math.max(
    party(left + 14, 'Payer', part.payer.name, part.payer.tin, part.payer.address),
    party(left + width / 2 + 10, 'Recipient', invoice.issuerName, invoice.issuerTin, invoice.issuerAddress),
  ) + 28

  // Items and total. Wider than the template's half-and-half, so item lines with a quantity fit on one line.
  y = grid(y, [width * 0.64, width * 0.36], [
    [{ text: 'Item', bold: true }, { text: 'Price', bold: true }],
    ...part.items.map((item, i) => [{ text: `${i + 1}. ${item.text}` }, { text: item.amount === null ? 'To be confirmed' : price(item.amount, fees.currency), align: 'right' }]),
    [{ text: 'Total:', bold: true }, { text: part.total, bold: true, align: 'right' }],
  ])
  if (part.note) y = write(part.note, 'Regular', 9, left, y + 6, { width })
  else if ((payment?.invoice_count ?? 1) > 1 && payment.invoice_split_note) {
    // Invoices split before 30 Oct 2026 described the split in words.
    y = write(`Requested as ${payment.invoice_count} invoices: ${payment.invoice_split_note}.`, 'Regular', 9, left, y + 6, { width })
  }
  y += 26

  // Bank transfer details
  y = write('Bank Transfer details', 'Bold', 12, left, y, { width, align: 'center' }) + 10
  const bank = invoice.bank
  if (bank) {
    const rows = [
      ['Beneficiary name', bank.beneficiaryName], ['Beneficiary address', bank.beneficiaryAddress], ['Bank name', bank.bankName],
      ['Bank address', bank.bankAddress], ['ACCOUNT NUMBER', bank.accountNumber], ['SWIFT CODE', bank.swiftCode],
    ]
    for (const [label, value] of rows.filter(([, value]) => value)) {
      doc.font('Bold').fontSize(10).text(`${label}: `, left, y, { width, continued: true })
      doc.font('Regular').text(value)
      y = doc.y + 1
    }
  } else {
    y = write('The bank account details will be added here once the organisers’ Finance team confirms them. They are also shown on the Payment step of the registration portal.', 'Regular', 10, left, y, { width })
  }
  if (payment?.payment_reference) {
    const reference = part.note ? `${payment.payment_reference} and the invoice number ${part.number}` : payment.payment_reference
    write(`Please put the payment reference ${reference} in the transfer description. All bank charges are paid by the sender: choose OUR for bank charges so that the full amount is received.`, 'Regular', 9, left, y + 12, { width })
  }
}
