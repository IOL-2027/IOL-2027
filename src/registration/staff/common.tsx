// Pieces shared by the back-office sections.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import { api, ApiError } from '../api'

export const human = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
export const day = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

/** Loads a GET endpoint and reloads on demand. */
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    setError('')
    api<T>(path).then(setData).catch((e) => setError(errorText(e)))
  }, [path])
  useEffect(load, [load])
  return { data, error, reload: load }
}

export function Panel({ id, title, intro, actions, children }: { id: string; title: string; intro?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="reg-panel reg-staff-panel" aria-labelledby={`${id}-title`} id={id}>
      <header className="reg-panel-head reg-staff-head">
        <div><h2 id={`${id}-title`} tabIndex={-1}>{title}</h2>{intro && <p>{intro}</p>}</div>
        {actions && <div className="reg-staff-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function Problem({ message }: { message: string }) {
  return message ? <p className="reg-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{message}</p> : null
}

/** A polite live message after an action ("Saved", "Sent"). */
export function Done({ message }: { message: string }) {
  return <p className="reg-status-line" role="status">{message}</p>
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="reg-aside"><Info size={18} aria-hidden="true" /><span>{children}</span></p>
}

export function DevCodeNote({ code, who }: { code?: string; who: string }) {
  return code ? <p className="reg-devcode" role="status"><Info size={18} aria-hidden="true" /><span>Test server: email is switched off, so here is the code for {who}: <strong>{code}</strong></span></p> : null
}

export const stageLabel: Record<string, string> = {
  registered: 'Registered, not paid', payment_review: 'Payment under review', paid: 'Paid', badge_issued: 'Badge issued', checked_in: 'Checked in',
}

/** A table that scrolls sideways on phones; focusable so keyboard users can scroll it too. */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return <div className="reg-table-wrap" role="region" aria-label={`${label} table`} tabIndex={0}><table className="reg-table">{children}</table></div>
}

/** A labelled search box or select used in filter bars. */
export function FilterField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="reg-filter-field"><label htmlFor={id}>{label}</label>{children}</div>
}
