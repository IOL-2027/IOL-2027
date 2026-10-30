// Form pieces shared by the Team Leader portal, sign-in screens and the staff back office.
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Check, CircleAlert, Clock, LogOut } from 'lucide-react'
import { ApiError, type User } from './api'
import { selectOptions, type Field } from './portalData'

// Until launch the portal runs on test data that may be reset; its build (VITE_TEST_ENVIRONMENT) and local development say so.
export const testEnvironment = import.meta.env.VITE_TEST_ENVIRONMENT === 'true' || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
export const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
export const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
export const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')

type FieldProps = { field: Field; idPrefix: string; error?: string; wide?: boolean; disabled?: boolean }

export function FieldControl({ field, idPrefix, error, wide, disabled }: FieldProps) {
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

export function Facts({ items, compact }: { items: { label: string; value: string; help?: string }[]; compact?: boolean }) {
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

/**
 * One part of a step on a card of its own, so the parts of a long step read as separate things. `number` gives the
 * order to do them in (Payment); `done` turns the number into a tick. `status` sits on the right: a chip, usually.
 */
export function Card({ id, title, intro, number, done, status, children, className }: {
  id: string; title: ReactNode; intro?: ReactNode; number?: number; done?: boolean; status?: ReactNode; children?: ReactNode; className?: string
}) {
  return (
    <section className={`reg-card${className ? ` ${className}` : ''}`} id={id} aria-labelledby={`${id}-title`}>
      <header className="reg-card-head">
        {number !== undefined && (
          <span className={`reg-card-number${done ? ' is-done' : ''}`} aria-hidden="true">{done ? <Check size={16} strokeWidth={3} /> : number}</span>
        )}
        <div className="reg-card-title">
          <h4 id={`${id}-title`}>{number !== undefined && <span className="reg-visually-hidden">{`Part ${number}${done ? ', done' : ''}: `}</span>}{title}</h4>
          {intro && <p>{intro}</p>}
        </div>
        {status && <div className="reg-card-status">{status}</div>}
      </header>
      {children}
    </section>
  )
}

/** A short status beside a card or a button: ok (green), attention (amber) or later (grey). */
export function Chip({ tone, children }: { tone: 'ok' | 'attention' | 'later'; children: ReactNode }) {
  const Icon = tone === 'ok' ? Check : tone === 'attention' ? CircleAlert : Clock
  return <span className={`reg-chip is-${tone}`}><Icon size={13} strokeWidth={tone === 'ok' ? 3 : 2} aria-hidden="true" />{children}</span>
}

export function focusFirstError(container: HTMLElement | null) {
  requestAnimationFrame(() => container?.querySelector<HTMLElement>('[aria-invalid="true"], .reg-dropzone.has-error input')?.focus())
}

export function Alert({ children }: { children: ReactNode }) {
  return children ? <p className="reg-error reg-section-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{children}</span></p> : null
}

export function TextField({ name, label, hint, error, idPrefix = 'acc', ...input }: { name: string; label: string; hint?: string; error?: string; idPrefix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `${idPrefix}-${name}`
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

/** Who is signed in and the way out, at the top right of the page header. */
export function SessionBar({ user, onSignOut }: { user?: User | null; onSignOut?: () => void }) {
  if (!testEnvironment && !user) return null
  return (
    <div className="reg-head-session">
      {testEnvironment && <span className="reg-test-chip">Test environment · data may be reset</span>}
      {user && <span className="reg-head-who">Signed in as <strong>{user.fullName}</strong></span>}
      {user && onSignOut && <button type="button" className="reg-head-signout" onClick={onSignOut}><LogOut size={15} aria-hidden="true" />Sign out</button>}
    </div>
  )
}

/** The dark band that opens every signed-in page: what this is, whose it is, and (aside) where things stand. */
/** `compact` keeps it short on phones, for pages that need their first screen (the badge scanner). */
export function PageHead({ eyebrow, title, intro, session, aside, compact, children }: {
  eyebrow: string; title: ReactNode; intro?: ReactNode; session?: ReactNode; aside?: ReactNode; compact?: boolean; children?: ReactNode
}) {
  return (
    <header className={`reg-head${compact ? ' reg-head-compact' : ''}`}>
      <div className="wrap">
        <div className="reg-head-top"><p className="reg-head-eyebrow">{eyebrow}</p>{session}</div>
        <div className="reg-head-main">
          <div className="reg-head-title">
            <h1>{title}</h1>
            {intro && <p className="reg-head-intro">{intro}</p>}
            {children}
          </div>
          {aside}
        </div>
      </div>
    </header>
  )
}
