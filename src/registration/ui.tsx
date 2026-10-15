// Form pieces shared by the Team Leader portal, sign-in screens and the staff back office.
import type { InputHTMLAttributes, ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { ApiError } from './api'
import { selectOptions, type Field } from './portalData'

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
