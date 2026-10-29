// Two forms of the Team Leader portal whose fields depend on each other as they are filled in: Team and observers
// (teams, observers and who needs a single room, which set the fees) and the invoice details on Payment (one
// invoice, or several with a payer and an amount each that must add up to the total).
import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CircleAlert, Info } from 'lucide-react'
import type { DelegationData, Payment } from './api'
import { selectOptions } from './portalData'
import { Alert, Facts, FieldControl, slug } from './ui'

export const MAX_INVOICES = 5
const singleAnswers = selectOptions['Single room']
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const cents = (n: number) => Math.round(n * 100)

/** A select whose value the form reacts to (FieldControl's are read only when the form is sent). */
function LiveSelect({ id, label, value, options, help, error, onChange, disabled }: { id: string; label: string; value: string; options: string[]; help?: string; error?: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className={`reg-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {help && <p className="reg-hint" id={`${id}-hint`}>{help}</p>}
      {error && <p className="reg-error" id={`${id}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      <select id={id} name={label} className="reg-control" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        aria-describedby={[help && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : undefined}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}

export type SetupBody = { numberOfTeams: number; numberOfObservers: number; contestantRoomType: string | null; singleRooms: { teamLeaders: boolean[]; observers: boolean[] } }

/** Team and observers: how many teams and observers, and which Team Leaders and observers want a single room. */
export function TeamSetup({ data, paymentDone, busy, error, onSave }: { data: DelegationData; paymentDone: boolean; busy: boolean; error: ReactNode; onSave: (body: SetupBody) => void }) {
  const d = data.delegation
  const rules = data.feeRules
  const oneTeamOnly = d.feeCategory === 'non_accredited'
  const [teams, setTeams] = useState(oneTeamOnly ? 1 : d.numberOfTeams)
  const most = rules.maxObserversPerTeam * teams
  const [observers, setObservers] = useState(Math.min(d.numberOfObservers, most))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const shownObservers = Math.min(observers, most)
  const leaderLabel = (i: number) => `Team Leader, ${data.teams[i]?.name ?? (i === 0 ? 'first team' : 'second team')}${i === 0 ? ' (you)' : ''}`
  const observerLabel = (i: number) => `Observer ${i + 1}`
  const answer = (yes: boolean | undefined) => (yes === undefined ? '' : yes ? singleAnswers[1] : singleAnswers[0])
  const singleFee = usd(rules.singleRoomFee)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (label: string) => String(form.get(label) ?? '')
    const missing: Record<string, string> = {}
    const pick = (labels: string[]) => labels.map((label) => {
      const value = read(label)
      if (!value) missing[label] = 'Choose yes or no.'
      return value.startsWith('Yes')
    })
    const singleRooms = { teamLeaders: pick(range(teams).map(leaderLabel)), observers: pick(range(shownObservers).map(observerLabel)) }
    setErrors(missing)
    if (Object.keys(missing).length) { document.getElementById(`setup-${slug(Object.keys(missing)[0])}`)?.focus(); return }
    onSave({ numberOfTeams: teams, numberOfObservers: shownObservers, contestantRoomType: read('Room type preference') || null, singleRooms })
  }

  return (
    <form onSubmit={submit} noValidate>
      <Facts items={[
        { label: 'Team Leader', value: `${d.primaryTeamLeaderName} · ${d.teamLeaderEmail}`, help: 'From your verified account.' },
        { label: 'Country', value: `${d.countryTerritory} · set by your invitation code` },
        { label: 'Fee rate', value: data.fees.categoryLabel, help: d.feeCategory === 'previous_host' ? 'Countries that have hosted the IOL get 10% off the team fees.' : 'Set by your invitation code. Ask the organisers if it looks wrong.' },
      ]} />
      <div className="reg-grid">
        <LiveSelect id="setup-number-of-teams" label="Number of teams" value={String(teams)} options={oneTeamOnly ? ['1'] : ['1', '2']} onChange={(v) => setTeams(Number(v))}
          help={oneTeamOnly ? 'A country or territory that is not accredited registers one team.' : 'Each team is four contestants and their Team Leader. A second team costs more than the first.'} />
        <LiveSelect id="setup-number-of-observers" label="Number of observers" value={String(shownObservers)} options={range(most + 1).map(String)} onChange={(v) => setObservers(Number(v))}
          help={`Optional. Up to ${rules.maxObserversPerTeam} per team${rules.observerFee === null ? '' : `, ${usd(rules.observerFee)} each`}: a second Team Leader, a parent, someone from your olympiad.`} />
        <FieldControl idPrefix="setup" field={{ label: 'Room type preference', value: d.contestantRoomType ?? '', kind: 'select', optional: true, help: 'For the contestants, who share twin rooms. If someone needs a different arrangement, say so in Rooms and welfare.' }} />
      </div>
      <fieldset className="reg-fieldset">
        <legend>Single rooms</legend>
        <p className="reg-hint">Team Leaders and observers share twin rooms unless they ask for a single room, which adds {singleFee} per person. You name the observers later, in People.</p>
        <div className="reg-grid">
          {range(teams).map((i) => <FieldControl key={leaderLabel(i)} idPrefix="setup" error={errors[leaderLabel(i)]} field={{ label: leaderLabel(i), value: answer(d.singleRooms.teamLeaders[i]), kind: 'select', options: singleAnswers }} />)}
          {range(shownObservers).map((i) => <FieldControl key={observerLabel(i)} idPrefix="setup" error={errors[observerLabel(i)]} field={{ label: observerLabel(i), value: answer(d.singleRooms.observers[i]), kind: 'select', options: singleAnswers }} />)}
        </div>
      </fieldset>
      {paymentDone && <p className="reg-aside"><Info size={18} aria-hidden="true" />You have already paid. Changing these may change your fees; Finance will contact you if it does.</p>}
      <div className="reg-panel-actions">
        <Alert>{error}</Alert>
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>Save and continue <ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </form>
  )
}

export type InvoiceBody = { recipientName: string; recipientAddress: string; recipientTin: string; invoices?: { recipientName: string; recipientAddress: string; recipientTin: string; amount: number }[] }

/** Reads the invoice details back from the Payment form: one invoice, or several with their amounts. */
export function readInvoices(form: FormData): InvoiceBody {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const count = Number(form.get('Number of invoices') || 1)
  if (count <= 1) return { recipientName: text('Invoice recipient name'), recipientAddress: text('Invoice recipient address'), recipientTin: text('Tax identification number (TIN)') }
  const invoices = range(count).map((i) => ({
    recipientName: text(`invoice-${i}-name`), recipientAddress: text(`invoice-${i}-address`), recipientTin: text(`invoice-${i}-tin`), amount: Number(text(`invoice-${i}-amount`) || 0),
  }))
  return { ...invoices[0], invoices }
}

/** What is wrong with a split before it is sent, keyed like the fields; empty when it can be saved. */
export function invoiceProblems(body: InvoiceBody, total: number): Record<string, string> {
  if (!body.invoices) return body.recipientName ? {} : { 'Invoice recipient name': 'Enter the organisation named on the invoice.' }
  const problems: Record<string, string> = {}
  body.invoices.forEach((invoice, i) => {
    if (!invoice.recipientName) problems[`invoice-${i}-name`] = 'Enter who this invoice is for.'
    if (!(invoice.amount > 0) || Math.abs(invoice.amount * 100 - cents(invoice.amount)) > 1e-6) problems[`invoice-${i}-amount`] = 'Enter an amount in US dollars, such as 1200 or 1200.50.'
  })
  const sum = body.invoices.reduce((s, invoice) => s + cents(invoice.amount || 0), 0)
  if (!Object.keys(problems).length && sum !== cents(total)) problems['invoice-split'] = `The amounts add up to ${usd(sum / 100)}, not ${usd(total)}.`
  return problems
}

/** Splits the total into equal parts in whole dollars, the remainder on the first invoice. */
const evenSplit = (total: number, count: number) => {
  const each = Math.floor(total / count)
  return range(count).map((i) => String(i === 0 ? Math.round((total - each * (count - 1)) * 100) / 100 : each))
}

/** The invoice details on Payment. With more than one invoice, each gets a payer and an amount, and a running total. */
export function InvoiceDetails({ data, payment, disabled, errors }: { data: DelegationData; payment: Payment | undefined; disabled: boolean; errors: Record<string, string> }) {
  const total = data.fees.total
  const saved = payment?.invoiceSplits ?? null
  const [count, setCount] = useState(payment?.invoiceCount && payment.invoiceCount > 1 && saved ? saved.length : 1)
  const [amounts, setAmounts] = useState<string[]>(saved ? saved.map((s) => String(s.amount)) : [])
  const shown = range(count).map((i) => amounts[i] ?? '')
  const assigned = shown.reduce((s, a) => s + cents(Number(a) || 0), 0) / 100
  const left = Math.round((total - assigned) * 100) / 100
  const changeCount = (value: string) => {
    const next = Number(value)
    setCount(next)
    // A fresh split starts evenly; one already under way keeps its amounts.
    if (next > 1 && range(next).every((i) => !amounts[i])) setAmounts(evenSplit(total, next))
  }
  const field = (i: number, key: 'name' | 'tin' | 'address' | 'amount', label: string, value: string, extra: { optional?: boolean; help?: string; type?: string; area?: boolean } = {}) => {
    const name = `invoice-${i}-${key}`
    const error = errors[name]
    const describedBy = [extra.help && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ') || undefined
    const common = { id: name, name, className: 'reg-control', disabled, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }
    return (
      <div className={`reg-field${extra.area ? ' reg-field-wide' : ''}${error ? ' has-error' : ''}`}>
        <label htmlFor={name}>{label}{extra.optional && <span className="reg-optional"> (optional)</span>}</label>
        {extra.help && <p className="reg-hint" id={`${name}-hint`}>{extra.help}</p>}
        {error && <p className="reg-error" id={`${name}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
        {key === 'amount'
          ? <input {...common} type="number" min="0" step="0.01" inputMode="decimal" value={shown[i]} onChange={(e) => setAmounts((list) => range(Math.max(list.length, count)).map((j) => (j === i ? e.target.value : list[j] ?? '')))} />
          : extra.area ? <textarea {...common} rows={2} defaultValue={value} /> : <input {...common} defaultValue={value} />}
      </div>
    )
  }
  const recipient = payment?.invoiceRecipientName ?? data.delegation.accreditedOrganisation ?? ''
  return (
    <fieldset className="reg-fieldset">
      <legend>Invoice details</legend>
      {disabled && <p className="reg-hint">Locked while Finance reviews your payment. Contact the organisers to change them.</p>}
      <div className="reg-grid">
        <LiveSelect id="payment-number-of-invoices" label="Number of invoices" value={String(count)} options={range(MAX_INVOICES).map((i) => String(i + 1))} onChange={changeCount} disabled={disabled}
          help="More than one if several organisations pay part of the fees. Each invoice gets its own payer and amount; together they make the total. Invoices cannot be split after the transfer." />
      </div>
      {count === 1 ? (
        <div className="reg-grid">
          <FieldControl idPrefix="payment" disabled={disabled} error={errors['Invoice recipient name']} field={{ label: 'Invoice recipient name', value: recipient, help: 'The organisation named on the invoice.' }} />
          <FieldControl idPrefix="payment" disabled={disabled} field={{ label: 'Tax identification number (TIN)', value: payment?.invoiceRecipientTin ?? '', optional: true, help: 'Only if your institution needs it on the invoice.' }} />
          <FieldControl idPrefix="payment" disabled={disabled} field={{ label: 'Invoice recipient address', value: payment?.invoiceRecipientAddress ?? '', kind: 'textarea', optional: true, help: 'Only if your institution needs a postal address on the invoice.' }} />
        </div>
      ) : <>
        {range(count).map((i) => (
          <div className="reg-invoice-part" key={i}>
            <h5>Invoice {i + 1} of {count}</h5>
            <div className="reg-grid">
              {field(i, 'name', 'Invoice recipient name', saved?.[i]?.recipientName ?? (i === 0 ? recipient : ''), { help: 'The organisation that pays this part.' })}
              {field(i, 'amount', 'Amount (USD)', '')}
              {field(i, 'tin', 'Tax identification number (TIN)', saved?.[i]?.recipientTin ?? (i === 0 ? payment?.invoiceRecipientTin ?? '' : ''), { optional: true })}
              {field(i, 'address', 'Invoice recipient address', saved?.[i]?.recipientAddress ?? (i === 0 ? payment?.invoiceRecipientAddress ?? '' : ''), { optional: true, area: true })}
            </div>
          </div>
        ))}
        <p className={`reg-invoice-sum${left === 0 ? ' is-even' : ''}${errors['invoice-split'] ? ' has-error' : ''}`} role="status" id="invoice-split">
          {left === 0 ? <>The {count} invoices add up to the total, {usd(total)}.</>
            : left > 0 ? <>{usd(assigned)} of {usd(total)} assigned. <strong>{usd(left)} still to assign.</strong></>
            : <>{usd(assigned)} assigned. <strong>That is {usd(-left)} more than the total of {usd(total)}.</strong></>}
        </p>
      </>}
    </fieldset>
  )
}
