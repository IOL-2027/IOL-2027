// The printable e-receipt. The invoice itself is a PDF from the API (server/invoice-pdf.js), in Finance's template.
const amount = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 })
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const longDate = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const styles = `
  body{margin:0;padding:40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#160c1b;background:#fff}
  .head{background:#1d0929;color:#f3eee4;padding:28px 32px;border-radius:12px;margin-bottom:28px}
  .head p{margin:0;font-size:12px;color:#eda363;font-weight:700}
  .head h1{margin:6px 0 0;font-size:28px;letter-spacing:-.02em}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-bottom:28px}
  .meta small{display:block;font-size:12px;color:#6b626e;margin-bottom:3px}
  .meta strong{font-size:14px;white-space:pre-line}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;font-variant-numeric:tabular-nums}
  th{text-align:left;font-size:12px;color:#6b626e;padding:8px 10px;border-bottom:2px solid #e0d9cc}
  td{padding:12px 10px;border-bottom:1px solid #e0d9cc;font-size:14px}
  .num{text-align:right}
  tfoot td{font-weight:700;font-size:16px;border-bottom:0}
  .box{background:#f6f3ee;border-radius:10px;padding:18px 22px;margin-bottom:20px;font-size:14px;line-height:1.6}
  .box h2{margin:0 0 8px;font-size:14px}
  .box p{margin:4px 0}
  .paid{display:inline-block;padding:4px 12px;border-radius:99px;background:#e3eee5;color:#2c6338;font-weight:700;font-size:13px}
  .foot{margin-top:36px;font-size:12px;color:#6b626e;line-height:1.7}
  @media print{body{padding:24px}}`

/** Opens a printable document in a new tab and starts the print dialog, so it can be saved as PDF. */
function openPrintable(title: string, body: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${styles}</style></head><body>${body}
  <script>window.onload=()=>window.print()<\/script></body></html>`)
  win.document.close()
}

type ReceiptInput = {
  organisation: string; country: string; recipientAddress?: string | null; reference: string; receiptNumber: string
  amountPaid: number; currency: string; tierLabel: string; approvedAt: string | null
}

/** The e-receipt, available once Finance approves the payment. */
export function openReceipt({ organisation, country, recipientAddress, reference, receiptNumber, amountPaid, currency, tierLabel, approvedAt }: ReceiptInput) {
  openPrintable(`IOL 2027 receipt ${receiptNumber}`, `
    <div class="head"><p>IOL 2027 · Bangkok, Thailand</p><h1>Payment receipt</h1></div>
    <p><span class="paid">Paid</span></p>
    <div class="meta">
      <div><small>Received from</small><strong>${escape(organisation)}${recipientAddress ? `\n${escape(recipientAddress)}` : ''}</strong></div>
      <div><small>Receipt number</small><strong>${escape(receiptNumber)}</strong></div>
      <div><small>Country or territory</small><strong>${escape(country)}</strong></div>
      <div><small>Payment confirmed</small><strong>${approvedAt ? longDate(new Date(approvedAt)) : '—'}</strong></div>
      <div><small>Payment reference</small><strong>${escape(reference)}</strong></div>
      <div><small>Fee tier</small><strong>${escape(tierLabel)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Amount (${escape(currency)})</th></tr></thead>
      <tbody><tr><td>IOL 2027 registration fees for ${escape(country)}: team registration and accommodation</td><td class="num">${amount(amountPaid)}</td></tr></tbody>
      <tfoot><tr><td>Total received</td><td class="num">${escape(currency)} ${amount(amountPaid)}</td></tr></tfoot>
    </table>
    <div class="box"><p>Received by bank transfer to สอวน. (POSN) and checked by the IOL 2027 Finance team against the bank statement.</p></div>
    <div class="foot">IOL 2027 Local Organising Committee · iol2027.th@gmail.com<br>This receipt confirms payment of the registration fees. It is not a tax invoice. The final receipt format is awaiting Finance approval.</div>`)
}
