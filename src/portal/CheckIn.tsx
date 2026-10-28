// /check-in: the badge scanner. Staff who may scan (check-in staff, registration admins, super admins) sign in,
// choose the checkpoint and scan; each scan is recorded with the checkpoint, time and result.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle, ShieldCheck, X } from 'lucide-react'
import { api, ApiError, roleLabel, type User } from '../registration/api'
import { Entry } from '../registration/AuthForms'
import { Alert, PageHead, SessionBar, messageOf } from '../registration/ui'
import '../registration/registration.css'

export const scanningRoles = ['checkin_staff', 'registration_admin', 'super_admin']
export const checkpoints = ['Arrival desk', 'Hotel departure', 'Contest venue entry', 'Cultural night', 'Awards ceremony']
export type BadgeHolder = { kind: 'member' | 'staff'; displayName: string; badgeName: string | null; officialName: string | null; role: string; place: string | null; team: string | null }
type Result = { tone: 'idle' | 'working' | 'accepted' | 'rejected'; title: string; detail: string }
type ScanResponse = { accepted: boolean; holder: BadgeHolder }

export const holderRole: Record<string, string> = {
  contestant: 'Contestant', team_leader: 'Team Leader', observer: 'Observer', staff: 'Staff', guide: 'Guide', volunteer: 'Volunteer', guest: 'Guest',
}

/** The checkpoint this device last scanned at, so a phone at the arrival desk keeps it between badges. */
export function useCheckpoint() {
  const [checkpoint, setCheckpoint] = useState(() => {
    try { const saved = localStorage.getItem('iol-checkpoint'); return saved && checkpoints.includes(saved) ? saved : checkpoints[0] } catch { return checkpoints[0] }
  })
  const choose = (value: string) => {
    setCheckpoint(value)
    try { localStorage.setItem('iol-checkpoint', value) } catch { /* remembered for this page only */ }
  }
  return [checkpoint, choose] as const
}

function Scanner() {
  const [checkpoint, setCheckpoint] = useCheckpoint()
  const [manualCode, setManualCode] = useState('')
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting')
  const [result, setResult] = useState<Result>({ tone: 'idle', title: 'Ready to scan', detail: 'Hold one badge inside the camera frame.' })
  const scanLock = useRef(false)

  const submitScan = useCallback(async (payload: string) => {
    if (!payload.trim() || scanLock.current) return
    scanLock.current = true
    setResult({ tone: 'working', title: 'Checking badge', detail: checkpoint })
    try {
      const scan = await api<ScanResponse>('/api/registration/check-in/scan', { method: 'POST', body: { payload: payload.trim(), checkpoint } })
      const { holder } = scan
      setResult({ tone: 'accepted', title: holder.badgeName || holder.displayName, detail: [holder.displayName, holderRole[holder.role] ?? holder.role, holder.place, `${checkpoint} recorded`].filter(Boolean).join(' · ') })
      setManualCode('')
    } catch (e) {
      const detail = e instanceof ApiError && e.status === 409 ? 'This badge has been revoked. Send the person to the registration desk.' : messageOf(e)
      setResult({ tone: 'rejected', title: 'Badge not accepted', detail })
    } finally {
      window.setTimeout(() => { scanLock.current = false }, 1800)
    }
  }, [checkpoint])

  useEffect(() => {
    let scanner: { stop: () => Promise<void> } | null = null
    let active = true
    void import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!active) return
      const reader = new Html5Qrcode('iol-badge-reader')
      scanner = reader
      return reader.start(
        { facingMode: { ideal: 'environment' } },
        { fps: 24, qrbox: { width: 280, height: 280 } },
        (decodedText) => { if (active) void submitScan(decodedText) },
        () => undefined,
      ).then(() => { if (active) setCameraState('ready') })
    }).catch(() => { if (active) setCameraState('unavailable') })
    return () => {
      active = false
      scanner?.stop().catch(() => undefined)
    }
  }, [submitScan])

  return (
    <section className="checkin-shell">
      <div className="checkin-controls">
        <div><p className="eyebrow">Current checkpoint</p><h2>Where are you scanning?</h2></div>
        <label className="reg-label checkin-label">Checkpoint<select className="reg-control" value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)}>{checkpoints.map((name) => <option key={name}>{name}</option>)}</select></label>
        <div className={`checkin-result checkin-result-${result.tone}`} role="status"><span>{result.tone === 'accepted' ? <CheckCircle /> : result.tone === 'rejected' ? <X /> : <ShieldCheck />}</span><div><strong>{result.title}</strong><p>{result.detail}</p></div></div>
      </div>
      <div className="checkin-camera">
        <div className="checkin-camera-head"><Camera size={18} /><strong>Badge camera</strong><span>{cameraState === 'ready' ? 'Live' : cameraState === 'starting' ? 'Starting' : 'Camera unavailable'}</span></div>
        <div id="iol-badge-reader" className="checkin-reader" />
        <div className="checkin-manual"><span>Camera cannot read it? Paste the badge link or code, or look the person up by name in People.</span><div><input className="reg-control" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Badge code" aria-label="Badge code" /><button type="button" className="reg-btn reg-btn-secondary" onClick={() => void submitScan(manualCode)}>Check badge</button></div></div>
      </div>
    </section>
  )
}

export default function CheckIn() {
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
      <PageHead eyebrow="Badge scanner" title="Scan every badge." compact={Boolean(mayScan)} session={<SessionBar user={user} onSignOut={signOut} />}
        intro="For check-in staff during event week. The QR on each badge holds only a random reference; every scan records the checkpoint, time and result." />
      <div className="reg-shell wrap">
        {user === undefined && <p className="reg-loading" role="status">Loading…</p>}
        {user === null && <>{error && <Alert>{error}</Alert>}<Entry allowSignup={false} onSignedIn={setUser} onCreated={setUser} /></>}
        {user && !mayScan && <div className="reg-panel"><Alert>{roleLabel[user.role]} accounts cannot scan badges. Ask a super admin for a check-in staff account.</Alert></div>}
        {mayScan && <Scanner />}
      </div>
    </div>
  )
}
