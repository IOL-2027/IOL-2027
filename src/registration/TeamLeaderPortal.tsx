import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock, Copy, Download, Info, Lock, MailCheck, ShieldCheck, Upload, UserPlus } from 'lucide-react'
import {
  delegation, feeLines, feeTotal, fees, personFieldGroups, programmeWindow, sections, selectOptions,
  type Field, type PortalRecord, type Section, type SectionId,
} from './portalData'
import { openInvoice } from './invoice'
import './registration.css'

const money = (n: number) => `${fees.currency} ${n.toLocaleString('en-US')}`
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)

/* ------------------------------------------------------------------ */
/* Shared form pieces                                                  */
/* ------------------------------------------------------------------ */

type FieldProps = { field: Field; idPrefix: string; error?: string; wide?: boolean }

function FieldControl({ field, idPrefix, error, wide }: FieldProps) {
  const id = `${idPrefix}-${slug(field.label)}`
  const hintId = field.help ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const kind = field.kind ?? 'text'
  const options = field.options ?? selectOptions[field.label] ?? []
  const isWide = wide || kind === 'textarea' || kind === 'checkboxes'

  if (kind === 'checkboxes') {
    const chosen = field.value.split(',').map((v) => v.trim()).filter(Boolean)
    return (
      <fieldset className={`reg-field reg-field-wide${error ? ' has-error' : ''}`} aria-describedby={describedBy}>
        <legend>{field.label}{field.optional && <span className="reg-optional"> (optional)</span>}</legend>
        {field.help && <p className="reg-hint" id={hintId}>{field.help}</p>}
        {error && <p className="reg-error" id={errorId}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
        <div className="reg-checks">
          {options.map((option) => (
            <label key={option} className="reg-check">
              <input type="checkbox" name={field.label} value={option} defaultChecked={chosen.includes(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  const common = {
    id, name: field.label, defaultValue: field.value,
    'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined,
    className: 'reg-control',
  }
  return (
    <div className={`reg-field${isWide ? ' reg-field-wide' : ''}${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{field.label}{field.optional && <span className="reg-optional"> (optional)</span>}</label>
      {field.help && <p className="reg-hint" id={hintId}>{field.help}</p>}
      {error && <p className="reg-error" id={errorId}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      {kind === 'select' ? (
        <select {...common}>
          <option value="">Choose…</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : kind === 'textarea' ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common} type={kind} min={kind === 'number' ? 0 : undefined} inputMode={kind === 'number' ? 'numeric' : undefined} />
      )}
    </div>
  )
}

function Facts({ items, compact }: { items: { label: string; value: string; help?: string }[]; compact?: boolean }) {
  return (
    <dl className={`reg-facts${compact ? ' reg-facts-compact' : ''}`}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}{item.help && <small>{item.help}</small>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Required fields that are empty in the submitted form. */
function missingFields(form: HTMLFormElement, fields: Field[]) {
  const data = new FormData(form)
  return fields.filter((field) => !field.optional && field.kind !== 'checkboxes' && !String(data.get(field.label) ?? '').trim())
}

function focusFirstError(container: HTMLElement | null) {
  requestAnimationFrame(() => container?.querySelector<HTMLElement>('[aria-invalid="true"], .reg-dropzone.has-error input')?.focus())
}

/* ------------------------------------------------------------------ */
/* Account setup: invitation → account → email code                    */
/* ------------------------------------------------------------------ */

const accountSteps = ['Invitation', 'Account', 'Email code']

function AccountSetup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [resent, setResent] = useState(false)
  const [email, setEmail] = useState(delegation.leaderEmail)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    headingRef.current?.focus({ preventScroll: true })
    const top = rootRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0 || top > window.innerHeight * 0.6) rootRef.current?.scrollIntoView({ block: "start" })
  }, [step])

  const go = (next: number) => { setErrors({}); setResent(false); setStep(next) }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const found: Record<string, string> = {}
    if (step === 0 && !/^IOL2027-[A-Z]{3}-[A-Z0-9]{4}$/i.test(value('code'))) {
      found.code = 'Enter the code in the format IOL2027-ABC-1234. It is in the invitation email from the organisers.'
    }
    if (step === 1) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) found.email = 'Enter an email address like name@example.org.'
      if (!value('name')) found.name = 'Enter the Team Leader’s full name.'
      if (value('password').length < 12) found.password = 'Use at least 12 characters.'
      if (!found.email) setEmail(value('email'))
    }
    if (step === 2 && !/^\d{6}$/.test(value('otp'))) found.otp = 'Enter the 6 digits from the email.'
    setErrors(found)
    if (Object.keys(found).length) { focusFirstError(formRef.current); return }
    if (step < 2) go(step + 1)
    else onDone()
  }

  const err = (name: string) => errors[name]
  const describe = (name: string, hint?: boolean) => [hint ? `acc-${name}-hint` : '', err(name) ? `acc-${name}-error` : ''].filter(Boolean).join(' ') || undefined
  const errorLine = (name: string) => err(name) && <p className="reg-error" id={`acc-${name}-error`}><CircleAlert size={16} aria-hidden="true" />{err(name)}</p>

  return (
    <div className="reg-account" ref={rootRef}>
      <ol className="reg-stepper" aria-label="Account setup">
        {accountSteps.map((label, index) => {
          const state = index < step ? 'done' : index === step ? 'current' : 'upcoming'
          const marker = <span className="reg-stepper-mark" aria-hidden="true">{state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
          return (
            <li key={label} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              {state === 'done'
                ? <button type="button" onClick={() => go(index)}>{marker}<span className="reg-stepper-label">{label}</span><span className="reg-visually-hidden"> (completed, go back)</span></button>
                : <span className="reg-stepper-static">{marker}<span className="reg-stepper-label">{label}</span></span>}
            </li>
          )
        })}
      </ol>

      <form ref={formRef} className="reg-account-card" onSubmit={submit} noValidate key={step}>
        {step === 0 && <>
          <h2 ref={headingRef} tabIndex={-1}>Enter your invitation code</h2>
          <p className="reg-lede">Each country or territory receives one code by email. It links your account to the right country and team allowance.</p>
          <div className={`reg-field${err('code') ? ' has-error' : ''}`}>
            <label htmlFor="acc-code">Invitation code</label>
            <p className="reg-hint" id="acc-code-hint">Example: IOL2027-ABC-1234</p>
            {errorLine('code')}
            <input id="acc-code" name="code" className="reg-control reg-control-code" defaultValue={delegation.inviteCode} autoComplete="off" spellCheck={false} aria-describedby={describe('code', true)} aria-invalid={err('code') ? true : undefined} />
          </div>
          <p className="reg-reassure"><ShieldCheck size={18} aria-hidden="true" />Only the official contact for each country receives a code.</p>
          <div className="reg-account-actions"><button type="submit" className="reg-btn reg-btn-primary">Check code <ArrowRight size={18} aria-hidden="true" /></button></div>
        </>}

        {step === 1 && <>
          <h2 ref={headingRef} tabIndex={-1}>Create the Team Leader account</h2>
          <p className="reg-lede">You will use this account for the whole registration, so use an address your team can rely on.</p>
          <div className="reg-confirmed">
            <Check size={18} strokeWidth={3} aria-hidden="true" />
            <div><strong>{delegation.country}</strong><span>{delegation.organisation} · set by your invitation code</span></div>
          </div>
          <div className={`reg-field${err('email') ? ' has-error' : ''}`}>
            <label htmlFor="acc-email">Email address</label>
            <p className="reg-hint" id="acc-email-hint">For signing in and for official notices from the organisers.</p>
            {errorLine('email')}
            <input id="acc-email" name="email" type="email" autoComplete="email" className="reg-control" defaultValue={email} aria-describedby={describe('email', true)} aria-invalid={err('email') ? true : undefined} />
          </div>
          <div className={`reg-field${err('name') ? ' has-error' : ''}`}>
            <label htmlFor="acc-name">Full name</label>
            <p className="reg-hint" id="acc-name-hint">Entered once and reused on teams, badges and letters.</p>
            {errorLine('name')}
            <input id="acc-name" name="name" autoComplete="name" className="reg-control" defaultValue={delegation.leaderName} aria-describedby={describe('name', true)} aria-invalid={err('name') ? true : undefined} />
          </div>
          <div className={`reg-field${err('password') ? ' has-error' : ''}`}>
            <label htmlFor="acc-password">Password</label>
            <p className="reg-hint" id="acc-password-hint">At least 12 characters.</p>
            {errorLine('password')}
            <input id="acc-password" name="password" type="password" autoComplete="new-password" className="reg-control" defaultValue="IOL2027-secure" aria-describedby={describe('password', true)} aria-invalid={err('password') ? true : undefined} />
          </div>
          <div className="reg-account-actions">
            <button type="submit" className="reg-btn reg-btn-primary">Create account <ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" className="reg-btn-link" onClick={() => go(0)}><ArrowLeft size={16} aria-hidden="true" />Back</button>
          </div>
        </>}

        {step === 2 && <>
          <h2 ref={headingRef} tabIndex={-1}>Check your email</h2>
          <p className="reg-lede">We sent a 6-digit code to <strong>{email}</strong>. It expires in 30 minutes.</p>
          <div className={`reg-field${err('otp') ? ' has-error' : ''}`}>
            <label htmlFor="acc-otp">Code from the email</label>
            {errorLine('otp')}
            <input id="acc-otp" name="otp" className="reg-control reg-control-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} defaultValue="202027" aria-describedby={describe('otp')} aria-invalid={err('otp') ? true : undefined} />
          </div>
          <p className="reg-reassure"><MailCheck size={18} aria-hidden="true" />
            <span>No email? Check spam, or <button type="button" className="reg-inline-btn" onClick={() => setResent(true)}>send a new code</button>. Wrong address? <button type="button" className="reg-inline-btn" onClick={() => go(1)}>Change it</button>.</span>
          </p>
          <p className="reg-status-line" role="status">{resent ? `A new code is on its way to ${email}.` : ''}</p>
          <div className="reg-account-actions"><button type="submit" className="reg-btn reg-btn-primary">Verify and continue <ArrowRight size={18} aria-hidden="true" /></button></div>
        </>}
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

type StepStatus = 'done' | 'todo' | 'locked' | 'info' | 'waiting' | 'after'
const statusLabel: Record<StepStatus, string> = {
  done: 'Done', todo: 'To do', locked: 'Opens after payment', info: 'Read first', waiting: 'After the steps above', after: 'After you submit',
}

function StatusMark({ status, number }: { status: StepStatus; number: number }) {
  if (status === 'done') return <span className="reg-mark is-done" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
  if (status === 'locked') return <span className="reg-mark is-locked" aria-hidden="true"><Lock size={13} strokeWidth={2.4} /></span>
  return <span className={`reg-mark is-${status}`} aria-hidden="true">{number}</span>
}

function recordChip(record: PortalRecord) {
  if (record.status === 'complete') return <span className="reg-chip is-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Complete</span>
  if (record.status === 'later') return <span className="reg-chip is-later"><Clock size={13} aria-hidden="true" />{record.issue ?? 'Later'}</span>
  return <span className="reg-chip is-attention"><CircleAlert size={13} aria-hidden="true" />{record.issue ?? 'Needs attention'}</span>
}

function Workspace({ onRestart }: { onRestart: () => void }) {
  const [activeId, setActiveId] = useState<SectionId>('start')
  const [done, setDone] = useState<Set<SectionId>>(new Set())
  const [proofName, setProofName] = useState<string | null>(null)
  const [records, setRecords] = useState<Record<string, PortalRecord[]>>(() =>
    Object.fromEntries(sections.filter((s) => s.records).map((s) => [s.id, s.records!.items])))
  const [recordIndex, setRecordIndex] = useState<Record<string, number>>({})
  const [recordOpen, setRecordOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [sectionError, setSectionError] = useState<ReactNode>(null)
  const [savedNote, setSavedNote] = useState('')
  const [stay, setStay] = useState({ arrival: '', departure: '' })
  const [submitted, setSubmitted] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  const main = sections.filter((s) => !s.afterSubmission)
  const after = sections.filter((s) => s.afterSubmission)
  const required = sections.filter((s) => s.required)
  const section = sections.find((s) => s.id === activeId)!
  const doneCount = required.filter((s) => done.has(s.id)).length
  const allRequiredDone = doneCount === required.length

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    titleRef.current?.focus({ preventScroll: true })
    // Only scroll when the panel's top is hidden behind the fixed header or far down the screen.
    const top = panelRef.current?.getBoundingClientRect().top ?? 0
    if (top < 100 || top > window.innerHeight * 0.6) panelRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [activeId, recordOpen])

  const statusOf = (s: Section): StepStatus => {
    if (s.id === 'people' && !proofName) return 'locked'
    if (done.has(s.id)) return 'done'
    if (s.id === 'start') return 'info'
    if (s.id === 'review') return submitted ? 'done' : allRequiredDone ? 'todo' : 'waiting'
    if (s.afterSubmission) return 'after'
    return 'todo'
  }

  const open = (id: SectionId) => {
    setActiveId(id); setNavOpen(false); setRecordOpen(false)
    setFieldErrors({}); setSectionError(null); setSavedNote('')
  }
  const nextOf = (id: SectionId) => main[main.findIndex((s) => s.id === id) + 1]?.id
  const complete = (id: SectionId) => {
    setDone((current) => new Set(current).add(id))
    const next = nextOf(id)
    if (next) open(next)
  }
  const firstOpenStep = main.find((s) => s.required && !done.has(s.id) && statusOf(s) !== 'locked') ?? main.find((s) => s.id === 'review')

  /* records ------------------------------------------------------- */
  const sectionRecords = records[activeId] ?? []
  const currentIndex = Math.min(recordIndex[activeId] ?? 0, Math.max(sectionRecords.length - 1, 0))
  const currentRecord = sectionRecords[currentIndex]
  const chooseRecord = (index: number) => {
    setRecordIndex((current) => ({ ...current, [activeId]: index }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote('')
  }
  const updateRecord = (id: string, patch: Partial<PortalRecord>) =>
    setRecords((current) => ({ ...current, [activeId]: current[activeId].map((r) => r.id === id ? { ...r, ...patch } : r) }))

  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentRecord) return
    const missing = missingFields(event.currentTarget, currentRecord.fields)
    const data = new FormData(event.currentTarget)
    const fields = currentRecord.fields.map((f) => ({ ...f, value: f.kind === 'checkboxes' ? data.getAll(f.label).join(', ') : String(data.get(f.label) ?? '') }))
    const label = activeId === 'people' ? (String(data.get('Display name') ?? '').trim() || currentRecord.label) : currentRecord.label
    if (activeId === 'travel') {
      updateRecord(currentRecord.id, { fields, status: missing.length ? 'later' : 'complete', issue: missing.length ? 'Incomplete' : undefined })
      setFieldErrors({}); setSavedNote(missing.length ? 'Saved. Finish this trip once flights are booked.' : 'Saved.')
      return
    }
    if (missing.length) {
      setFieldErrors(Object.fromEntries(missing.map((f) => [f.label, `Enter ${f.label.toLowerCase()}.`])))
      updateRecord(currentRecord.id, { fields, label, status: 'attention', issue: `${missing[0].label} missing` })
      setSavedNote(''); focusFirstError(panelRef.current)
      return
    }
    updateRecord(currentRecord.id, { fields, label, status: 'complete', issue: undefined })
    setFieldErrors({}); setSavedNote('Saved.')
  }

  const addPerson = () => {
    const template = (records.people ?? [])[0]
    if (!template) return
    const person: PortalRecord = {
      id: `new-${Date.now()}`, label: 'New person', meta: 'Not saved yet', status: 'attention', issue: 'Details missing',
      fields: template.fields.map((f) => ({ ...f, value: f.label === 'Role' ? 'Contestant' : '' })),
    }
    setRecords((current) => ({ ...current, people: [...current.people, person] }))
    setRecordIndex((current) => ({ ...current, people: (records.people ?? []).length }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote('')
  }

  /* section actions ---------------------------------------------- */
  const finishRecords = () => {
    const pending = sectionRecords.filter((r) => r.status === 'attention')
    if (activeId === 'travel') {
      if (!stay.arrival || !stay.departure || stayProblem) {
        setSectionError('Add your arrival and departure dates first. Flights can wait.')
        document.getElementById('stay-arrival')?.focus()
        return
      }
      complete('travel'); return
    }
    if (pending.length) {
      setSectionError(<>Finish {pending.length === 1 ? 'this' : `these ${pending.length}`} first: {pending.map((r, i) => (
        <span key={r.id}>{i > 0 && ', '}<button type="button" className="reg-inline-btn" onClick={() => chooseRecord(sectionRecords.indexOf(r))}>{r.label}</button> ({r.issue?.toLowerCase()})</span>
      ))}.</>)
      return
    }
    complete(activeId)
  }

  const saveForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const missing = missingFields(event.currentTarget, section.fields ?? [])
    const errors: Record<string, string> = Object.fromEntries(missing.map((f) => [f.label, `Enter ${f.label.toLowerCase()}.`]))
    if (activeId === 'payment' && !proofName) errors.proof = 'Upload the bank’s proof of transfer to finish this step.'
    setFieldErrors(errors)
    if (Object.keys(errors).length) { focusFirstError(panelRef.current); return }
    complete(activeId)
  }

  const submitRegistration = () => {
    if (!allRequiredDone) { setSectionError('Finish the steps listed above before submitting.'); return }
    setSubmitted(true); setDone((current) => new Set(current).add('review')); setSectionError(null)
  }

  /* travel stay dates --------------------------------------------- */
  const nights = stay.arrival && stay.departure ? daysBetween(stay.arrival, stay.departure) : null
  const stayProblem = nights !== null && nights < 0 ? 'Departure must be on or after the arrival date.' : null
  const outsideWindow = stay.arrival && stay.departure && !stayProblem
    ? Math.max(0, daysBetween(stay.arrival, programmeWindow.first)) + Math.max(0, daysBetween(programmeWindow.last, stay.departure))
    : 0

  const copyReference = async () => {
    try { await navigator.clipboard.writeText(fees.reference); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked: the reference stays visible to copy by hand */ }
  }

  /* outstanding items for review ---------------------------------- */
  const outstanding = useMemo(() => {
    const items: { text: string; to: SectionId }[] = []
    required.forEach((s) => { if (!done.has(s.id)) items.push({ text: `Finish “${s.title}”`, to: s.id }) })
    if (!proofName) items.push({ text: 'Upload proof of payment', to: 'payment' })
    Object.entries(records).forEach(([id, list]) => list.filter((r) => r.status === 'attention')
      .forEach((r) => items.push({ text: `${r.label}: ${r.issue?.toLowerCase()}`, to: id as SectionId })))
    return items
  }, [done, proofName, records]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = statusOf(section)
  const locked = status === 'locked'
  const groupFields = (fields: Field[]) => {
    if (activeId !== 'people') return [{ legend: '', note: undefined as string | undefined, fields }]
    const used = new Set<string>()
    const groups = personFieldGroups.map((g) => {
      const list = g.labels.map((l) => fields.find((f) => f.label === l)).filter((f): f is Field => Boolean(f))
      list.forEach((f) => used.add(f.label))
      return { legend: g.legend, note: g.note, fields: list }
    }).filter((g) => g.fields.length)
    const rest = fields.filter((f) => !used.has(f.label))
    return rest.length ? [...groups, { legend: 'Other', note: undefined, fields: rest }] : groups
  }

  const stepNumber = (s: Section) => main.indexOf(s) + 1

  return (
    <div className="reg-workspace">
      <header className="reg-ws-head">
        <div className="reg-ws-who">
          <h2>{delegation.country}</h2>
          <p>{delegation.leaderName} · Team Leader</p>
        </div>
        <div className="reg-ws-progress">
          <p><strong>{submitted ? 'Submitted' : `${doneCount} of ${required.length}`}</strong>{submitted ? ' · you can still update travel and people' : ' steps done'}</p>
          <div className="reg-meter" role="progressbar" aria-label="Registration progress" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={doneCount}>
            <span style={{ transform: `scaleX(${doneCount / required.length})` }} />
          </div>
        </div>
        {!submitted && firstOpenStep && firstOpenStep.id !== activeId && (
          <button type="button" className="reg-btn reg-btn-quiet" onClick={() => open(firstOpenStep.id)}>
            Next: {firstOpenStep.title} <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="reg-ws-body">
        <nav className={`reg-rail${navOpen ? ' is-open' : ''}`} aria-label="Registration steps">
          <button type="button" className="reg-rail-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
            <span>{section.afterSubmission ? 'After you submit' : `Step ${stepNumber(section)} of ${main.length}`}</span>
            <strong>{section.title}</strong>
          </button>
          <ol>
            {main.map((s) => {
              const st = statusOf(s)
              return (
                <li key={s.id}>
                  <button type="button" className={`reg-rail-item is-${st}${s.id === activeId ? ' is-current' : ''}`} aria-current={s.id === activeId ? 'step' : undefined} onClick={() => open(s.id)}>
                    <StatusMark status={st} number={stepNumber(s)} />
                    <span className="reg-rail-text"><span>{s.title}</span><small>{statusLabel[st]}</small></span>
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="reg-rail-group" id="after-group">After you submit</p>
          <ul aria-labelledby="after-group">
            {after.map((s) => {
              const st = submitted ? 'todo' : statusOf(s)
              return (
                <li key={s.id}>
                  <button type="button" className={`reg-rail-item is-${st}${s.id === activeId ? ' is-current' : ''}`} aria-current={s.id === activeId ? 'step' : undefined} onClick={() => open(s.id)}>
                    <span className="reg-mark is-after" aria-hidden="true"><Clock size={13} /></span>
                    <span className="reg-rail-text"><span>{s.title}</span><small>{submitted ? 'Available' : statusLabel[st]}</small></span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="reg-restart" onClick={onRestart}>Restart the demo</button>
        </nav>

        <section className="reg-panel" ref={panelRef} aria-labelledby="reg-panel-title" key={activeId}>
          <header className="reg-panel-head">
            <h3 id="reg-panel-title" ref={titleRef} tabIndex={-1}>{section.title}</h3>
            <p>{section.intro}</p>
          </header>

          {locked && (
            <div className="reg-locked">
              <Lock size={22} aria-hidden="true" />
              <div>
                <p><strong>People opens once proof of payment is uploaded.</strong> This keeps registrations from being completed before fees are settled.</p>
                <button type="button" className="reg-btn reg-btn-primary" onClick={() => open('payment')}>Go to Payment <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </div>
          )}

          {activeId === 'start' && <>
            <ol className="reg-journey">
              <li><strong>Team and observers.</strong> Two numbers that set your fees.</li>
              <li><strong>Payment.</strong> Tell us how to invoice you, transfer, then upload proof.</li>
              <li><strong>Teams.</strong> Choose each team’s contest language.</li>
              <li><strong>People.</strong> Opens after payment. Fill it in stages if you need to.</li>
              <li><strong>Rooms and welfare.</strong> Check the summary built from your people.</li>
              <li><strong>Travel.</strong> Stay dates now; flights once they are booked.</li>
              <li><strong>Review and submit.</strong> You can still update people and travel afterwards.</li>
            </ol>
            <p className="reg-aside"><Info size={18} aria-hidden="true" />Your progress is kept on the right, and you can leave and come back at any time.</p>
            <div className="reg-panel-actions"><button type="button" className="reg-btn reg-btn-primary" onClick={() => complete('start')}>Start with team and observers <ArrowRight size={18} aria-hidden="true" /></button></div>
          </>}

          {(activeId === 'setup' || activeId === 'welfare') && (
            <form onSubmit={saveForm} noValidate>
              {section.facts && <Facts items={section.facts} />}
              <div className="reg-grid">
                {(section.fields ?? []).map((f) => <FieldControl key={f.label} field={f} idPrefix={activeId} error={fieldErrors[f.label]} />)}
              </div>
              <div className="reg-panel-actions">
                <button type="submit" className="reg-btn reg-btn-primary">{activeId === 'welfare' ? 'This is correct, continue' : 'Save and continue'} <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'payment' && (
            <form onSubmit={saveForm} noValidate>
              <div className="reg-pay-top">
                <section className="reg-block" aria-labelledby="pay-amount">
                  <h4 id="pay-amount">Amount to transfer</h4>
                  <table className="reg-fee-table">
                    <tbody>
                      {feeLines.map((line) => (
                        <tr key={line.label}><th scope="row">{line.label}<small>{line.detail}</small></th><td>{line.amount === null ? (fees.observers ? 'To be confirmed' : '—') : money(line.amount)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th scope="row">Total</th><td>{money(feeTotal)}</td></tr></tfoot>
                  </table>
                  <dl className="reg-ref">
                    <div><dt>Fee tier</dt><dd>{fees.tier}</dd></div>
                    <div><dt>Payment reference</dt><dd><span className="reg-code">{fees.reference}</span>
                      <button type="button" className="reg-copy" onClick={copyReference}><Copy size={14} aria-hidden="true" />{copied ? 'Copied' : 'Copy'}</button></dd></div>
                  </dl>
                  <span className="reg-visually-hidden" role="status">{copied ? 'Payment reference copied' : ''}</span>
                </section>

                <section className="reg-block" aria-labelledby="pay-how">
                  <h4 id="pay-how">How to pay</h4>
                  <ol className="reg-how">
                    <li>Fill in the invoice details below. Invoices can’t be split after you transfer.</li>
                    <li><button type="button" className="reg-inline-btn" onClick={openInvoice}><Download size={14} aria-hidden="true" />Download the invoice</button></li>
                    <li>Transfer the <strong>full amount</strong> to สอวน (POSN) at SCB. Choose <strong>OUR</strong> for bank charges, and put the payment reference in the description.</li>
                    <li>Upload the bank’s proof of transfer. People opens straight after.</li>
                  </ol>
                  <p className="reg-aside"><Info size={18} aria-hidden="true" />Account name, number and SWIFT code appear here once Finance approves them.</p>
                </section>
              </div>

              <fieldset className="reg-fieldset">
                <legend>Invoice details</legend>
                <div className="reg-grid">
                  {(section.fields ?? []).map((f) => <FieldControl key={f.label} field={f} idPrefix="payment" error={fieldErrors[f.label]} />)}
                </div>
              </fieldset>

              <div className={`reg-field reg-field-wide reg-proof${fieldErrors.proof ? ' has-error' : ''}`}>
                <span className="reg-label-text" id="proof-label">Proof of transfer</span>
                <p className="reg-hint" id="proof-hint">The bank’s confirmation or a screenshot of the completed transfer. PDF, JPG or PNG, up to 10 MB.</p>
                {fieldErrors.proof && <p className="reg-error" id="proof-error"><CircleAlert size={16} aria-hidden="true" />{fieldErrors.proof}</p>}
                <label className={`reg-dropzone${proofName ? ' is-filled' : ''}${fieldErrors.proof ? ' has-error' : ''}`}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" aria-labelledby="proof-label" aria-describedby={`proof-hint${fieldErrors.proof ? ' proof-error' : ''}`}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) { setProofName(file.name); setFieldErrors((c) => { const { proof: _, ...rest } = c; return rest }) } }} />
                  {proofName
                    ? <><Check size={22} strokeWidth={2.6} aria-hidden="true" /><span><strong>{proofName}</strong>Uploaded. Finance will check it against the bank statement.</span><span className="reg-dropzone-action">Replace</span></>
                    : <><Upload size={22} aria-hidden="true" /><span><strong>Choose a file</strong>or drag it here</span></>}
                </label>
              </div>
              {!proofName && <button type="button" className="reg-demo-btn" onClick={() => setProofName('transfer-iol2027.pdf')}>Demo: use a sample file</button>}

              <Facts compact items={[
                { label: 'Finance check', value: proofName ? 'Waiting for Finance' : 'Waiting for your proof' },
                { label: 'E-receipt', value: 'Emailed after Finance approves the payment' },
              ]} />

              <div className="reg-panel-actions">
                <button type="submit" className="reg-btn reg-btn-primary">Save and continue <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'travel' && (
            <fieldset className="reg-fieldset reg-stay">
              <legend>Stay dates</legend>
              <p className="reg-hint">The programme runs from {formatDate(programmeWindow.first)} to {formatDate(programmeWindow.last)} 2027.</p>
              <div className="reg-grid">
                <div className="reg-field">
                  <label htmlFor="stay-arrival">Arrival date</label>
                  <p className="reg-hint" id="stay-arrival-hint">Your first night at the official hotel.</p>
                  <input id="stay-arrival" type="date" className="reg-control" value={stay.arrival} onChange={(e) => { setStay((s) => ({ ...s, arrival: e.target.value })); setSectionError(null) }} aria-describedby="stay-arrival-hint" />
                </div>
                <div className={`reg-field${stayProblem ? ' has-error' : ''}`}>
                  <label htmlFor="stay-departure">Departure date</label>
                  <p className="reg-hint" id="stay-departure-hint">The day you leave the hotel.</p>
                  {stayProblem && <p className="reg-error" id="stay-departure-error"><CircleAlert size={16} aria-hidden="true" />{stayProblem}</p>}
                  <input id="stay-departure" type="date" className="reg-control" value={stay.departure} min={stay.arrival || undefined} onChange={(e) => { setStay((s) => ({ ...s, departure: e.target.value })); setSectionError(null) }} aria-describedby={`stay-departure-hint${stayProblem ? ' stay-departure-error' : ''}`} aria-invalid={stayProblem ? true : undefined} />
                </div>
              </div>
              <p className="reg-nights" role="status">
                {nights !== null && !stayProblem && <><strong>{nights} {nights === 1 ? 'night' : 'nights'}</strong> at the official hotel{outsideWindow > 0 ? `, ${outsideWindow} outside the programme dates.` : '.'}</>}
              </p>
              {outsideWindow > 0 && (
                <FieldControl idPrefix="stay" field={{ label: 'Why you need the extra nights', value: '', kind: 'textarea', optional: true, help: 'So the organisers can check hotel availability and any extra cost.' }} />
              )}
            </fieldset>
          )}

          {section.records && !locked && (
            <div className={`reg-records${recordOpen ? ' is-open' : ''}`}>
              <div className="reg-record-list">
                <div className="reg-record-list-head">
                  <h4>{activeId === 'travel' ? 'Flights' : `${sectionRecords.length} ${section.records.plural}`}</h4>
                  {activeId === 'people' && <button type="button" className="reg-btn-link" onClick={addPerson}><UserPlus size={16} aria-hidden="true" />Add person</button>}
                </div>
                {activeId === 'travel' && <p className="reg-hint">Add these once flights are booked. You can change them until the travel deadline.</p>}
                <ul>
                  {sectionRecords.map((record, index) => (
                    <li key={record.id}>
                      <button type="button" className={`reg-record${index === currentIndex ? ' is-current' : ''}`} aria-current={index === currentIndex ? 'true' : undefined} onClick={() => chooseRecord(index)}>
                        <span className="reg-record-name"><strong>{record.label}</strong><small>{record.meta}</small></span>
                        {recordChip(record)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {currentRecord && (
                <form className="reg-record-editor" onSubmit={saveRecord} noValidate key={currentRecord.id}>
                  <button type="button" className="reg-btn-link reg-back-to-list" onClick={() => setRecordOpen(false)}><ArrowLeft size={16} aria-hidden="true" />All {section.records.plural}</button>
                  <div className="reg-editor-head">
                    <h4>{currentRecord.label}</h4>
                    {recordChip(currentRecord)}
                  </div>
                  {currentRecord.facts && <Facts compact items={currentRecord.facts} />}
                  {groupFields(currentRecord.fields).map((group) => group.legend ? (
                    <fieldset className="reg-fieldset" key={group.legend}>
                      <legend>{group.legend}</legend>
                      {group.note && <p className="reg-hint">{group.note}</p>}
                      <div className="reg-grid">{group.fields.map((f) => <FieldControl key={f.label} field={f} idPrefix={`${activeId}-${currentRecord.id}`} error={fieldErrors[f.label]} />)}</div>
                    </fieldset>
                  ) : (
                    <div className="reg-grid" key="fields">{group.fields.map((f) => <FieldControl key={f.label} field={f} idPrefix={`${activeId}-${currentRecord.id}`} error={fieldErrors[f.label]} />)}</div>
                  ))}
                  <div className="reg-editor-actions">
                    <button type="submit" className="reg-btn reg-btn-secondary">Save {section.records.noun}</button>
                    <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>
                  </div>
                </form>
              )}
            </div>
          )}

          {section.records && !locked && (
            <div className="reg-panel-actions">
              {sectionError && <p className="reg-error reg-section-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{sectionError}</span></p>}
              <button type="button" className="reg-btn reg-btn-primary" onClick={finishRecords}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          )}

          {activeId === 'review' && (submitted ? (
            <div className="reg-submitted">
              <Check size={28} strokeWidth={2.6} aria-hidden="true" />
              <div>
                <p><strong>Registration submitted.</strong> We have emailed a copy to {delegation.leaderEmail}.</p>
                <p>Finance will check your payment next. You can still update people and travel until the change deadline.</p>
              </div>
            </div>
          ) : <>
            {outstanding.length > 0 ? (
              <section className="reg-block" aria-labelledby="review-left">
                <h4 id="review-left">Still to do</h4>
                <ul className="reg-todo">
                  {outstanding.map((item) => <li key={item.text}><button type="button" className="reg-inline-btn" onClick={() => open(item.to)}>{item.text}</button></li>)}
                </ul>
              </section>
            ) : <p className="reg-aside reg-aside-ok"><Check size={18} strokeWidth={3} aria-hidden="true" />Everything is ready to submit.</p>}
            <h4 className="reg-subhead">After you submit</h4>
            <Facts items={section.facts ?? []} />
            <div className="reg-panel-actions">
              {sectionError && <p className="reg-error reg-section-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{sectionError}</span></p>}
              <button type="button" className="reg-btn reg-btn-primary" onClick={submitRegistration}>Submit registration</button>
            </div>
          </>)}

          {activeId === 'badges' && <>
            <Facts items={section.facts ?? []} />
            <p className="reg-aside"><Info size={18} aria-hidden="true" />Staff use the <a href="/registration/check-in">badge scanner</a> during event week.</p>
          </>}
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TeamLeaderPortal() {
  const [signedIn, setSignedIn] = useState(false)
  const [run, setRun] = useState(0)
  const restart = () => { setSignedIn(false); setRun((n) => n + 1); window.scrollTo({ top: 0 }) }
  return (
    <div className="reg-page">
      <header className="reg-intro">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="reg-breadcrumb"><a href="/registration">Registration</a><span aria-hidden="true">/</span><span aria-current="page">Team Leader</span></nav>
          <h1>Set up your team.</h1>
          <p>Verify your invitation, create the Team Leader account, then register your teams in stages. Personal details can come later.</p>
        </div>
      </header>
      <div className="reg-shell wrap">
        <p className="reg-proto"><Info size={16} aria-hidden="true" />Prototype: nothing you enter here is saved or sent.</p>
        {signedIn ? <Workspace key={run} onRestart={restart} /> : <AccountSetup key={run} onDone={() => setSignedIn(true)} />}
      </div>
    </div>
  )
}
