// Two forms of the Team Leader portal whose fields depend on each other as they are filled in: Team and observers
// (teams, observers and who needs a single room, which set the fees) and the invoice details on Payment (one
// invoice, or several with a payer and an amount each that must add up to the total).
import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CircleAlert, Info } from 'lucide-react'
import type { DelegationData, Payment } from './api'
import { selectOptions } from './portalData'
import { Alert, Card, Chip, Facts, FieldControl, slug } from './ui'

export const MAX_INVOICES = 5
const singleAnswers = selectOptions['Single room']
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
export const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const cents = (n: number) => Math.round(n * 100)

/** A select whose value the form reacts to (FieldControl's are read only when the form is sent). */
function LiveSelect({ id, label, value, options, help, error, onChange, disabled, placeholder }: {
  id: string; label: string; value: string; options: string[]; help?: string; error?: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string
}) {
  return (
    <div className={`reg-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {help && <p className="reg-hint" id={`${id}-hint`}>{help}</p>}
      {error && <p className="reg-error" id={`${id}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      <select id={id} name={label} className="reg-control" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        aria-describedby={[help && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : undefined}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}

export type FeeLine = { key: string; label: string; detail: string; amount: number | null }

/** Fee lines and their total, on Team and observers (as they are chosen) and on Payment (as invoiced). */
export function FeeTable({ lines, total, pending }: { lines: FeeLine[]; total: number; pending?: boolean }) {
  return (
    <table className="reg-fee-table">
      <tbody>
        {lines.map((line) => (
          <tr key={line.key}><th scope="row">{line.label}<small>{line.detail}</small></th><td>{line.amount === null ? 'Rate to be confirmed' : usd(line.amount)}</td></tr>
        ))}
      </tbody>
      <tfoot><tr><th scope="row">Total</th><td>{usd(total)}{pending ? ' + observer fees' : ''}</td></tr></tfoot>
    </table>
  )
}

/** Shown beside a Save button while its form has changes that are not saved yet. */
export function UnsavedNote({ show }: { show: boolean }) {
  return show ? <span className="reg-unsaved"><span aria-hidden="true" />Unsaved changes</span> : null
}

export type SetupBody = { numberOfTeams: number; numberOfObservers: number; singleRooms: { teamLeaders: boolean[]; observers: boolean[] } }

/** Team and observers: how many teams and observers, who wants a single room, and what that costs. */
export function TeamSetup({ data, paymentDone, busy, error, dirty, onSave }: { data: DelegationData; paymentDone: boolean; busy: boolean; error: ReactNode; dirty: boolean; onSave: (body: SetupBody) => void }) {
  const d = data.delegation
  const rules = data.feeRules
  const oneTeamOnly = d.feeCategory === 'non_accredited'
  const [teams, setTeams] = useState(oneTeamOnly ? 1 : d.numberOfTeams)
  const most = rules.maxObserversPerTeam * teams
  const [observers, setObservers] = useState(Math.min(d.numberOfObservers, most))
  const answer = (yes: boolean | undefined) => (yes === undefined ? '' : yes ? singleAnswers[1] : singleAnswers[0])
  const [leaderRooms, setLeaderRooms] = useState(() => range(2).map((i) => answer(d.singleRooms.teamLeaders[i])))
  const [observerRooms, setObserverRooms] = useState(() => range(rules.maxObserversPerTeam * 2).map((i) => answer(d.singleRooms.observers[i])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const shownObservers = Math.min(observers, most)
  const leaderLabel = (i: number) => `Team Leader, ${data.teams[i]?.name ?? (i === 0 ? 'first team' : 'second team')}${i === 0 ? ' (you)' : ''}`
  const observerLabel = (i: number) => (most === 1 ? 'Observer' : `Observer ${i + 1}`)
  const rooms = [...range(teams).map((i) => ({ id: `setup-${slug(leaderLabel(i))}`, label: leaderLabel(i), value: leaderRooms[i], set: (v: string) => setLeaderRooms((l) => l.map((a, j) => (j === i ? v : a))) })),
    ...range(shownObservers).map((i) => ({ id: `setup-observer-${i + 1}`, label: observerLabel(i), value: observerRooms[i], set: (v: string) => setObserverRooms((l) => l.map((a, j) => (j === i ? v : a))) }))]

  // The fees for what is chosen right now, worked out as the server will once this is saved.
  const singles = rooms.filter((r) => r.value === singleAnswers[1]).length
  const rate = `${data.fees.tierLabel} rate, ${data.fees.categoryLabel.toLowerCase()}`
  const lines: FeeLine[] = [
    ...rules.teamFees.slice(0, teams).map((amount, i) => ({ key: `team${i}`, label: oneTeamOnly ? 'Team' : i === 0 ? 'First team' : 'Second team', detail: `${rate}. Four contestants and their Team Leader.`, amount })),
    { key: 'observers', label: 'Observers', detail: shownObservers ? `${shownObservers} × ${rules.observerFee === null ? 'rate to be confirmed' : usd(rules.observerFee)}` : 'None', amount: !shownObservers ? 0 : rules.observerFee === null ? null : shownObservers * rules.observerFee },
    { key: 'singles', label: 'Single rooms', detail: singles ? `${singles} × ${usd(rules.singleRoomFee)}` : 'None: everyone shares a twin room', amount: singles * rules.singleRoomFee },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const missing = Object.fromEntries(rooms.filter((r) => !r.value).map((r) => [r.id, 'Choose yes or no.']))
    setErrors(missing)
    if (Object.keys(missing).length) { document.getElementById(Object.keys(missing)[0])?.focus(); return }
    onSave({
      numberOfTeams: teams, numberOfObservers: shownObservers,
      singleRooms: { teamLeaders: range(teams).map((i) => leaderRooms[i] === singleAnswers[1]), observers: range(shownObservers).map((i) => observerRooms[i] === singleAnswers[1]) },
    })
  }

  return (
    <form onSubmit={submit} noValidate data-dirty-key="setup">
      <div className="reg-cards">
        <Card id="setup-delegation" title="Your delegation" intro="From your invitation code and your account. If anything looks wrong, email the organisers.">
          <Facts items={[
            { label: 'Team Leader', value: d.primaryTeamLeaderName, help: d.teamLeaderEmail },
            { label: 'Country or territory', value: d.countryTerritory },
            { label: 'Fee rate', value: data.fees.categoryLabel, help: d.feeCategory === 'previous_host' ? 'Countries that have hosted the IOL pay a lower team fee.' : d.feeCategory === 'non_accredited' ? 'Not yet accredited: one team.' : undefined },
          ]} />
        </Card>

        <Card id="setup-numbers" title="Teams and observers" intro="Each team is four contestants and one Team Leader, whose place is in the team fee.">
          <div className="reg-grid">
            <LiveSelect id="setup-number-of-teams" label="Number of teams" value={String(teams)} options={oneTeamOnly ? ['1'] : ['1', '2']} onChange={(v) => setTeams(Number(v))}
              help={oneTeamOnly ? 'A country or territory that is not accredited registers one team.' : 'One or two. A second team costs more than the first.'} />
            <LiveSelect id="setup-number-of-observers" label="Number of observers" value={String(shownObservers)} options={range(most + 1).map(String)} onChange={(v) => setObservers(Number(v))}
              help={`Optional. At most ${rules.maxObserversPerTeam} per team${rules.observerFee === null ? '' : `, ${usd(rules.observerFee)} each`}. For example a parent or someone from your national olympiad. You name them later, in People.`} />
          </div>
        </Card>

        <Card id="setup-rooms" title="Single rooms" intro={`Team Leaders and observers share twin rooms. Anyone who would rather have a room to themselves can ask for a single room, at ${usd(rules.singleRoomFee)} more. Contestants share with a teammate of the same gender.`}>
          <div className="reg-grid">
            {rooms.map((r) => <LiveSelect key={r.id} id={r.id} label={r.label} value={r.value} options={singleAnswers} placeholder="Choose…" error={errors[r.id]} onChange={r.set} />)}
          </div>
        </Card>

        <Card id="setup-fees" title="Your fees" intro="Updates as you choose. Saving this step sets the amount on your invoice." status={<Chip tone="later">{data.fees.tierLabel} rate</Chip>}>
          <FeeTable lines={lines} total={total} pending={shownObservers > 0 && rules.observerFee === null} />
          {paymentDone && <p className="reg-aside"><Info size={18} aria-hidden="true" />You have already paid. If a change here alters the total, Finance will contact you about the difference.</p>}
        </Card>
      </div>
      <div className="reg-panel-actions">
        <Alert>{error}</Alert>
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'} <ArrowRight size={18} aria-hidden="true" /></button>
        <UnsavedNote show={dirty} />
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
  const field = (i: number, key: 'name' | 'tin' | 'address' | 'amount', label: string, value: string, extra: { optional?: boolean; help?: string; area?: boolean } = {}) => {
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
  return <>
    <div className="reg-grid">
      <LiveSelect id="payment-number-of-invoices" label="Number of invoices" value={String(count)} options={range(MAX_INVOICES).map((i) => String(i + 1))} onChange={changeCount} disabled={disabled}
        help="One, unless several organisations each pay part of the fees. Each invoice then gets its own payer and amount." />
    </div>
    {count === 1 ? (
      <div className="reg-grid reg-invoice-one">
        <FieldControl idPrefix="payment" disabled={disabled} error={errors['Invoice recipient name']} field={{ label: 'Invoice recipient name', value: recipient, help: 'The organisation named on the invoice.' }} />
        <FieldControl idPrefix="payment" disabled={disabled} field={{ label: 'Tax identification number (TIN)', value: payment?.invoiceRecipientTin ?? '', optional: true, help: 'Only if your institution needs it on the invoice.' }} />
        <FieldControl idPrefix="payment" disabled={disabled} field={{ label: 'Invoice recipient address', value: payment?.invoiceRecipientAddress ?? '', kind: 'textarea', optional: true, help: 'Only if your institution needs a postal address on the invoice.' }} />
      </div>
    ) : <>
      {range(count).map((i) => (
        <fieldset className="reg-invoice-part" key={i}>
          <legend>Invoice {i + 1} of {count}</legend>
          <div className="reg-grid">
            {field(i, 'name', 'Invoice recipient name', saved?.[i]?.recipientName ?? (i === 0 ? recipient : ''), { help: 'The organisation that pays this part.' })}
            {field(i, 'amount', 'Amount (USD)', '', { help: 'Whole dollars, or dollars and cents.' })}
            {field(i, 'tin', 'Tax identification number (TIN)', saved?.[i]?.recipientTin ?? (i === 0 ? payment?.invoiceRecipientTin ?? '' : ''), { optional: true })}
            {field(i, 'address', 'Invoice recipient address', saved?.[i]?.recipientAddress ?? (i === 0 ? payment?.invoiceRecipientAddress ?? '' : ''), { optional: true, area: true })}
          </div>
        </fieldset>
      ))}
      <p className={`reg-invoice-sum${left === 0 ? ' is-even' : ''}${errors['invoice-split'] ? ' has-error' : ''}`} role="status" id="invoice-split">
        {left === 0 ? <>The {count} invoices add up to the total, {usd(total)}.</>
          : left > 0 ? <>{usd(assigned)} of {usd(total)} assigned. <strong>{usd(left)} still to assign.</strong></>
          : <>{usd(assigned)} assigned. <strong>That is {usd(-left)} more than the total of {usd(total)}.</strong></>}
      </p>
    </>}
  </>
}
