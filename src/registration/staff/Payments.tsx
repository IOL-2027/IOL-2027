import { useState } from 'react'
import { Check, Download, Eye, EyeOff, FileText, RotateCcw } from 'lucide-react'
import { api, feeCategoryLabel, type FeeCategory } from '../api'
import { openReceipt } from '../invoice'
import { Done, FilterField, Note, Panel, Problem, day, errorText, human, useLoad, when } from './common'

type PaymentRow = {
  id: string; delegationId: string; countryTerritory: string; nationalRepresentativeName: string; teamLeaderEmail: string
  numberOfTeams: number; numberOfObservers: number; paymentReference: string; amountDue: string; currency: string; feeTier: string
  status: string; invoiceRecipientName: string | null; invoiceRecipientAddress: string | null; invoiceCount: number; invoiceSplitNote: string | null
  invoiceSplits: { recipientName: string; amount: number }[] | null; feeCategory: string; singleRooms: { teamLeaders: boolean[]; observers: boolean[] } | null
  invoiceNumber: string | null; invoiceRecipientTin: string | null
  proofAttachmentId: string | null; proofFilename: string | null; proofMimeType: string | null
  /** Every file of the proof, oldest first. */
  proofFiles?: ProofFile[]
  reviewNote: string | null; reviewedByName: string | null; reviewedAt: string | null; receiptNumber: string | null; updatedAt: string
}

type ProofFile = { id: string; filename: string; mimeType: string; createdAt: string }

/** The proof's files; a payment from before proofs could be several files has just the one. */
const proofFilesOf = (p: PaymentRow): ProofFile[] => p.proofFiles?.length ? p.proofFiles
  : p.proofAttachmentId ? [{ id: p.proofAttachmentId, filename: p.proofFilename ?? 'Proof', mimeType: p.proofMimeType ?? '', createdAt: p.updatedAt }] : []

const filters: [string, string][] = [['awaiting_review', 'Waiting for review'], ['awaiting_proof', 'Waiting for proof'], ['approved', 'Approved'], ['rejected', 'Returned'], ['', 'All']]

function Preview({ payment, file }: { payment: PaymentRow; file: ProofFile }) {
  const src = `/api/registration/attachments/${file.id}?inline=1`
  const title = `${file.filename}, proof of transfer from ${payment.countryTerritory}`
  // Browsers cannot show HEIC photos: download those instead.
  if (/hei[cf]/.test(file.mimeType)) return <p className="reg-muted">This browser cannot preview a HEIC photo. Download it to open it.</p>
  return (
    <div className="reg-proof-preview">
      {file.mimeType === 'application/pdf' ? <iframe src={src} title={title} /> : <img src={src} alt={title} />}
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
      setNoteErrors((n) => ({ ...n, [payment.id]: 'Write the reason the national representative will see.' }))
      document.getElementById(`note-${payment.id}`)?.focus()
      return
    }
    setBusy(payment.id)
    try {
      await api(`/api/admin/payments/${payment.id}/${action}`, { method: 'POST', body: { note: notes[payment.id] ?? '' } })
      setDone(`${payment.countryTerritory}: ${action === 'approve' ? 'payment approved and receipt issued' : 'proof returned to the national representative'}.`)
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
              <span className="reg-pay-amount">{p.currency} {Number(p.amountDue).toLocaleString('en-US')} · {p.feeTier === 'early_bird' ? 'Early bird' : 'Regular'} · {feeCategoryLabel[p.feeCategory as FeeCategory] ?? p.feeCategory}</span>
              <span>Reference <span className="reg-code">{p.paymentReference}</span>{p.receiptNumber && <> · Receipt {p.receiptNumber}</>}</span>
              <span>{human(p.status)}{p.reviewedByName ? ` by ${p.reviewedByName}` : ''} · {when(p.reviewedAt ?? p.updatedAt)}</span>
            </div>
            <dl className="reg-pay-details">
              <div><dt>National representative</dt><dd>{p.nationalRepresentativeName}<small>{p.teamLeaderEmail}</small></dd></div>
              <div><dt>Invoice to</dt><dd>{p.invoiceRecipientName ?? '—'}{p.invoiceRecipientTin && <small>TIN {p.invoiceRecipientTin}</small>}{p.invoiceRecipientAddress && <small>{p.invoiceRecipientAddress}</small>}</dd></div>
              <div><dt>Invoices</dt><dd>{p.invoiceCount}{p.invoiceSplits
                ? p.invoiceSplits.map((s, i) => <small key={i}>{p.invoiceNumber}-{i + 1}: {s.recipientName}, {p.currency} {Number(s.amount).toLocaleString('en-US')}</small>)
                : p.invoiceSplitNote && <small>{p.invoiceSplitNote}</small>}</dd></div>
              <div><dt>Declared</dt><dd>{p.numberOfTeams} {p.numberOfTeams === 1 ? 'team' : 'teams'}, {p.numberOfObservers} {p.numberOfObservers === 1 ? 'observer' : 'observers'}{(() => {
                const singles = [...(p.singleRooms?.teamLeaders ?? []), ...(p.singleRooms?.observers ?? [])].filter(Boolean).length
                return singles ? `, ${singles} single ${singles === 1 ? 'room' : 'rooms'}` : ''
              })()}</dd></div>
            </dl>
            {p.reviewNote && <p className="reg-pay-note"><strong>Note to the national representative:</strong> {p.reviewNote}</p>}
            <div className="reg-pay-files">
              {/* A split invoice is one PDF per payer. */}
              {p.invoiceSplits?.length
                ? p.invoiceSplits.map((_, i) => <a key={i} className="reg-btn-link" href={`/api/registration/delegations/${p.delegationId}/invoice?part=${i + 1}`} target="_blank" rel="noreferrer"><FileText size={16} aria-hidden="true" />Invoice {p.invoiceNumber}-{i + 1}</a>)
                : <a className="reg-btn-link" href={`/api/registration/delegations/${p.delegationId}/invoice`} target="_blank" rel="noreferrer"><FileText size={16} aria-hidden="true" />Invoice {p.invoiceNumber ?? ''}</a>}

              {p.status === 'approved' && p.receiptNumber && (
                <button type="button" className="reg-btn-link" onClick={() => openReceipt({
                  organisation: p.invoiceRecipientName ?? p.countryTerritory, country: p.countryTerritory, recipientAddress: p.invoiceRecipientAddress,
                  reference: p.paymentReference, receiptNumber: p.receiptNumber!, amountPaid: Number(p.amountDue), currency: p.currency,
                  tierLabel: p.feeTier === 'early_bird' ? 'Early bird' : 'Normal', approvedAt: p.reviewedAt,
                })}><FileText size={16} aria-hidden="true" />Receipt {p.receiptNumber}</button>
              )}
              {!proofFilesOf(p).length && <span className="reg-muted">No proof uploaded yet{p.status === 'awaiting_proof' ? ` · invoice saved ${day(p.updatedAt)}` : ''}</span>}
            </div>
            {proofFilesOf(p).length > 0 && (
              <div className="reg-pay-proof">
                <strong>{proofFilesOf(p).length === 1 ? 'Proof of transfer' : `Proof of transfer: ${proofFilesOf(p).length} files`}</strong>
                <ul>{proofFilesOf(p).map((file) => (
                  <li key={file.id}>
                    <span>{file.filename}<small>{day(file.createdAt)}</small></span>
                    <button type="button" className="reg-btn-link" aria-expanded={previewing === file.id} onClick={() => setPreviewing(previewing === file.id ? null : file.id)}>
                      {previewing === file.id ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{previewing === file.id ? 'Hide' : 'Preview'}<span className="reg-visually-hidden"> {file.filename}</span>
                    </button>
                    <a className="reg-btn-link" href={`/api/registration/attachments/${file.id}`}><Download size={16} aria-hidden="true" />Download<span className="reg-visually-hidden"> {file.filename}</span></a>
                    {previewing === file.id && <Preview payment={p} file={file} />}
                  </li>
                ))}</ul>
              </div>
            )}
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
