import { useState } from 'react'
import { Check, Download, Eye, EyeOff, FileText, RotateCcw } from 'lucide-react'
import { api } from '../api'
import { openReceipt } from '../invoice'
import { Done, FilterField, Note, Panel, Problem, day, errorText, human, useLoad, when } from './common'

type PaymentRow = {
  id: string; delegationId: string; countryTerritory: string; primaryTeamLeaderName: string; teamLeaderEmail: string
  numberOfTeams: number; numberOfObservers: number; paymentReference: string; amountDue: string; currency: string; feeTier: string
  status: string; invoiceRecipientName: string | null; invoiceRecipientAddress: string | null; invoiceCount: number; invoiceSplitNote: string | null
  invoiceNumber: string | null; invoiceRecipientTin: string | null
  proofAttachmentId: string | null; proofFilename: string | null; proofMimeType: string | null
  reviewNote: string | null; reviewedByName: string | null; reviewedAt: string | null; receiptNumber: string | null; updatedAt: string
}

const filters: [string, string][] = [['awaiting_review', 'Waiting for review'], ['awaiting_proof', 'Waiting for proof'], ['approved', 'Approved'], ['rejected', 'Returned'], ['', 'All']]

function Preview({ payment }: { payment: PaymentRow }) {
  const src = `/api/registration/attachments/${payment.proofAttachmentId}?inline=1`
  return (
    <div className="reg-proof-preview">
      {payment.proofMimeType === 'application/pdf'
        ? <iframe src={src} title={`Proof of transfer from ${payment.countryTerritory}`} />
        : <img src={src} alt={`Proof of transfer from ${payment.countryTerritory}`} />}
    </div>
  )
}

export default function Payments({ canReview }: { canReview: boolean }) {
  const [filter, setFilter] = useState('awaiting_review')
  const [search, setSearch] = useState('')
  const { data, error, reload } = useLoad<{ payments: PaymentRow[] }>(`/api/admin/payments${filter ? `?status=${filter}` : ''}`)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (payment: PaymentRow, action: 'approve' | 'reject') => {
    setActionError(''); setDone('')
    if (action === 'reject' && !notes[payment.id]?.trim()) {
      setNoteErrors((n) => ({ ...n, [payment.id]: 'Write the reason the Team Leader will see.' }))
      document.getElementById(`note-${payment.id}`)?.focus()
      return
    }
    setBusy(payment.id)
    try {
      await api(`/api/admin/payments/${payment.id}/${action}`, { method: 'POST', body: { note: notes[payment.id] ?? '' } })
      setDone(`${payment.countryTerritory}: ${action === 'approve' ? 'payment approved and receipt issued' : 'proof returned to the Team Leader'}.`)
      setNoteErrors((n) => ({ ...n, [payment.id]: '' }))
      reload()
    } catch (e) {
      setActionError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const term = search.trim().toLowerCase()
  const rows = (data?.payments ?? []).filter((p) => !term || [p.countryTerritory, p.paymentReference, p.invoiceNumber ?? '', p.invoiceRecipientName ?? '', p.receiptNumber ?? ''].some((v) => v.toLowerCase().includes(term)))

  return (
    <Panel id="payments" title="Payments" intro={canReview ? 'Check each proof against the สอวน bank statement, then approve it or return it with a reason. Approving issues a numbered e-receipt.' : 'Read-only. Approving payments is a Finance task.'}>
      <div className="reg-filter-bar">
        <div className="reg-filter" role="group" aria-label="Show payments">
          {filters.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : undefined} onClick={() => { setFilter(value); setPreviewing(null) }}>{label}</button>
          ))}
        </div>
        <FilterField id="pay-search" label="Search">
          <input id="pay-search" className="reg-control reg-control-compact" type="search" placeholder="Country, reference, invoice or receipt" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FilterField>
      </div>
      <Problem message={error || actionError} />
      <Done message={done} />
      {data && (rows.length === 0 ? <Note>Nothing here right now.</Note> : (
        <ul className="reg-pay-list">{rows.map((p) => (
          <li key={p.id}>
            <div className="reg-pay-main">
              <strong>{p.countryTerritory}</strong>
              <span className="reg-pay-amount">{p.currency} {Number(p.amountDue).toLocaleString('en-US')} · {p.feeTier === 'early_bird' ? 'Early bird' : 'Normal'}</span>
              <span>Reference <span className="reg-code">{p.paymentReference}</span>{p.receiptNumber && <> · Receipt {p.receiptNumber}</>}</span>
              <span>{human(p.status)}{p.reviewedByName ? ` by ${p.reviewedByName}` : ''} · {when(p.reviewedAt ?? p.updatedAt)}</span>
            </div>
            <dl className="reg-pay-details">
              <div><dt>Team Leader</dt><dd>{p.primaryTeamLeaderName}<small>{p.teamLeaderEmail}</small></dd></div>
              <div><dt>Invoice to</dt><dd>{p.invoiceRecipientName ?? '—'}{p.invoiceRecipientTin && <small>TIN {p.invoiceRecipientTin}</small>}{p.invoiceRecipientAddress && <small>{p.invoiceRecipientAddress}</small>}</dd></div>
              <div><dt>Invoices</dt><dd>{p.invoiceCount}{p.invoiceSplitNote && <small>{p.invoiceSplitNote}</small>}</dd></div>
              <div><dt>Declared</dt><dd>{p.numberOfTeams} {p.numberOfTeams === 1 ? 'team' : 'teams'}, {p.numberOfObservers} {p.numberOfObservers === 1 ? 'observer' : 'observers'}</dd></div>
            </dl>
            {p.reviewNote && <p className="reg-pay-note"><strong>Note to the Team Leader:</strong> {p.reviewNote}</p>}
            <div className="reg-pay-files">
              <a className="reg-btn-link" href={`/api/registration/delegations/${p.delegationId}/invoice`} target="_blank" rel="noreferrer"><FileText size={16} aria-hidden="true" />Invoice {p.invoiceNumber ?? ''}</a>
              {p.proofAttachmentId && <>
                <button type="button" className="reg-btn-link" aria-expanded={previewing === p.id} onClick={() => setPreviewing(previewing === p.id ? null : p.id)}>
                  {previewing === p.id ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{previewing === p.id ? 'Hide proof' : 'Preview proof'}
                </button>
                <a className="reg-btn-link" href={`/api/registration/attachments/${p.proofAttachmentId}`}><Download size={16} aria-hidden="true" />{p.proofFilename ?? 'Download proof'}</a>
              </>}
              {p.status === 'approved' && p.receiptNumber && (
                <button type="button" className="reg-btn-link" onClick={() => openReceipt({
                  organisation: p.invoiceRecipientName ?? p.countryTerritory, country: p.countryTerritory, recipientAddress: p.invoiceRecipientAddress,
                  reference: p.paymentReference, receiptNumber: p.receiptNumber!, amountPaid: Number(p.amountDue), currency: p.currency,
                  tierLabel: p.feeTier === 'early_bird' ? 'Early bird' : 'Normal', approvedAt: p.reviewedAt,
                })}><FileText size={16} aria-hidden="true" />Receipt {p.receiptNumber}</button>
              )}
              {!p.proofAttachmentId && <span className="reg-muted">No proof uploaded yet{p.status === 'awaiting_proof' ? ` · invoice saved ${day(p.updatedAt)}` : ''}</span>}
            </div>
            {previewing === p.id && <Preview payment={p} />}
            {canReview && p.status === 'awaiting_review' && (
              <div className="reg-pay-actions">
                <div className={`reg-field reg-pay-reason${noteErrors[p.id] ? ' has-error' : ''}`}>
                  <label htmlFor={`note-${p.id}`}>Reason, if you return it</label>
                  {noteErrors[p.id] && <p className="reg-error" id={`note-${p.id}-error`}>{noteErrors[p.id]}</p>}
                  <input id={`note-${p.id}`} className="reg-control reg-control-compact" value={notes[p.id] ?? ''} aria-invalid={noteErrors[p.id] ? true : undefined}
                    aria-describedby={noteErrors[p.id] ? `note-${p.id}-error` : undefined} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} />
                </div>
                <button type="button" className="reg-btn reg-btn-primary" disabled={busy === p.id} onClick={() => act(p, 'approve')}><Check size={16} aria-hidden="true" />Approve</button>
                <button type="button" className="reg-btn reg-btn-secondary" disabled={busy === p.id} onClick={() => act(p, 'reject')}><RotateCcw size={16} aria-hidden="true" />Return</button>
              </div>
            )}
          </li>
        ))}</ul>
      ))}
    </Panel>
  )
}
