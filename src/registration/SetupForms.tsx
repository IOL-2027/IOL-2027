// Two forms of the Team Leader portal whose fields depend on each other as they are filled in: Team and observers
// (teams, the observer each team may bring, and who needs a single room, which set the fees) and the invoice details
// on Payment (one invoice, or several with a payer and an amount each that must add up to the total).
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CircleAlert, Info, Plus } from 'lucide-react'
import type { DelegationData, Payment } from './api'
import { selectOptions } from './portalData'
import { Alert, Card, Chip, Facts } from './ui'

export const MAX_INVOICES = 5
const singleAnswers = selectOptions['Single room']
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
export const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const cents = (n: number) => Math.round(n * 100)

/** Moves the focus to an element by id once React has drawn it: after adding or removing an observer or an invoice. */
function useFocusAfter() {
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    if (!target) return
    document.getElementById(target)?.focus()
    setTarget(null)
  }, [target])
  return setTarget
}

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

/** Team names as Teams shows them: the country for one team, its A and B teams for two, or a name given in Teams. */
export function teamNames(data: DelegationData, count: number) {
  const country = data.delegation.countryTerritory.replace(/\s*\(TEST\)\s*/i, '').trim()
  const defaults = [country, `${country} A`, `${country} B`]
  return range(count).map((i) => {
    const saved = data.teams[i]?.name
    return saved && !defaults.includes(saved) ? saved : count === 1 ? country : `${country} ${'AB'[i]}`
  })
}

export type SetupBody = { numberOfTeams: number; observerTeams: number[]; singleRooms: { teamLeaders: boolean[]; observers: boolean[] } }
type Observer = { key: number; team: number; room: string }

/** Team and observers: how many teams, the observer each team brings, who wants a single room, and what that costs. */
export function TeamSetup({ data, paymentDone, busy, error, dirty, onTouched, onSave }: {
  data: DelegationData; paymentDone: boolean; busy: boolean; error: ReactNode; dirty: boolean; onTouched: () => void; onSave: (body: SetupBody) => void
}) {
  const d = data.delegation
  const rules = data.feeRules
  const oneTeamOnly = d.feeCategory === 'non_accredited'
  const perTeam = rules.maxObserversPerTeam
  const [teams, setTeams] = useState(oneTeamOnly ? 1 : d.numberOfTeams)
  const answer = (yes: boolean | undefined) => (yes === undefined ? '' : yes ? singleAnswers[1] : singleAnswers[0])
  const [leaderRooms, setLeaderRooms] = useState(() => range(2).map((i) => answer(d.singleRooms.teamLeaders[i])))
  // Each observer as added, with the team they come with and their room. Those of a team taken away come back with it.
  const [observers, setObservers] = useState<Observer[]>(() => range(d.numberOfObservers).map((i) => ({
    key: i, team: d.singleRooms.observerTeams?.[i] ?? Math.min(Math.floor(i / Math.max(perTeam, 1)), 1), room: answer(d.singleRooms.observers[i]),
  })))
  const nextKey = useRef(d.numberOfObservers)
  const [announce, setAnnounce] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const focusAfter = useFocusAfter()
  const names = teamNames(data, teams)
  const shown = observers.filter((o) => o.team < teams).sort((a, b) => a.team - b.team || a.key - b.key)
  const observerFee = rules.observerFee === null ? 'Rate to be confirmed' : usd(rules.observerFee)
  /** "Observer", numbered when a team may bring more than one, and with the team's name when there are two. */
  const observerName = (o: Observer, withTeam = teams > 1) => {
    const mates = shown.filter((x) => x.team === o.team)
    return `Observer${mates.length > 1 ? ` ${mates.indexOf(o) + 1}` : ''}${withTeam ? `, ${names[o.team]}` : ''}`
  }
  const leaderLabel = (i: number) => (teams === 1 ? 'Team Leader (you)' : `Team Leader, ${names[i]}${i === 0 ? ' (you)' : ''}`)
  const rooms = [
    ...range(teams).map((i) => ({ id: `setup-room-leader-${i + 1}`, label: leaderLabel(i), value: leaderRooms[i], set: (v: string) => setLeaderRooms((l) => l.map((a, j) => (j === i ? v : a))) })),
    ...shown.map((o) => ({ id: `setup-room-observer-${o.key}`, label: observerName(o), value: o.room, set: (v: string) => setObservers((l) => l.map((x) => (x.key === o.key ? { ...x, room: v } : x))) })),
  ]

  const addObserver = (team: number) => {
    const key = nextKey.current++
    setObservers((list) => [...list, { key, team, room: '' }])
    setAnnounce(`Observer added to ${names[team]}. Choose their room under Single rooms.`)
    onTouched()
    focusAfter(`setup-observer-${key}-remove`)
  }
  const removeObserver = (o: Observer) => {
    setObservers((list) => list.filter((x) => x.key !== o.key))
    setErrors(({ [`setup-room-observer-${o.key}`]: _gone, ...rest }) => rest)
    setAnnounce(`Observer removed from ${names[o.team]}.`)
    onTouched()
    focusAfter(`setup-add-observer-${o.team}`)
  }

  // The fees for what is chosen right now, worked out as the server will once this is saved.
  const singles = rooms.filter((r) => r.value === singleAnswers[1]).length
  const rate = `${data.fees.tierLabel} rate, ${data.fees.categoryLabel.toLowerCase()}`
  const lines: FeeLine[] = [
    ...rules.teamFees.slice(0, teams).map((amount, i) => ({ key: `team${i}`, label: oneTeamOnly ? 'Team' : i === 0 ? 'First team' : 'Second team', detail: `${names[i]}. ${rate}. Four contestants and their Team Leader.`, amount })),
    { key: 'observers', label: 'Observers', detail: shown.length ? `${shown.length} × ${rules.observerFee === null ? 'rate to be confirmed' : usd(rules.observerFee)}` : 'None', amount: !shown.length ? 0 : rules.observerFee === null ? null : shown.length * rules.observerFee },
    { key: 'singles', label: 'Single rooms', detail: singles ? `${singles} × ${usd(rules.singleRoomFee)}` : 'None: everyone shares a twin room', amount: singles * rules.singleRoomFee },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  // An unpaid invoice follows this step when it is saved: say so before its amount changes under whoever pays it.
  const invoice = data.payments[0]
  const invoiceChanges = Boolean(invoice && !paymentDone && cents(total) !== cents(Number(invoice.amountDue)))
  // Observers already named in People must still be covered by the fees.
  const named = data.members.filter((m) => m.role === 'observer').length

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const missing = Object.fromEntries(rooms.filter((r) => !r.value).map((r) => [r.id, 'Choose yes or no.']))
    setErrors(missing)
    if (Object.keys(missing).length) { document.getElementById(Object.keys(missing)[0])?.focus(); return }
    onSave({
      numberOfTeams: teams, observerTeams: shown.map((o) => o.team),
      singleRooms: { teamLeaders: range(teams).map((i) => leaderRooms[i] === singleAnswers[1]), observers: shown.map((o) => o.room === singleAnswers[1]) },
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

        <Card id="setup-numbers" title="Teams and observers"
          intro={`Each team is four contestants and a Team Leader, whose place is in the team fee.${perTeam ? ` A team may also bring ${perTeam === 1 ? 'an observer' : `up to ${perTeam} observers`}, for example a parent or someone from your national olympiad.` : ''} You name everyone later, in People.`}>
          <div className="reg-grid">
            <LiveSelect id="setup-number-of-teams" label="Number of teams" value={String(teams)} options={oneTeamOnly ? ['1'] : ['1', '2']} onChange={(v) => setTeams(Number(v))}
              help={oneTeamOnly ? 'A country or territory that is not accredited registers one team.' : 'One or two. A second team costs more than the first.'} />
          </div>
          <ul className="reg-team-boxes" aria-label="Your teams">
            {range(teams).map((t) => {
              const mine = shown.filter((o) => o.team === t)
              return (
                <li key={t} className="reg-team-box">
                  <div className="reg-team-box-head">
                    <h4>{names[t]}</h4>
                    <span>{usd(rules.teamFees[t] ?? 0)}</span>
                  </div>
                  <p className="reg-team-box-who">Four contestants and their Team Leader</p>
                  {mine.length > 0 && (
                    <ul className="reg-team-box-observers">
                      {mine.map((o) => (
                        <li key={o.key}>
                          <span><strong>{observerName(o, false)}</strong><small>{observerFee} · named later, in People</small></span>
                          <button type="button" id={`setup-observer-${o.key}-remove`} className="reg-btn-link reg-btn-remove" onClick={() => removeObserver(o)}>
                            Remove<span className="reg-visually-hidden"> the {observerName(o, false).toLowerCase()} of {names[t]}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {mine.length < perTeam && (
                    <button type="button" id={`setup-add-observer-${t}`} className="reg-btn-link reg-add-link" onClick={() => addObserver(t)}>
                      <Plus size={16} aria-hidden="true" />Add observer<span className="reg-visually-hidden"> to {names[t]}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {named > shown.length && (
            <p className="reg-aside reg-aside-warn reg-card-foot"><Info size={18} aria-hidden="true" />
              <span>People already names {named} {named === 1 ? 'observer' : 'observers'}, more than you have here. Add an observer back, or remove the extra {named - shown.length === 1 ? 'one' : 'ones'} in People, so your fees cover everyone who comes.</span>
            </p>
          )}
          <span className="reg-visually-hidden" role="status">{announce}</span>
        </Card>

        <Card id="setup-rooms" title="Single rooms" intro={`Team Leaders and observers share twin rooms. Anyone who would rather have a room to themselves can ask for a single room, at ${usd(rules.singleRoomFee)} more. Contestants share with a teammate of the same gender.`}>
          <div className="reg-grid">
            {rooms.map((r) => <LiveSelect key={r.id} id={r.id} label={r.label} value={r.value} options={singleAnswers} placeholder="Choose…" error={errors[r.id]} onChange={r.set} />)}
          </div>
        </Card>

        <Card id="setup-fees" title="Your fees" intro="Updates as you choose. Saving this step sets the amount on your invoice." status={<Chip tone="later">{data.fees.tierLabel} rate</Chip>}>
          <FeeTable lines={lines} total={total} pending={shown.length > 0 && rules.observerFee === null} />
          {invoiceChanges && invoice && (
            <p className="reg-aside reg-aside-warn"><Info size={18} aria-hidden="true" />
              <span>Your invoice {invoice.invoiceNumber} is for {usd(Number(invoice.amountDue))}. Saving changes it to {usd(total)}{invoice.invoiceSplits?.length ? ', and you will need to share the new total between your payers again in Payment' : ''}. Then download the new PDF in Payment for whoever pays.</span>
            </p>
          )}
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
  const invoices = range(count).map((i) => ({
    recipientName: text(`invoice-${i}-name`), recipientAddress: text(`invoice-${i}-address`), recipientTin: text(`invoice-${i}-tin`), amount: Number(text(`invoice-${i}-amount`) || 0),
  }))
  const { amount: _amount, ...first } = invoices[0]
  return count <= 1 ? first : { ...first, invoices }
}

/** What is wrong with the invoice details before they are sent, keyed like the fields; empty when they can be saved. */
export function invoiceProblems(body: InvoiceBody, total: number): Record<string, string> {
  if (!body.invoices) return body.recipientName ? {} : { 'invoice-0-name': 'Enter the organisation named on the invoice.' }
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

type InvoiceDraft = { key: number; name: string; tin: string; address: string; amount: string }
type InvoicePart = Exclude<keyof InvoiceDraft, 'key'>

/**
 * The invoice details on Payment: one invoice, and "Add another invoice" when several organisations each pay a part.
 * Each invoice then sits in a box of its own with a payer and an amount, and a running total says what is left.
 */
export function InvoiceDetails({ data, payment, disabled, errors, onTouched }: { data: DelegationData; payment: Payment | undefined; disabled: boolean; errors: Record<string, string>; onTouched: () => void }) {
  const total = data.fees.total
  const saved = payment?.invoiceCount && payment.invoiceCount > 1 && payment.invoiceSplits?.length ? payment.invoiceSplits : null
  const [invoices, setInvoices] = useState<InvoiceDraft[]>(() => saved
    ? saved.map((s, i) => ({ key: i, name: s.recipientName ?? '', tin: s.recipientTin ?? '', address: s.recipientAddress ?? '', amount: String(s.amount) }))
    : [{ key: 0, name: payment?.invoiceRecipientName ?? data.delegation.accreditedOrganisation ?? '', tin: payment?.invoiceRecipientTin ?? '', address: payment?.invoiceRecipientAddress ?? '', amount: '' }])
  const nextKey = useRef(invoices.length)
  const focusAfter = useFocusAfter()
  const count = invoices.length
  const split = count > 1
  const assigned = invoices.reduce((s, inv) => s + cents(Number(inv.amount) || 0), 0) / 100
  const left = Math.round((total - assigned) * 100) / 100
  const edit = (key: number, part: InvoicePart, value: string) => setInvoices((list) => list.map((inv) => (inv.key === key ? { ...inv, [part]: value } : inv)))
  // Amounts still at an even share (or a first split) are shared evenly again when an invoice is added or removed;
  // amounts someone has typed are kept, and a new invoice then takes what is left.
  const reshare = (next: InvoiceDraft[], before: InvoiceDraft[]) => {
    if (next.length === 1) return next.map((inv) => ({ ...inv, amount: '' }))
    const even = before.length === 1 || evenSplit(total, before.length).every((share, i) => before[i].amount === share)
    if (!even) return next
    const shares = evenSplit(total, next.length)
    return next.map((inv, i) => ({ ...inv, amount: shares[i] }))
  }
  const add = () => {
    const key = nextKey.current++
    setInvoices((list) => {
      const next = reshare([...list, { key, name: '', tin: '', address: '', amount: '' }], list)
      return next.map((inv) => (inv.key === key && !inv.amount && left > 0 ? { ...inv, amount: String(left) } : inv))
    })
    onTouched()
    focusAfter(`invoice-${count}-name`)
  }
  const remove = (key: number) => {
    setInvoices((list) => reshare(list.filter((inv) => inv.key !== key), list))
    onTouched()
    focusAfter('invoice-add')
  }

  const field = (i: number, inv: InvoiceDraft, part: InvoicePart, label: string, extra: { optional?: boolean; help?: string; wide?: boolean } = {}) => {
    const name = `invoice-${i}-${part}`
    const error = errors[name]
    const common = {
      id: name, name, className: 'reg-control', disabled, value: inv[part],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => edit(inv.key, part, e.target.value),
      'aria-describedby': [extra.help && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined,
    }
    return (
      <div key={part} className={`reg-field${extra.wide ? ' reg-field-wide' : ''}${error ? ' has-error' : ''}`}>
        <label htmlFor={name}>{label}{extra.optional && <span className="reg-optional"> (optional)</span>}</label>
        {extra.help && <p className="reg-hint" id={`${name}-hint`}>{extra.help}</p>}
        {error && <p className="reg-error" id={`${name}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
        {part === 'amount' ? <input {...common} type="number" min="0" step="0.01" inputMode="decimal" />
          : part === 'address' ? <textarea {...common} rows={2} /> : <input {...common} />}
      </div>
    )
  }

  return <>
    <input type="hidden" name="Number of invoices" value={count} />
    <ol className={`reg-invoices${split ? ' is-split' : ''}`}>
      {invoices.map((inv, i) => (
        <li key={inv.key} className="reg-invoice-part" aria-labelledby={split ? `invoice-${inv.key}-title` : undefined}>
          {split && (
            <div className="reg-invoice-head">
              <span className="reg-invoice-number" aria-hidden="true">{i + 1}</span>
              <h4 id={`invoice-${inv.key}-title`}>Invoice {i + 1}<span className="reg-visually-hidden"> of {count}</span></h4>
              <span className="reg-invoice-amount">{Number(inv.amount) > 0 ? usd(Number(inv.amount)) : 'No amount yet'}</span>
              {!disabled && (
                <button type="button" className="reg-btn-link reg-btn-remove" onClick={() => remove(inv.key)}>Remove<span className="reg-visually-hidden"> invoice {i + 1}</span></button>
              )}
            </div>
          )}
          <div className="reg-grid">
            {split ? [
              field(i, inv, 'name', 'Invoice recipient name', { help: 'The organisation that pays this part.' }),
              field(i, inv, 'amount', 'Amount (USD)', { help: 'Whole dollars, or dollars and cents.' }),
              field(i, inv, 'tin', 'Tax identification number (TIN)', { optional: true }),
              field(i, inv, 'address', 'Invoice recipient address', { optional: true }),
            ] : [
              field(i, inv, 'name', 'Invoice recipient name', { help: 'The organisation named on the invoice.' }),
              field(i, inv, 'tin', 'Tax identification number (TIN)', { optional: true, help: 'Only if your institution needs it on the invoice.' }),
              field(i, inv, 'address', 'Invoice recipient address', { optional: true, wide: true, help: 'Only if your institution needs a postal address on the invoice.' }),
            ]}
          </div>
        </li>
      ))}
    </ol>
    {split && (
      <p className={`reg-invoice-sum${left === 0 ? ' is-even' : ''}${errors['invoice-split'] ? ' has-error' : ''}`} role="status" id="invoice-split">
        {left === 0 ? <>The {count} invoices add up to the total, {usd(total)}.</>
          : left > 0 ? <>{usd(assigned)} of {usd(total)} assigned. <strong>{usd(left)} still to assign.</strong></>
          : <>{usd(assigned)} assigned. <strong>That is {usd(-left)} more than the total of {usd(total)}.</strong></>}
      </p>
    )}
    {!disabled && (
      <div className="reg-invoice-add">
        {count < MAX_INVOICES
          ? <button type="button" id="invoice-add" className="reg-btn-link reg-add-link" onClick={add}><Plus size={16} aria-hidden="true" />Add another invoice</button>
          : <p className="reg-hint">That is the most: up to {MAX_INVOICES} invoices.</p>}
        {!split && <p className="reg-hint">Only if several organisations each pay part of the fees. Each invoice then gets its own payer and amount.</p>}
      </div>
    )}
  </>
}
