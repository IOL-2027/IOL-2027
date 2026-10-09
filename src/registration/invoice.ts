import { delegation, feeLines, feeTotal, fees } from './portalData'

const amount = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 })

/** Opens a printable invoice in a new tab. Amounts come from the fee data, not typed strings. */
export function openInvoice() {
  const win = window.open('', '_blank')
  if (!win) return
  const rows = feeLines.map((line) => `<tr><td>${line.label}</td><td>${line.detail}</td><td class="num">${line.amount === null ? 'To be confirmed' : amount(line.amount)}</td></tr>`).join('')
  const observersPending = feeLines.some((line) => line.amount === null && fees.observers > 0)
  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>IOL 2027 invoice, ${delegation.country}</title><style>
    body{margin:0;padding:40px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#160c1b;background:#fff}
    .head{background:#1d0929;color:#f3eee4;padding:28px 32px;border-radius:12px;margin-bottom:28px}
    .head p{margin:0;font-size:12px;color:#eda363;font-weight:700}
    .head h1{margin:6px 0 0;font-size:28px;letter-spacing:-.02em}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-bottom:28px}
    .meta small{display:block;font-size:12px;color:#6b626e;margin-bottom:3px}
    .meta strong{font-size:14px}
    table{width:100%;border-collapse:collapse;margin-bottom:24px;font-variant-numeric:tabular-nums}
    th{text-align:left;font-size:12px;color:#6b626e;padding:8px 10px;border-bottom:2px solid #e0d9cc}
    td{padding:12px 10px;border-bottom:1px solid #e0d9cc;font-size:14px}
    .num{text-align:right}
    tfoot td{font-weight:700;font-size:16px;border-bottom:0}
    .box{background:#f6f3ee;border-radius:10px;padding:18px 22px;margin-bottom:20px;font-size:14px;line-height:1.6}
    .box h2{margin:0 0 8px;font-size:14px}
    .box p{margin:4px 0}
    .foot{margin-top:36px;font-size:12px;color:#6b626e;line-height:1.7}
    @media print{body{padding:24px}}
  </style></head><body>
    <div class="head"><p>IOL 2027 · Bangkok, Thailand</p><h1>Registration invoice</h1></div>
    <div class="meta">
      <div><small>Bill to</small><strong>${delegation.organisation}</strong></div>
      <div><small>Payment reference</small><strong>${fees.reference}</strong></div>
      <div><small>Invoice date</small><strong>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
      <div><small>Fee tier</small><strong>${fees.tier}</strong></div>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Calculation</th><th class="num">Amount (${fees.currency})</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total to transfer</td><td class="num">${fees.currency} ${amount(feeTotal)}${observersPending ? ' + observer fees' : ''}</td></tr></tfoot>
    </table>
    <div class="box"><h2>How to pay</h2>
      <p>Transfer the full amount to มูลนิธิส่งเสริมโอลิมปิกวิชาการและพัฒนามาตรฐานวิทยาศาสตร์ศึกษา ในพระอุปถัมภ์สมเด็จพระเจ้าพี่นางเธอ เจ้าฟ้ากัลยาณิวัฒนา กรมหลวงนราธิวาสราชนครินทร์ (สอวน., POSN) at Siam Commercial Bank (SCB).</p>
      <p>Choose <strong>OUR</strong> for bank charges so the organisers receive the full amount. Put <strong>${fees.reference}</strong> in the transfer description.</p>
      <p>Account name, number and SWIFT code are shown in the registration system once Finance approves them.</p>
    </div>
    <div class="foot">IOL 2027 Local Organising Committee · iol2027.th@gmail.com<br>This invoice is not a tax receipt. An e-receipt is emailed after Finance confirms the transfer.</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`)
  win.document.close()
}
