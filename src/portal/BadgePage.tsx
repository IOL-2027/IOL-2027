// /b#<badge code>: where a badge's QR leads. Staff who may check people in sign in (if they have not already), see
// whose badge it is and its latest check-ins, and record a check-in at their checkpoint. Anyone else learns only that
// it is an IOL 2027 badge. The code sits after `#`, so it never reaches a server log, and the page takes it out of
// the address bar straight away; it is kept for this tab while the person signs in.
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, QrCode } from 'lucide-react'
import { api, ApiError, roleLabel, type User } from '../registration/api'
import { Entry } from '../registration/AuthForms'
import { Alert, PageHead, SessionBar, messageOf } from '../registration/ui'
import { checkpoints, holderRole, scanningRoles, useCheckpoint, type BadgeHolder } from './CheckIn'
import '../registration/registration.css'

type Lookup = { holder: BadgeHolder; active: boolean; scans: { checkpoint: string; result: string; scannedAt: string; scannedBy: string | null }[] }

const STORE = 'iol-badge-code'
const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })

function takeCode() {
  const fromLink = decodeURIComponent(window.location.hash.replace(/^#/, ''))
  if (fromLink) window.history.replaceState(null, '', window.location.pathname)
  try {
    if (fromLink) sessionStorage.setItem(STORE, fromLink)
    return fromLink || sessionStorage.getItem(STORE) || ''
  } catch {
    return fromLink
  }
}

function BadgeCheck({ code }: { code: string }) {
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [error, setError] = useState('')
  const [checkpoint, setCheckpoint] = useCheckpoint()
  const [recorded, setRecorded] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => api<Lookup>('/api/registration/check-in/lookup', { method: 'POST', body: { payload: code } }).then(setLookup), [code])
  useEffect(() => { load().catch((e) => setError(messageOf(e))) }, [load])

  const record = async () => {
    setBusy(true); setError(''); setRecorded('')
    try {
      await api('/api/registration/check-in/scan', { method: 'POST', body: { payload: code, checkpoint } })
      setRecorded(`Checked in at ${checkpoint}.`)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'This badge has been withdrawn. Send the person to the registration desk.' : messageOf(e))
    }
    setBusy(false)
    load().catch(() => undefined)
  }

  if (!lookup) return error ? <div className="reg-panel"><Alert>{error}</Alert></div> : <p className="reg-loading" role="status">Checking the badge…</p>
  const { holder } = lookup
  const name = holder.badgeName || holder.displayName
  return (
    <div className="badge-check">
      <section className={`badge-check-card badge-check-${holder.kind}`} aria-label="Whose badge this is">
        <p className="badge-check-role">{holderRole[holder.role] ?? holder.role}{holder.team && <> · Team {holder.team}</>}</p>
        <h2>{name}</h2>
        {holder.officialName && holder.officialName !== name && <p className="badge-check-full">{holder.officialName}</p>}
        {holder.place && <p className="badge-check-place">{holder.place}</p>}
      </section>
      <section className="reg-panel badge-check-actions">
        {lookup.active ? <>
          <label className="reg-label checkin-label">Checkpoint
            <select className="reg-control" value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)}>{checkpoints.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={() => void record()}><CheckCircle size={18} aria-hidden="true" />{busy ? 'Recording…' : `Check in at ${checkpoint}`}</button>
          {recorded && <p className="reg-status-line badge-check-done" role="status">{recorded}</p>}
        </> : <Alert>This badge has been withdrawn. Send the person to the registration desk.</Alert>}
        {error && <Alert>{error}</Alert>}
        <h3>Latest check-ins</h3>
        {lookup.scans.length ? (
          <ul className="badge-check-scans">
            {lookup.scans.map((s) => <li key={s.scannedAt}><strong>{s.checkpoint}</strong> {time(s.scannedAt)}{s.result !== 'accepted' && ` (${s.result})`}{s.scannedBy && <small>by {s.scannedBy}</small>}</li>)}
          </ul>
        ) : <p className="reg-muted">None yet.</p>}
        <a className="reg-btn-link" href="/check-in"><QrCode size={16} aria-hidden="true" />Scan several badges in a row</a>
      </section>
    </div>
  )
}

export default function BadgePage() {
  const [code] = useState(takeCode)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ user: User | null }>('/api/auth/me').then((r) => setUser(r.user)).catch((e) => { setError(messageOf(e)); setUser(null) })
  }, [])
  const signOut = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* cleared locally either way */ }
    setUser(null)
  }
  const mayScan = user && scanningRoles.includes(user.role)
  return (
    <div className="reg-page">
      <PageHead eyebrow="IOL 2027 badge" title={mayScan ? 'Check in this badge.' : 'An IOL 2027 badge.'} session={<SessionBar user={user} onSignOut={signOut} />}
        intro={mayScan ? 'Check the name against the person, then record the check-in.' : 'Event staff: sign in to see whose badge this is and check the person in. Found a badge? Please hand it to the registration desk.'} />
      <div className="reg-shell wrap">
        {!code ? <div className="reg-panel"><Alert>This link has no badge code. Scan the QR on the badge again.</Alert></div>
          : user === undefined ? <p className="reg-loading" role="status">Loading…</p>
          : user === null ? <>{error && <Alert>{error}</Alert>}<Entry allowSignup={false} onSignedIn={setUser} onCreated={setUser} /></>
          : !mayScan ? <div className="reg-panel"><Alert>{roleLabel[user.role]} accounts cannot check people in. Only check-in staff and registration admins can.</Alert></div>
          : <BadgeCheck code={code} />}
      </div>
    </div>
  )
}
