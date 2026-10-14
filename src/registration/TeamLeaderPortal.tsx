import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock, Copy, Download, Info, Lock, LogOut, MailCheck, ShieldCheck, Upload, UserPlus } from 'lucide-react'
import { api, ApiError, roleLabel, type DelegationData, type Member, type User } from './api'
import { personFieldGroups, programmeWindow, sections, selectOptions, type Field, type PortalRecord, type Section, type SectionId } from './portalData'
import { missingPersonFields, personFields, personPayload, personRecord, teamRecord, tripPayload, tripRecord, welfareFacts } from './live'
import { openInvoice } from './invoice'
import StaffHome from './StaffHome'
import './registration.css'

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')

/* ------------------------------------------------------------------ */
/* Shared form pieces                                                  */
/* ------------------------------------------------------------------ */

type FieldProps = { field: Field; idPrefix: string; error?: string; wide?: boolean; disabled?: boolean }

function FieldControl({ field, idPrefix, error, wide, disabled }: FieldProps) {
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
      <fieldset className={`reg-field reg-field-wide${error ? ' has-error' : ''}`} aria-describedby={describedBy} disabled={disabled}>
        <legend>{field.label}{field.optional && <span className="reg-optional"> (optional)</span>}</legend>
        {field.help && <p className="reg-hint" id={hintId}>{field.help}</p>}
        {error && <p className="reg-error" id={errorId}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
        {options.length ? (
          <div className="reg-checks">
            {options.map((option) => (
              <label key={option} className="reg-check">
                <input type="checkbox" name={field.label} value={option} defaultChecked={chosen.includes(option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
        ) : <p className="reg-hint">Add people first.</p>}
      </fieldset>
    )
  }

  const common = {
    id, name: field.label, defaultValue: field.value, disabled,
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

function focusFirstError(container: HTMLElement | null) {
  requestAnimationFrame(() => container?.querySelector<HTMLElement>('[aria-invalid="true"], .reg-dropzone.has-error input')?.focus())
}

function Alert({ children }: { children: ReactNode }) {
  return children ? <p className="reg-error reg-section-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{children}</span></p> : null
}

/* ------------------------------------------------------------------ */
/* Signing in and creating an account                                  */
/* ------------------------------------------------------------------ */

const accountSteps = ['Invitation', 'Account', 'Email code']

function Stepper({ step, onBack }: { step: number; onBack?: (index: number) => void }) {
  return (
    <ol className="reg-stepper" aria-label="Account setup">
      {accountSteps.map((label, index) => {
        const state = index < step ? 'done' : index === step ? 'current' : 'upcoming'
        const marker = <span className="reg-stepper-mark" aria-hidden="true">{state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
        return (
          <li key={label} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' && onBack
              ? <button type="button" onClick={() => onBack(index)}>{marker}<span className="reg-stepper-label">{label}</span><span className="reg-visually-hidden"> (completed, go back)</span></button>
              : <span className="reg-stepper-static">{marker}<span className="reg-stepper-label">{label}</span></span>}
          </li>
        )
      })}
    </ol>
  )
}

function useStepFocus(step: number | string) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    headingRef.current?.focus({ preventScroll: true })
    const top = rootRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0 || top > window.innerHeight * 0.6) rootRef.current?.scrollIntoView({ block: 'start' })
  }, [step])
  return { headingRef, rootRef }
}

function TextField({ name, label, hint, error, ...input }: { name: string; label: string; hint?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `acc-${name}`
  return (
    <div className={`reg-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && <p className="reg-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="reg-error" id={`${id}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      <input id={id} name={name} className="reg-control" aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} {...input} />
    </div>
  )
}

function SignIn({ onSignedIn, notice }: { onSignedIn: (user: User) => void; notice?: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const result = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: { email: data.get('email'), password: data.get('password') } })
      onSignedIn(result.user)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="reg-account-card" onSubmit={submit} noValidate>
      <h2>Sign in</h2>
      <p className="reg-lede">For Team Leaders who already have an account, and for organising staff.</p>
      {notice && <p className="reg-aside"><Info size={18} aria-hidden="true" />{notice}</p>}
      {error && <Alert>{error}</Alert>}
      <TextField name="email" label="Email address" type="email" autoComplete="email" required />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
      <div className="reg-account-actions">
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={18} aria-hidden="true" /></button>
      </div>
      <p className="reg-reassure"><Info size={18} aria-hidden="true" /><span>Forgot your password? Email <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a>. Self-service reset is coming.</span></p>
    </form>
  )
}

function SignUp({ onCreated }: { onCreated: (user: User, developmentCode?: string) => void }) {
  const [step, setStep] = useState(0)
  const [invite, setInvite] = useState<{ code: string; countryTerritory: string; accreditedOrganisation: string | null } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const { headingRef, rootRef } = useStepFocus(step)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '').trim()
    const found: Record<string, string> = {}
    if (step === 0 && !/^IOL2027-[A-Z]{3}-[A-Z0-9]{4}$/i.test(value('code'))) found.code = 'Enter the code in the format IOL2027-ABC-1234. It is in the invitation email from the organisers.'
    if (step === 1) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) found.email = 'Enter an email address like name@example.org.'
      if (!value('name')) found.name = 'Enter the Team Leader’s full name.'
      if (String(data.get('password') ?? '').length < 12) found.password = 'Use at least 12 characters.'
    }
    setErrors(found)
    if (Object.keys(found).length) { focusFirstError(formRef.current); return }
    setBusy(true)
    try {
      if (step === 0) {
        const result = await api<{ invite: { code: string; countryTerritory: string; accreditedOrganisation: string | null } }>('/api/registration/invite/verify', { method: 'POST', body: { code: value('code') } })
        setInvite(result.invite); setStep(1)
      } else if (invite) {
        const result = await api<{ user: User; developmentCode?: string }>('/api/registration/team-leader-account', {
          method: 'POST', body: { inviteCode: invite.code, email: value('email'), fullName: value('name'), password: String(data.get('password')) },
        })
        onCreated(result.user, result.developmentCode)
      }
    } catch (e) {
      setErrors({ [step === 0 ? 'code' : 'email']: messageOf(e) })
      focusFirstError(formRef.current)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef}>
      <Stepper step={step} onBack={(index) => { setErrors({}); setStep(index) }} />
      <form ref={formRef} className="reg-account-card" onSubmit={submit} noValidate key={step}>
        {step === 0 && <>
          <h2 ref={headingRef} tabIndex={-1}>Enter your invitation code</h2>
          <p className="reg-lede">Each country or territory receives one code by email. It links your account to the right country and team allowance.</p>
          <TextField name="code" label="Invitation code" hint="Example: IOL2027-ABC-1234" error={errors.code} className="reg-control reg-control-code" autoComplete="off" spellCheck={false} defaultValue={invite?.code} />
          <p className="reg-reassure"><ShieldCheck size={18} aria-hidden="true" />Only the official contact for each country receives a code.</p>
          <div className="reg-account-actions"><button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Check code'} <ArrowRight size={18} aria-hidden="true" /></button></div>
        </>}
        {step === 1 && invite && <>
          <h2 ref={headingRef} tabIndex={-1}>Create the Team Leader account</h2>
          <p className="reg-lede">You will use this account for the whole registration, so use an address your team can rely on.</p>
          <div className="reg-confirmed">
            <Check size={18} strokeWidth={3} aria-hidden="true" />
            <div><strong>{invite.countryTerritory}</strong><span>{invite.accreditedOrganisation ? `${invite.accreditedOrganisation} · ` : ''}set by your invitation code</span></div>
          </div>
          <TextField name="email" label="Email address" hint="For signing in and for official notices from the organisers." error={errors.email} type="email" autoComplete="email" />
          <TextField name="name" label="Full name" hint="Entered once and reused on teams, badges and letters." error={errors.name} autoComplete="name" />
          <TextField name="password" label="Password" hint="At least 12 characters." error={errors.password} type="password" autoComplete="new-password" />
          <div className="reg-account-actions">
            <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'} <ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" className="reg-btn-link" onClick={() => { setErrors({}); setStep(0) }}><ArrowLeft size={16} aria-hidden="true" />Back</button>
          </div>
        </>}
      </form>
    </div>
  )
}

function VerifyEmail({ user, developmentCode, showStepper, onVerified, onSignOut }: {
  user: User; developmentCode?: string; showStepper: boolean; onVerified: (user: User) => void; onSignOut: () => void
}) {
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [code, setCode] = useState(developmentCode)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const otp = String(new FormData(event.currentTarget).get('otp') ?? '').trim()
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6 digits from the email.'); return }
    setBusy(true); setError('')
    try { onVerified((await api<{ user: User }>('/api/auth/verify-email', { method: 'POST', body: { code: otp } })).user) }
    catch (e) { setError(messageOf(e)) }
    finally { setBusy(false) }
  }
  const resend = async () => {
    setError(''); setStatus('')
    try {
      const result = await api<{ developmentCode?: string }>('/api/auth/verify-email/request', { method: 'POST' })
      if (result.developmentCode) setCode(result.developmentCode)
      setStatus(`A new code is on its way to ${user.email}.`)
    } catch (e) { setError(messageOf(e)) }
  }
  return (
    <div>
      {showStepper && <Stepper step={2} />}
      <form className="reg-account-card" onSubmit={submit} noValidate>
        <h2>Check your email</h2>
        <p className="reg-lede">We sent a 6-digit code to <strong>{user.email}</strong>. It expires in 30 minutes.</p>
        {code && <p className="reg-devcode" role="status"><Info size={18} aria-hidden="true" /><span>Test server: email sending is switched off, so here is your code: <strong>{code}</strong></span></p>}
        <div className={`reg-field${error ? ' has-error' : ''}`}>
          <label htmlFor="acc-otp">Code from the email</label>
          {error && <p className="reg-error" id="acc-otp-error"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
          <input id="acc-otp" name="otp" className="reg-control reg-control-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-invalid={error ? true : undefined} aria-describedby={error ? 'acc-otp-error' : undefined} />
        </div>
        <p className="reg-reassure"><MailCheck size={18} aria-hidden="true" />
          <span>No email? Check spam, or <button type="button" className="reg-inline-btn" onClick={resend}>send a new code</button>. Wrong address? <button type="button" className="reg-inline-btn" onClick={onSignOut}>Sign out</button> and contact the organisers.</span>
        </p>
        <p className="reg-status-line" role="status">{status}</p>
        <div className="reg-account-actions"><button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'} <ArrowRight size={18} aria-hidden="true" /></button></div>
      </form>
    </div>
  )
}

function Entry({ onSignedIn, onCreated, notice }: { onSignedIn: (user: User) => void; onCreated: (user: User, code?: string) => void; notice?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  return (
    <div className="reg-account">
      <div className="reg-switch" role="group" aria-label="How do you want to start?">
        <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'active' : undefined} onClick={() => setMode('signin')}>Sign in</button>
        <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'active' : undefined} onClick={() => setMode('signup')}>I have an invitation code</button>
      </div>
      {mode === 'signin' ? <SignIn onSignedIn={onSignedIn} notice={notice} /> : <SignUp onCreated={onCreated} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Team Leader workspace                                               */
/* ------------------------------------------------------------------ */

type StepStatus = 'done' | 'todo' | 'locked' | 'info' | 'waiting' | 'after'
const statusLabel: Record<StepStatus, string> = {
  done: 'Done', todo: 'To do', locked: 'Opens after payment', info: 'Read first', waiting: 'After the steps above', after: 'After you submit',
}
const paymentLabel: Record<string, string> = {
  none: 'Payment: invoice details not saved yet', awaiting_proof: 'Payment: waiting for proof', awaiting_review: 'Payment: waiting for Finance',
  approved: 'Payment approved', rejected: 'Payment: proof returned', refunded: 'Payment refunded',
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

const NEW_PERSON = 'new-person'
const main = sections.filter((s) => !s.afterSubmission)
const after = sections.filter((s) => s.afterSubmission)
const required = sections.filter((s) => s.required)

function Workspace({ user, onSessionEnd }: { user: User; onSessionEnd: () => void }) {
  const [data, setData] = useState<DelegationData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [activeId, setActiveId] = useState<SectionId>('start')
  const [selected, setSelected] = useState<Partial<Record<SectionId, string>>>({})
  const [draftOpen, setDraftOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [sectionError, setSectionError] = useState<ReactNode>(null)
  const [savedNote, setSavedNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [stay, setStay] = useState({ arrival: '', departure: '' })
  const [stayNote, setStayNote] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const invoiceRef = useRef<HTMLFormElement>(null)
  const firstRender = useRef(true)

  const load = useCallback(async () => {
    const next = await api<DelegationData>(`/api/registration/delegations/${user.delegationId}`)
    setData(next)
    return next
  }, [user.delegationId])

  useEffect(() => {
    load().then((d) => {
      setStay({ arrival: d.delegation.declaredArrivalDate ?? '', departure: d.delegation.declaredDepartureDate ?? '' })
      const steps = new Set(d.delegation.completedSteps)
      const paid = d.payments[0] && ['awaiting_review', 'approved'].includes(d.payments[0].status)
      if (d.delegation.registrationStatus !== 'draft') setActiveId('review')
      else if (steps.has('start')) setActiveId(required.find((s) => (s.id === 'payment' ? !paid : !steps.has(s.id)))?.id ?? 'review')
    }).catch((e) => { if (e instanceof ApiError && e.status === 401) onSessionEnd(); else setLoadError(messageOf(e)) })
  }, [load, onSessionEnd])

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    titleRef.current?.focus({ preventScroll: true })
    const top = panelRef.current?.getBoundingClientRect().top ?? 0
    if (top < 100 || top > window.innerHeight * 0.6) panelRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [activeId, recordOpen])

  const derived = useMemo(() => {
    if (!data) return null
    const d = data.delegation
    const steps = new Set(d.completedSteps)
    const payment = data.payments[0]
    const paymentDone = Boolean(payment && ['awaiting_review', 'approved'].includes(payment.status))
    const submitted = d.registrationStatus !== 'draft'
    const draftMember = { role: 'contestant' as const, teamId: data.teams[0]?.id ?? null }
    const records: Partial<Record<SectionId, PortalRecord[]>> = {
      teams: data.teams.map((t) => teamRecord(t, data)),
      people: [
        ...data.members.map((m) => personRecord(m, data.teams)),
        ...(draftOpen ? [{ id: NEW_PERSON, label: 'New person', meta: 'Not saved yet', status: 'attention' as const, issue: 'Not saved yet', fields: personFields(draftMember, data.teams) }] : []),
      ],
      travel: (['arrival', 'departure'] as const).map((dir) => tripRecord(dir, data.travelRecords.find((t) => t.direction === dir), data.members)),
    }
    return { d, steps, payment, paymentDone, submitted, records }
  }, [data, draftOpen])

  if (loadError) return <div className="reg-panel"><Alert>{loadError}</Alert></div>
  if (!data || !derived) return <p className="reg-loading" role="status">Loading your registration…</p>

  const { d, steps, payment, paymentDone, submitted, records } = derived
  const isDone = (id: SectionId) => (id === 'payment' ? paymentDone : id === 'review' ? submitted : steps.has(id))
  const doneCount = required.filter((s) => isDone(s.id)).length
  const allRequiredDone = doneCount === required.length
  const statusOf = (s: Section): StepStatus => {
    if (s.id === 'people' && !paymentDone) return 'locked'
    if (isDone(s.id)) return 'done'
    if (s.id === 'start') return 'info'
    if (s.id === 'review') return allRequiredDone ? 'todo' : 'waiting'
    if (s.afterSubmission) return submitted ? 'todo' : 'after'
    return 'todo'
  }
  const section = sections.find((s) => s.id === activeId)!
  const status = statusOf(section)
  const locked = status === 'locked'
  const firstOpenStep = main.find((s) => s.required && !isDone(s.id) && statusOf(s) !== 'locked') ?? main.find((s) => s.id === 'review')
  const stepNumber = (s: Section) => main.indexOf(s) + 1
  const nextOf = (id: SectionId) => main[main.findIndex((s) => s.id === id) + 1]?.id

  const open = (id: SectionId) => {
    setActiveId(id); setNavOpen(false); setRecordOpen(false)
    setFieldErrors({}); setSectionError(null); setSavedNote('')
  }

  /** Runs a server action, reloads, and turns failures into a visible message. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setSectionError(null)
    try {
      await work()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { onSessionEnd(); return }
      setSectionError(e instanceof ApiError && e.missing?.length ? <>Still needed: {e.missing.join(', ')}.</> : messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  const patchDelegation = (body: Record<string, unknown>) => api(`/api/registration/delegations/${d.id}`, { method: 'PATCH', body })
  const finishStep = async (id: SectionId, extra: Record<string, unknown> = {}) => {
    await patchDelegation({ ...extra, completedSteps: [...new Set([...d.completedSteps, id])] })
    await load()
    const next = nextOf(id)
    if (next) open(next)
  }

  /* records ------------------------------------------------------- */
  const sectionRecords = records[activeId] ?? []
  const currentRecord = sectionRecords.find((r) => r.id === selected[activeId]) ?? sectionRecords[0]
  const chooseRecord = (id: string) => {
    setSelected((s) => ({ ...s, [activeId]: id }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote('')
  }

  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentRecord) return
    const form = new FormData(event.currentTarget)
    run(async () => {
      if (activeId === 'teams') {
        await api(`/api/registration/teams/${currentRecord.id}`, { method: 'PATCH', body: { name: String(form.get('Team name') ?? '').trim() || currentRecord.label, contestLanguage: String(form.get('Team contest language') ?? '') || null } })
        await load()
        setSavedNote('Saved.')
      } else if (activeId === 'travel') {
        const direction = currentRecord.id.endsWith('arrival') || currentRecord.label === 'Arrival' ? 'arrival' : 'departure'
        const body = tripPayload(form, direction, data.members)
        if (currentRecord.id.startsWith('new-')) await api(`/api/registration/delegations/${d.id}/travel`, { method: 'POST', body })
        else await api(`/api/registration/travel/${currentRecord.id}`, { method: 'PATCH', body })
        const fresh = await load()
        const saved = fresh.travelRecords.find((t) => t.direction === direction)
        if (saved) setSelected((s) => ({ ...s, travel: saved.id }))
        setSavedNote(body.travelPoint && body.flightServiceNumber && body.localDate && body.localTime ? 'Saved.' : 'Saved. Finish this trip once flights are booked.')
      } else if (activeId === 'people') {
        const member = data.members.find((m) => m.id === currentRecord.id)
        const role = member?.role ?? 'contestant'
        const payload = personPayload(form, role, data.teams)
        if (!payload.displayName) { setFieldErrors({ 'Display name': 'Enter a name so we can save this person.' }); focusFirstError(panelRef.current); return }
        let id = currentRecord.id
        if (currentRecord.id === NEW_PERSON) {
          id = (await api<{ member: Member }>(`/api/registration/delegations/${d.id}/members`, { method: 'POST', body: payload })).member.id
          setDraftOpen(false)
          setSelected((s) => ({ ...s, people: id }))
        } else {
          await api(`/api/registration/members/${id}`, { method: 'PATCH', body: payload })
        }
        const fresh = await load()
        const saved = fresh.members.find((m) => m.id === id)
        const missing = saved ? missingPersonFields(saved) : []
        setFieldErrors({})
        setSavedNote(missing.length ? `Saved. Still needed before you submit: ${missing.map((f) => f.label.toLowerCase()).join(', ')}.` : 'Saved.')
      }
    })
  }

  const addPerson = () => {
    setDraftOpen(true)
    setSelected((s) => ({ ...s, people: NEW_PERSON }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote('')
  }

  const finishRecords = () => {
    if (activeId === 'travel') {
      if (!stay.arrival || !stay.departure || stayProblem) {
        setSectionError('Add your arrival and departure dates first. Flights can wait.')
        document.getElementById('stay-arrival')?.focus()
        return
      }
      run(() => finishStep('travel', { declaredArrivalDate: stay.arrival, declaredDepartureDate: stay.departure, stayWindowNote: outsideWindow > 0 ? stayNote || null : null }))
      return
    }
    const pending = sectionRecords.filter((r) => r.status === 'attention')
    if (pending.length) {
      setSectionError(<>Finish {pending.length === 1 ? 'this' : `these ${pending.length}`} first: {pending.map((r, i) => (
        <span key={r.id}>{i > 0 && ', '}<button type="button" className="reg-inline-btn" onClick={() => chooseRecord(r.id)}>{r.label}</button> ({r.issue?.toLowerCase()})</span>
      ))}.</>)
      return
    }
    run(() => finishStep(activeId))
  }

  /* setup, payment, welfare --------------------------------------- */
  const saveSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const teams = Number(form.get('Number of teams'))
    const observers = Number(form.get('Number of observers'))
    const errors: Record<string, string> = {}
    if (![1, 2].includes(teams)) errors['Number of teams'] = 'Choose one or two teams.'
    if (!Number.isInteger(observers) || observers < 0 || observers > 20) errors['Number of observers'] = 'Enter a whole number from 0 to 20.'
    setFieldErrors(errors)
    if (Object.keys(errors).length) { focusFirstError(panelRef.current); return }
    run(() => finishStep('setup', { numberOfTeams: teams, numberOfObservers: observers }))
  }

  const invoiceBody = () => {
    const form = new FormData(invoiceRef.current!)
    return {
      recipientName: String(form.get('Invoice recipient name') ?? '').trim(),
      recipientAddress: String(form.get('Invoice recipient address') ?? '').trim(),
      invoiceCount: Number(form.get('Number of invoices') || 1),
      splitNote: String(form.get('How to split the invoices') ?? '').trim(),
    }
  }
  const saveInvoice = async () => {
    const body = invoiceBody()
    if (!body.recipientName) { setFieldErrors({ 'Invoice recipient name': 'Enter the organisation named on the invoice.' }); focusFirstError(panelRef.current); return false }
    if (!Number.isInteger(body.invoiceCount) || body.invoiceCount < 1 || body.invoiceCount > 10) { setFieldErrors({ 'Number of invoices': 'Enter a number from 1 to 10.' }); focusFirstError(panelRef.current); return false }
    setFieldErrors({})
    await api(`/api/registration/delegations/${d.id}/invoice`, { method: 'PUT', body })
    await load()
    return true
  }
  const uploadProof = (file: File) => run(async () => {
    const form = new FormData()
    form.append('proof', file)
    await api(`/api/registration/delegations/${d.id}/payment-proof`, { method: 'POST', form })
    await load()
    setFieldErrors({})
  })
  const savePayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paymentDone) { open('teams'); return }
    run(async () => {
      if (!(await saveInvoice())) return
      setFieldErrors({ proof: 'Upload the bank’s proof of transfer to finish this step. Your invoice details are saved.' })
      focusFirstError(panelRef.current)
    })
  }

  const saveWelfare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get('Anything else the welfare team should know') ?? '').trim()
    run(() => finishStep('welfare', { welfareNote: note || null }))
  }

  /* travel stay dates --------------------------------------------- */
  const nights = stay.arrival && stay.departure ? daysBetween(stay.arrival, stay.departure) : null
  const stayProblem = nights !== null && nights < 0 ? 'Departure must be on or after the arrival date.' : null
  const outsideWindow = stay.arrival && stay.departure && !stayProblem
    ? Math.max(0, daysBetween(stay.arrival, programmeWindow.first)) + Math.max(0, daysBetween(programmeWindow.last, stay.departure))
    : 0
  const changeStay = (next: { arrival: string; departure: string }) => {
    setStay(next); setSectionError(null)
    const bad = next.arrival && next.departure && next.departure < next.arrival
    if (!bad) patchDelegation({ declaredArrivalDate: next.arrival || null, declaredDepartureDate: next.departure || null }).then(load).catch((e) => setSectionError(messageOf(e)))
  }

  const copyReference = async () => {
    if (!payment) return
    try { await navigator.clipboard.writeText(payment.paymentReference); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked: the reference stays visible to copy by hand */ }
  }

  /* outstanding items for review ---------------------------------- */
  const outstanding: { text: string; to: SectionId }[] = []
  required.forEach((s) => { if (!isDone(s.id)) outstanding.push({ text: s.id === 'payment' ? 'Upload proof of payment' : `Finish “${s.title}”`, to: s.id }) })
  if (!d.declaredArrivalDate || !d.declaredDepartureDate) outstanding.push({ text: 'Add your stay dates', to: 'travel' })
  for (const id of ['teams', 'people'] as const) {
    (records[id] ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).forEach((r) => outstanding.push({ text: `${r.label}: ${r.issue?.toLowerCase()}`, to: id }))
  }
  const submit = () => {
    if (outstanding.length) { setSectionError('Finish the items listed above before submitting.'); return }
    run(async () => { await api(`/api/registration/delegations/${d.id}/submit`, { method: 'POST' }); await load() })
  }

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

  const proofAttachment = payment?.proofAttachmentId ? data.attachments.find((a) => a.id === payment.proofAttachmentId) : undefined
  const canUpload = Boolean(payment && ['awaiting_proof', 'rejected'].includes(payment.status))
  const money = (n: number) => `${data.fees.currency} ${n.toLocaleString('en-US')}`

  return (
    <div className="reg-workspace">
      <header className="reg-ws-head">
        <div className="reg-ws-who">
          <h2>{d.countryTerritory}</h2>
          <p>{d.primaryTeamLeaderName} · Team Leader</p>
          <ul className="reg-ws-summary" aria-label="Delegation summary">
            <li>{d.numberOfTeams} {d.numberOfTeams === 1 ? 'team' : 'teams'} · up to {d.numberOfTeams * 4} contestants</li>
            <li>{d.numberOfObservers} {d.numberOfObservers === 1 ? 'observer' : 'observers'}</li>
            <li>{submitted ? 'Registration submitted' : paymentLabel[payment?.status ?? 'none']}</li>
          </ul>
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
              const st = statusOf(s)
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
        </nav>

        <section className="reg-panel" ref={panelRef} aria-labelledby="reg-panel-title" aria-busy={busy} key={activeId}>
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
            <p className="reg-aside"><Info size={18} aria-hidden="true" />Everything you save is kept, so you can leave and come back at any time.</p>
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={() => run(() => finishStep('start'))}>Start with team and observers <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </>}

          {activeId === 'setup' && (
            <form onSubmit={saveSetup} noValidate>
              <Facts items={[
                { label: 'Team Leader', value: `${d.primaryTeamLeaderName} · ${d.teamLeaderEmail}`, help: 'From your verified account.' },
                { label: 'Country', value: `${d.countryTerritory} · set by your invitation code` },
                { label: 'Rooms', value: 'Assigned by the organisers', help: 'Team Leaders and observers get single rooms; contestants share same-gender rooms.' },
              ]} />
              <div className="reg-grid">
                <FieldControl idPrefix="setup" error={fieldErrors['Number of teams']} field={{ label: 'Number of teams', value: String(d.numberOfTeams), kind: 'select', help: 'Up to two teams per country or territory.' }} />
                <FieldControl idPrefix="setup" error={fieldErrors['Number of observers']} field={{ label: 'Number of observers', value: String(d.numberOfObservers), kind: 'number', help: 'Observer fees are added once the organisers confirm the rate.' }} />
              </div>
              {paymentDone && <p className="reg-aside"><Info size={18} aria-hidden="true" />You have already paid. Changing these numbers may change your fees; Finance will contact you if it does.</p>}
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>Save and continue <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'welfare' && (
            <form onSubmit={saveWelfare} noValidate>
              <Facts items={welfareFacts(data.members)} />
              <div className="reg-grid">
                <FieldControl idPrefix="welfare" field={{ label: 'Anything else the welfare team should know', value: d.welfareNote ?? '', kind: 'textarea', optional: true }} />
              </div>
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>This is correct, continue <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'payment' && (
            <form ref={invoiceRef} onSubmit={savePayment} noValidate>
              <div className="reg-pay-top">
                <section className="reg-block" aria-labelledby="pay-amount">
                  <h4 id="pay-amount">Amount to transfer</h4>
                  <table className="reg-fee-table">
                    <tbody>
                      {data.fees.lines.map((line) => (
                        <tr key={line.key}><th scope="row">{line.label}<small>{line.detail}</small></th><td>{line.amount === null ? (data.fees.observersPending ? 'Rate to be confirmed' : '—') : money(line.amount)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th scope="row">Total</th><td>{money(data.fees.total)}</td></tr></tfoot>
                  </table>
                  <dl className="reg-ref">
                    <div><dt>Fee tier</dt><dd>{data.fees.tierLabel}</dd></div>
                    <div><dt>Payment reference</dt><dd>{payment ? <>
                      <span className="reg-code">{payment.paymentReference}</span>
                      <button type="button" className="reg-copy" onClick={copyReference}><Copy size={14} aria-hidden="true" />{copied ? 'Copied' : 'Copy'}</button>
                    </> : <span className="reg-muted">Created when you save the invoice details</span>}</dd></div>
                  </dl>
                  <span className="reg-visually-hidden" role="status">{copied ? 'Payment reference copied' : ''}</span>
                </section>

                <section className="reg-block" aria-labelledby="pay-how">
                  <h4 id="pay-how">How to pay</h4>
                  <ol className="reg-how">
                    <li>Fill in and save the invoice details below. Invoices can’t be split after you transfer.</li>
                    <li>{payment
                      ? <button type="button" className="reg-inline-btn" onClick={() => openInvoice({ organisation: payment.invoiceRecipientName ?? d.countryTerritory, country: d.countryTerritory, recipientAddress: payment.invoiceRecipientAddress, reference: payment.paymentReference, fees: data.fees })}><Download size={14} aria-hidden="true" />Download the invoice</button>
                      : 'Download the invoice (available once the details are saved).'}</li>
                    <li>Transfer the <strong>full amount</strong> to สอวน (POSN) at SCB. Choose <strong>OUR</strong> for bank charges, and put the payment reference in the description.</li>
                    <li>Upload the bank’s proof of transfer. People opens straight after.</li>
                  </ol>
                  <p className="reg-aside"><Info size={18} aria-hidden="true" />Account name, number and SWIFT code appear here once Finance approves them.</p>
                </section>
              </div>

              <section className="reg-block reg-pay-rules" aria-labelledby="pay-rules">
                <h4 id="pay-rules">Payment rules</h4>
                <Facts items={[
                  { label: 'How', value: 'Bank transfer only', help: 'There is no card or online payment. Transfer outside this website, then upload the proof here.' },
                  { label: 'Amount', value: 'The full invoice amount', help: 'The organisers must receive the full amount. Partial payments are not accepted.' },
                  { label: 'Bank charges', value: 'Paid by you (OUR)', help: 'The organisers cannot cover charges that intermediary banks deduct.' },
                  { label: 'Currency conversion', value: 'Paid by you', help: 'Conversion costs and exchange-rate differences are the sender’s responsibility.' },
                ]} />
              </section>

              <fieldset className="reg-fieldset">
                <legend>Invoice details</legend>
                {paymentDone && <p className="reg-hint">Locked while Finance reviews your payment. Contact the organisers to change them.</p>}
                <div className="reg-grid">
                  <FieldControl idPrefix="payment" disabled={paymentDone} error={fieldErrors['Invoice recipient name']} field={{ label: 'Invoice recipient name', value: payment?.invoiceRecipientName ?? d.accreditedOrganisation ?? '', help: 'The organisation named on the invoice.' }} />
                  <FieldControl idPrefix="payment" disabled={paymentDone} field={{ label: 'Invoice recipient address', value: payment?.invoiceRecipientAddress ?? '', kind: 'textarea', optional: true, help: 'Only if your institution needs a postal address on the invoice.' }} />
                  <FieldControl idPrefix="payment" disabled={paymentDone} error={fieldErrors['Number of invoices']} field={{ label: 'Number of invoices', value: String(payment?.invoiceCount ?? 1), kind: 'number', help: 'Invoices cannot be split after the transfer.' }} />
                  <FieldControl idPrefix="payment" disabled={paymentDone} field={{ label: 'How to split the invoices', value: payment?.invoiceSplitNote ?? '', kind: 'textarea', optional: true, help: 'Only for more than one invoice. Example: “National Olympiad Foundation, USD 1,200; University Fund, USD 1,680”.' }} />
                </div>
                {!paymentDone && <button type="button" className="reg-btn reg-btn-secondary reg-save-invoice" disabled={busy} onClick={() => run(async () => { if (await saveInvoice()) setSavedNote('Invoice details saved.') })}>Save invoice details</button>}
                <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>
              </fieldset>

              {payment?.status === 'rejected' && (
                <p className="reg-aside reg-aside-warn"><CircleAlert size={18} aria-hidden="true" /><span><strong>Finance could not match your proof.</strong> {payment.reviewNote} Please upload a new one.</span></p>
              )}

              <div className={`reg-field reg-field-wide reg-proof${fieldErrors.proof ? ' has-error' : ''}`}>
                <span className="reg-label-text" id="proof-label">Proof of transfer</span>
                <p className="reg-hint" id="proof-hint">{canUpload || paymentDone ? 'The bank’s confirmation or a screenshot of the completed transfer. PDF, JPG or PNG, up to 10 MB.' : 'Save the invoice details first, then upload the proof after you transfer.'}</p>
                {fieldErrors.proof && <p className="reg-error" id="proof-error"><CircleAlert size={16} aria-hidden="true" />{fieldErrors.proof}</p>}
                <label className={`reg-dropzone${paymentDone ? ' is-filled' : ''}${fieldErrors.proof ? ' has-error' : ''}${!canUpload && !paymentDone ? ' is-disabled' : ''}`}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={!canUpload || busy} aria-labelledby="proof-label" aria-describedby={`proof-hint${fieldErrors.proof ? ' proof-error' : ''}`}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadProof(file); e.target.value = '' }} />
                  {paymentDone
                    ? <><Check size={22} strokeWidth={2.6} aria-hidden="true" /><span><strong>{proofAttachment?.originalFilename ?? 'Proof uploaded'}</strong>{payment?.status === 'approved' ? 'Approved by Finance.' : 'Uploaded. Finance will check it against the bank statement.'}</span></>
                    : <><Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : 'Choose a file'}</strong>{canUpload ? 'or drag it here' : 'Available once the invoice details are saved'}</span></>}
                </label>
              </div>

              <Facts compact items={[
                { label: 'Finance check', value: payment?.status === 'approved' ? 'Approved' : payment?.status === 'awaiting_review' ? 'Waiting for Finance' : payment?.status === 'rejected' ? 'Returned, upload a new proof' : 'Waiting for your proof' },
                { label: 'E-receipt', value: 'Emailed after Finance approves the payment' },
              ]} />

              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{paymentDone ? 'Continue' : 'Save and continue'} <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'travel' && (
            <fieldset className="reg-fieldset reg-stay">
              <legend>Stay dates</legend>
              <p className="reg-hint">The programme runs from {formatDate(programmeWindow.first)} to {formatDate(programmeWindow.last)} 2027. Dates are saved as you choose them.</p>
              <div className="reg-grid">
                <div className="reg-field">
                  <label htmlFor="stay-arrival">Arrival date</label>
                  <p className="reg-hint" id="stay-arrival-hint">Your first night at the official hotel.</p>
                  <input id="stay-arrival" type="date" className="reg-control" value={stay.arrival} onChange={(e) => changeStay({ ...stay, arrival: e.target.value })} aria-describedby="stay-arrival-hint" />
                </div>
                <div className={`reg-field${stayProblem ? ' has-error' : ''}`}>
                  <label htmlFor="stay-departure">Departure date</label>
                  <p className="reg-hint" id="stay-departure-hint">The day you leave the hotel.</p>
                  {stayProblem && <p className="reg-error" id="stay-departure-error"><CircleAlert size={16} aria-hidden="true" />{stayProblem}</p>}
                  <input id="stay-departure" type="date" className="reg-control" value={stay.departure} min={stay.arrival || undefined} onChange={(e) => changeStay({ ...stay, departure: e.target.value })} aria-describedby={`stay-departure-hint${stayProblem ? ' stay-departure-error' : ''}`} aria-invalid={stayProblem ? true : undefined} />
                </div>
              </div>
              <p className="reg-nights" role="status">
                {nights !== null && !stayProblem && <><strong>{nights} {nights === 1 ? 'night' : 'nights'}</strong> at the official hotel{outsideWindow > 0 ? `, ${outsideWindow} outside the programme dates.` : '.'}</>}
              </p>
              {outsideWindow > 0 && (
                <div className="reg-field reg-field-wide">
                  <label htmlFor="stay-why">Why you need the extra nights <span className="reg-optional">(optional)</span></label>
                  <p className="reg-hint" id="stay-why-hint">So the organisers can check hotel availability and any extra cost.</p>
                  <textarea id="stay-why" className="reg-control" rows={3} defaultValue={d.stayWindowNote ?? ''} onChange={(e) => setStayNote(e.target.value)} aria-describedby="stay-why-hint" />
                </div>
              )}
            </fieldset>
          )}

          {section.records && !locked && (
            <div className={`reg-records${recordOpen ? ' is-open' : ''}`}>
              <div className="reg-record-list">
                <div className="reg-record-list-head">
                  <h4>{activeId === 'travel' ? 'Flights' : `${sectionRecords.filter((r) => r.id !== NEW_PERSON).length} ${section.records.plural}`}</h4>
                  {activeId === 'people' && !draftOpen && <button type="button" className="reg-btn-link" onClick={addPerson}><UserPlus size={16} aria-hidden="true" />Add person</button>}
                </div>
                {activeId === 'travel' && <p className="reg-hint">Add these once flights are booked. You can change them until the travel deadline.</p>}
                <ul>
                  {sectionRecords.map((record) => (
                    <li key={record.id}>
                      <button type="button" className={`reg-record${record.id === currentRecord?.id ? ' is-current' : ''}`} aria-current={record.id === currentRecord?.id ? 'true' : undefined} onClick={() => chooseRecord(record.id)}>
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
                    <button type="submit" className="reg-btn reg-btn-secondary" disabled={busy}>{busy ? 'Saving…' : `Save ${section.records.noun}`}</button>
                    {currentRecord.id === NEW_PERSON && <button type="button" className="reg-btn-link" onClick={() => { setDraftOpen(false); setSelected((s) => ({ ...s, people: undefined })) }}>Cancel</button>}
                    <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>
                  </div>
                </form>
              )}
            </div>
          )}

          {section.records && !locked && (
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={finishRecords}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          )}

          {activeId === 'review' && (submitted ? (
            <div className="reg-submitted">
              <Check size={28} strokeWidth={2.6} aria-hidden="true" />
              <div>
                <p><strong>Registration submitted.</strong> A confirmation has been sent to {d.teamLeaderEmail}.</p>
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
          </>)}

          {activeId === 'review' && <>
            <h4 className="reg-subhead">Current status</h4>
            <Facts items={[
              { label: 'Registration', value: submitted ? `Submitted${d.submittedAt ? ` on ${new Date(d.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}` : 'Draft, not submitted yet' },
              { label: 'Payment', value: paymentLabel[payment?.status ?? 'none'].replace(/^Payment: (.)/, (_, c: string) => c.toUpperCase()) },
              { label: 'Changes after submitting', value: 'Allowed until the change deadline', help: 'The final lock date and the change-request channel are awaiting approval.' },
              { label: 'Travel', value: d.declaredArrivalDate && d.declaredDepartureDate ? 'Stay dates added; flights can follow' : 'Stay dates still needed' },
              { label: 'Messages from the organisers', value: 'None' },
            ]} />
            <h4 className="reg-subhead">After you submit</h4>
            <Facts items={section.facts ?? []} />
            {!submitted && (
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit registration'}</button>
              </div>
            )}
          </>}

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

type PageState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; user: User | null }

export default function TeamLeaderPortal() {
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [devCode, setDevCode] = useState<string>()
  const [fromSignup, setFromSignup] = useState(false)
  const [notice, setNotice] = useState<string>()

  const loadMe = useCallback(async () => {
    try {
      const result = await api<{ user: User | null }>('/api/auth/me')
      setState({ status: 'ready', user: result.user })
    } catch (e) {
      setState({ status: 'unavailable', message: e instanceof ApiError && e.status === 503 ? '' : messageOf(e) })
    }
  }, [])
  useEffect(() => { loadMe() }, [loadMe])

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* the session is cleared locally either way */ }
    setDevCode(undefined); setFromSignup(false); setNotice(undefined)
    setState({ status: 'ready', user: null })
  }, [])
  const sessionEnded = useCallback(() => {
    setNotice('Your session ended. Please sign in again.')
    setState({ status: 'ready', user: null })
  }, [])

  const user = state.status === 'ready' ? state.user : null
  const isTeamLeader = user?.role === 'team_leader'
  const title = !user || isTeamLeader ? 'Set up your team.' : user.role === 'participant' ? 'Your registration.' : 'Registration back office.'
  const intro = !user || isTeamLeader
    ? 'Verify your invitation, create the Team Leader account, then register your teams in stages. Personal details can come later.'
    : user.role === 'participant' ? 'What your Team Leader has registered for you.' : `Signed in as ${roleLabel[user.role]}. You see only what this role needs.`

  return (
    <div className="reg-page">
      <header className="reg-intro">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="reg-breadcrumb"><a href="/registration">Registration</a><span aria-hidden="true">/</span><span aria-current="page">{isTeamLeader || !user ? 'Team Leader' : 'Back office'}</span></nav>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
      </header>
      <div className="reg-shell wrap">
        {state.status === 'ready' && (
          <div className="reg-session">
            <p className="reg-proto"><Info size={16} aria-hidden="true" />Test environment: data here is for testing and may be reset.</p>
            {user && <p className="reg-who"><span>Signed in as <strong>{user.fullName}</strong> · {roleLabel[user.role]}</span>
              <button type="button" className="reg-btn-link" onClick={signOut}><LogOut size={16} aria-hidden="true" />Sign out</button></p>}
          </div>
        )}

        {state.status === 'loading' && <p className="reg-loading" role="status">Loading…</p>}

        {state.status === 'unavailable' && (
          <div className="reg-account"><div className="reg-account-card">
            <h2>Registration opens on 18 January 2027</h2>
            <p className="reg-lede">Team Leader accounts are created with the invitation code each country receives by email. Until then, you can read how registration works.</p>
            <div className="reg-account-actions"><a className="reg-btn reg-btn-primary" href="/registration/how-to-register">How to register <ArrowRight size={18} aria-hidden="true" /></a></div>
            {state.message && <p className="reg-hint">{state.message}</p>}
          </div></div>
        )}

        {state.status === 'ready' && !user && (
          <Entry notice={notice} onSignedIn={(u) => { setNotice(undefined); setState({ status: 'ready', user: u }) }}
            onCreated={(u, code) => { setDevCode(code); setFromSignup(true); setState({ status: 'ready', user: u }) }} />
        )}

        {user && !user.emailVerified && (
          <div className="reg-account">
            <VerifyEmail user={user} developmentCode={devCode} showStepper={fromSignup} onSignOut={signOut}
              onVerified={(u) => { setDevCode(undefined); setState({ status: 'ready', user: u }) }} />
          </div>
        )}

        {user?.emailVerified && isTeamLeader && (user.delegationId
          ? <Workspace user={user} onSessionEnd={sessionEnded} />
          : <div className="reg-panel"><Alert>This Team Leader account is not linked to a delegation. Please contact the organisers.</Alert></div>)}

        {user?.emailVerified && !isTeamLeader && <StaffHome user={user} />}
      </div>
    </div>
  )
}
