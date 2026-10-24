// Signing in, creating a Team Leader account with an invitation code, verifying the email,
// and resetting a password (also how staff set their first password).
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Info, KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { api, type User } from './api'
import { Alert, TextField, focusFirstError, messageOf } from './ui'

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

function DevCode({ code }: { code?: string }) {
  return code ? <p className="reg-devcode" role="status"><Info size={18} aria-hidden="true" /><span>Test server: email sending is switched off, so here is your code: <strong>{code}</strong></span></p> : null
}

function SignIn({ onSignedIn, onForgot, notice }: { onSignedIn: (user: User) => void; onForgot: (email: string) => void; notice?: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
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
  const forgot = () => onForgot(String(new FormData(formRef.current!).get('email') ?? '').trim())
  return (
    <form ref={formRef} className="reg-account-card" onSubmit={submit} noValidate>
      <h2>Sign in</h2>
      <p className="reg-lede">For Team Leaders who already have an account, and for organising staff.</p>
      {notice && <p className="reg-aside"><Info size={18} aria-hidden="true" />{notice}</p>}
      {error && <Alert>{error}</Alert>}
      <TextField name="email" label="Email address" type="email" autoComplete="email" required />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
      <div className="reg-account-actions">
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={18} aria-hidden="true" /></button>
        <button type="button" className="reg-btn-link" onClick={forgot}><KeyRound size={16} aria-hidden="true" />Forgot your password?</button>
      </div>
      <p className="reg-reassure"><Info size={18} aria-hidden="true" /><span>Staff setting up a new account: choose “Forgot your password?” and use the code from your setup email.</span></p>
    </form>
  )
}

function ResetPassword({ initialEmail, onDone, onBack }: { initialEmail: string; onDone: (user: User) => void; onBack: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')
  const [code, setCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const { headingRef, rootRef } = useStepFocus(step)

  const request = async (address: string) => {
    const result = await api<{ developmentCode?: string }>('/api/auth/password-reset/request', { method: 'POST', body: { email: address } })
    setCode(result.developmentCode)
    setStatus(`If an account exists for ${address}, a 6-digit code is on its way. It expires in 30 minutes.`)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const address = String(data.get('email') ?? '').trim()
    const found: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) found.email = 'Enter the email address you sign in with.'
    if (step === 'code') {
      if (!/^\d{6}$/.test(String(data.get('code') ?? '').trim())) found.code = 'Enter the 6 digits from the email.'
      if (String(data.get('password') ?? '').length < 12) found.password = 'Use at least 12 characters.'
    }
    setErrors(found)
    if (Object.keys(found).length) { focusFirstError(formRef.current); return }
    setBusy(true)
    try {
      if (step === 'email') {
        await request(address)
        setEmail(address); setStep('code')
      } else {
        const result = await api<{ user: User }>('/api/auth/password-reset/confirm', {
          method: 'POST', body: { email: address, code: String(data.get('code')).trim(), password: String(data.get('password')) },
        })
        onDone(result.user)
      }
    } catch (e) {
      setErrors({ [step === 'email' ? 'email' : 'code']: messageOf(e) })
      focusFirstError(formRef.current)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setErrors({}); setStatus('')
    try { await request(email) } catch (e) { setErrors({ code: messageOf(e) }) }
  }

  return (
    <div ref={rootRef}>
      <form ref={formRef} className="reg-account-card" onSubmit={submit} noValidate key={step}>
        {step === 'email' ? <>
          <h2 ref={headingRef} tabIndex={-1}>Reset your password</h2>
          <p className="reg-lede">Enter the email address you sign in with. We will send a 6-digit code to choose a new password.</p>
          <TextField name="email" label="Email address" type="email" autoComplete="email" defaultValue={email} error={errors.email} />
          <div className="reg-account-actions">
            <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send a code'} <ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" className="reg-btn-link" onClick={() => { setErrors({}); setStep('code') }}>I already have a code</button>
          </div>
        </> : <>
          <h2 ref={headingRef} tabIndex={-1}>Choose a new password</h2>
          <p className="reg-lede">Enter the code from the email and a new password. Signing in elsewhere will end, so only you stay signed in.</p>
          <DevCode code={code} />
          <TextField name="email" label="Email address" type="email" autoComplete="email" defaultValue={email} error={errors.email} />
          <TextField name="code" label="Code from the email" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="reg-control reg-control-otp" error={errors.code} />
          <TextField name="password" label="New password" hint="At least 12 characters." type="password" autoComplete="new-password" error={errors.password} />
          <p className="reg-reassure"><MailCheck size={18} aria-hidden="true" /><span>No email? Check spam, or <button type="button" className="reg-inline-btn" onClick={resend}>send a new code</button>.</span></p>
          <p className="reg-status-line" role="status">{status}</p>
          <div className="reg-account-actions">
            <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save password and sign in'} <ArrowRight size={18} aria-hidden="true" /></button>
          </div>
        </>}
        <p className="reg-reassure"><button type="button" className="reg-btn-link" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to sign in</button></p>
      </form>
    </div>
  )
}

function SignUp({ onCreated, initialCode }: { onCreated: (user: User, developmentCode?: string) => void; initialCode?: string }) {
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
          <TextField name="code" label="Invitation code" hint="Example: IOL2027-ABC-1234" error={errors.code} className="reg-control reg-control-code" autoComplete="off" spellCheck={false} defaultValue={invite?.code ?? initialCode} />
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

export function VerifyEmail({ user, developmentCode, showStepper, onVerified, onSignOut }: {
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
        <DevCode code={code} />
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

/**
 * Sign in, or create a Team Leader account with an invitation code. The organisers' door (allowSignup false)
 * offers only sign-in and password reset. initialCode (from an invitation email link) opens the sign-up with it filled in.
 */
export function Entry({ onSignedIn, onCreated, notice, allowSignup = true, initialCode }: {
  onSignedIn: (user: User) => void; onCreated: (user: User, code?: string) => void; notice?: string; allowSignup?: boolean; initialCode?: string
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(allowSignup && initialCode ? 'signup' : 'signin')
  const [resetEmail, setResetEmail] = useState('')
  return (
    <div className="reg-account">
      {mode !== 'reset' && allowSignup && (
        <div className="reg-switch" role="group" aria-label="How do you want to start?">
          <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'active' : undefined} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'active' : undefined} onClick={() => setMode('signup')}>I have an invitation code</button>
        </div>
      )}
      {mode === 'signin' && <SignIn onSignedIn={onSignedIn} notice={notice} onForgot={(email) => { setResetEmail(email); setMode('reset') }} />}
      {mode === 'signup' && <SignUp onCreated={onCreated} initialCode={initialCode} />}
      {mode === 'reset' && <ResetPassword initialEmail={resetEmail} onDone={onSignedIn} onBack={() => setMode('signin')} />}
    </div>
  )
}
