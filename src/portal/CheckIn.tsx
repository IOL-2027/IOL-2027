// /portal/check-in: the badge scanner. Badges are only scanned here, never with a phone's own camera app (the QR
// holds a bare code, not a link). Staff who may scan (check-in staff, registration admins, super admins) sign in,
// then: 1. allow the camera, 2. choose the checkpoint, 3. start scanning. Each scan records the checkpoint, time
// and result. The checkpoint is fixed while scanning, so a scan is never recorded at the wrong one.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CheckCircle, Play, ShieldCheck, Square, X } from 'lucide-react'
import type { Html5Qrcode } from 'html5-qrcode'
import { api, ApiError, roleLabel, type User } from '../registration/api'
import { Entry } from '../registration/AuthForms'
import { Alert, PageHead, SessionBar, messageOf } from '../registration/ui'
import '../registration/registration.css'

export const scanningRoles = ['checkin_staff', 'registration_admin', 'super_admin']
export const checkpoints = ['Arrival desk', 'Hotel departure', 'Contest venue entry', 'Cultural night', 'Awards ceremony']
export type BadgeHolder = { kind: 'member' | 'staff'; displayName: string; badgeName: string | null; officialName: string | null; role: string; place: string | null; team: string | null }
type Result = { tone: 'idle' | 'working' | 'accepted' | 'rejected'; title: string; detail: string }
type ScanResponse = { accepted: boolean; holder: BadgeHolder }
type Access = 'checking' | 'ask' | 'asking' | 'allowed' | 'blocked' | 'missing' | 'busy' | 'unsupported'
type Recent = { at: string; name: string; accepted: boolean }

export const holderRole: Record<string, string> = {
  contestant: 'Contestant', team_leader: 'Team Leader', observer: 'Observer', staff: 'Staff', guide: 'Guide', volunteer: 'Volunteer', guest: 'Guest',
}

// A badge held in front of the camera is read many times a second; the same badge is recorded once, then again
// only after it has been out of view for this long.
const SAME_BADGE_MS = 4000

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

/** What a failed camera request means for the person holding the phone. */
function accessFrom(error: unknown): Access {
  const name = error instanceof DOMException ? error.name : (error as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing'
  return 'busy'
}

const accessText: Record<Access, string> = {
  checking: 'Checking the camera…',
  ask: 'The browser will ask to use the camera. Choose Allow.',
  asking: 'Waiting for you to allow the camera…',
  allowed: 'Camera allowed.',
  blocked: 'The camera is blocked for this site. Open the site settings (the icon next to the address), allow the camera, then reload this page.',
  missing: 'No camera was found on this device. Use a phone or tablet, or connect a camera.',
  busy: 'The camera could not start. Close other apps or tabs that use it, then try again.',
  unsupported: 'This browser cannot use the camera here. Open this page in Chrome, Safari or Edge.',
}

const backCamera = (label: string) => /back|rear|environment|後|หลัง/i.test(label)

function Scanner() {
  const [checkpoint, setCheckpoint] = useCheckpoint()
  const [access, setAccess] = useState<Access>('checking')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [mirrored, setMirrored] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<Result>({ tone: 'idle', title: 'Not scanning yet', detail: 'Allow the camera, choose the checkpoint, then start scanning.' })
  const [recent, setRecent] = useState<Recent[]>([])
  const reader = useRef<Html5Qrcode | null>(null)
  const inFlight = useRef(false)
  const last = useRef({ payload: '', at: 0 })

  /** The cameras this device has, once the camera is allowed (before that, browsers hide their names). */
  const listCameras = useCallback(async () => {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
    setCameras(devices)
    setCameraId((current) => (devices.some((d) => d.deviceId === current) ? current : (devices.find((d) => backCamera(d.label)) ?? devices[devices.length - 1])?.deviceId ?? ''))
  }, [])

  // On opening the page: if the camera is already allowed, step 1 is done.
  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setAccess('unsupported'); return }
    let active = true
    const permissions = navigator.permissions as Permissions | undefined
    permissions?.query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (!active) return
        if (status.state === 'granted') { setAccess('allowed'); void listCameras() } else setAccess(status.state === 'denied' ? 'blocked' : 'ask')
      })
      .catch(() => { if (active) setAccess('ask') })
    if (!permissions) setAccess('ask')
    return () => { active = false }
  }, [listCameras])

  const allowCamera = async () => {
    setAccess('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      stream.getTracks().forEach((track) => track.stop())
      setAccess('allowed')
      await listCameras()
    } catch (error) {
      setAccess(accessFrom(error))
    }
  }

  const submitScan = useCallback(async (payload: string) => {
    const code = payload.trim()
    if (!code || inFlight.current) return
    const now = Date.now()
    if (code === last.current.payload && now - last.current.at < SAME_BADGE_MS) { last.current.at = now; return }
    last.current = { payload: code, at: now }
    inFlight.current = true
    setResult({ tone: 'working', title: 'Checking badge', detail: checkpoint })
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    try {
      const { holder } = await api<ScanResponse>('/api/registration/check-in/scan', { method: 'POST', body: { payload: code, checkpoint } })
      const name = holder.badgeName || holder.displayName
      setResult({ tone: 'accepted', title: name, detail: [holder.displayName !== name ? holder.displayName : null, holderRole[holder.role] ?? holder.role, holder.place, `${checkpoint} recorded`].filter(Boolean).join(' · ') })
      setRecent((list) => [{ at: time, name, accepted: true }, ...list].slice(0, 6))
      setManualCode('')
      navigator.vibrate?.(80)
    } catch (e) {
      const revoked = e instanceof ApiError && e.status === 409
      setResult({ tone: 'rejected', title: 'Badge not accepted', detail: revoked ? 'This badge has been revoked. Send the person to the registration desk.' : messageOf(e) })
      setRecent((list) => [{ at: time, name: revoked ? 'Revoked badge' : 'Not a valid badge', accepted: false }, ...list].slice(0, 6))
      navigator.vibrate?.([80, 60, 80])
    } finally {
      inFlight.current = false
    }
  }, [checkpoint])

  // The scanner keeps the latest submitScan (it changes with the checkpoint) without restarting the camera.
  const onDecode = useRef(submitScan)
  useEffect(() => { onDecode.current = submitScan }, [submitScan])

  const stopScanning = useCallback(async () => {
    const current = reader.current
    reader.current = null
    setScanning(false)
    if (!current) return
    try { if (current.isScanning) await current.stop() } catch { /* already stopped */ }
    try { current.clear() } catch { /* nothing to clear */ }
  }, [])

  const startScanning = async () => {
    setStarting(true)
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('iol-badge-reader', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], useBarCodeDetectorIfSupported: true })
      reader.current = scanner
      await scanner.start(
        cameraId || { facingMode: { ideal: 'environment' } },
        { fps: 15, qrbox: (width, height) => { const side = Math.max(160, Math.floor(Math.min(width, height) * 0.72)); return { width: side, height: side } } },
        (text) => { void onDecode.current(text) },
        () => undefined,
      )
      // A front camera (a laptop's, or a phone's selfie camera) shows a mirror image, which is easier to aim.
      const settings = scanner.getRunningTrackSettings()
      const label = cameras.find((d) => d.deviceId === cameraId)?.label ?? ''
      setMirrored(settings.facingMode ? settings.facingMode === 'user' : !backCamera(label))
      setScanning(true)
      setResult({ tone: 'idle', title: 'Ready to scan', detail: `Hold one badge inside the frame. Scans are recorded at ${checkpoint}.` })
    } catch (error) {
      await stopScanning()
      setAccess(accessFrom(error))
    } finally {
      setStarting(false)
    }
  }

  // The camera stops when the page is hidden (another app, a locked phone) and when the page closes.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && reader.current) {
        void stopScanning()
        setResult({ tone: 'idle', title: 'Scanning paused', detail: 'The camera stopped while the page was in the background. Start scanning again.' })
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); void stopScanning() }
  }, [stopScanning])

  const allowed = access === 'allowed'
  return (
    <section className={`checkin-shell${scanning ? ' is-scanning' : ''}`}>
      <div className="checkin-controls">
        <ol className="checkin-steps">
          <li className={allowed ? 'is-done' : ''}>
            <span className="checkin-step-number">1</span>
            <div>
              <h2>Allow the camera</h2>
              <p className={['blocked', 'missing', 'busy', 'unsupported'].includes(access) ? 'checkin-step-problem' : undefined}>{accessText[access]}</p>
              {!allowed && ['ask', 'busy', 'blocked'].includes(access) && <button type="button" className="reg-btn reg-btn-secondary" onClick={() => void allowCamera()}><Camera size={17} aria-hidden="true" />{access === 'ask' ? 'Allow the camera' : 'Try again'}</button>}
              {allowed && cameras.length > 1 && (
                <label className="reg-label checkin-label">Camera<select className="reg-control" value={cameraId} disabled={scanning || starting} onChange={(event) => setCameraId(event.target.value)}>
                  {cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
                </select></label>
              )}
            </div>
          </li>
          <li className={allowed ? 'is-done' : ''}>
            <span className="checkin-step-number">2</span>
            <div>
              <h2>Choose the checkpoint</h2>
              <label className="reg-label checkin-label">Checkpoint<select className="reg-control" value={checkpoint} disabled={scanning || starting} onChange={(event) => setCheckpoint(event.target.value)}>{checkpoints.map((name) => <option key={name}>{name}</option>)}</select></label>
              {scanning && <p>Stop scanning to change it.</p>}
            </div>
          </li>
          <li className={scanning ? 'is-done' : ''}>
            <span className="checkin-step-number">3</span>
            <div>
              <h2>{scanning ? 'Scanning' : 'Start scanning'}</h2>
              {scanning
                ? <button type="button" className="reg-btn reg-btn-secondary" onClick={() => void stopScanning()}><Square size={16} aria-hidden="true" />Stop scanning</button>
                : <button type="button" className="reg-btn reg-btn-primary" disabled={!allowed || starting} onClick={() => void startScanning()}><Play size={17} aria-hidden="true" />{starting ? 'Starting the camera…' : 'Start scanning'}</button>}
            </div>
          </li>
        </ol>
        <div className={`checkin-result checkin-result-${result.tone}`} role="status" aria-live="polite"><span>{result.tone === 'accepted' ? <CheckCircle /> : result.tone === 'rejected' ? <X /> : <ShieldCheck />}</span><div><strong>{result.title}</strong><p>{result.detail}</p></div></div>
        {recent.length > 0 && (
          <div className="checkin-recent"><h3>Scanned on this device</h3>
            <ul>{recent.map((r, i) => <li key={`${r.at}-${i}`} className={r.accepted ? undefined : 'is-rejected'}><time>{r.at}</time><span>{r.name}</span>{r.accepted ? <CheckCircle size={15} aria-label="Accepted" /> : <X size={15} aria-label="Not accepted" />}</li>)}</ul>
          </div>
        )}
      </div>
      <div className="checkin-camera">
        <div className="checkin-camera-head">{scanning ? <Camera size={18} /> : <CameraOff size={18} />}<strong>{scanning ? checkpoint : 'Badge camera'}</strong><span>{scanning ? 'Live' : starting ? 'Starting' : 'Off'}</span></div>
        <div className="checkin-reader-frame">
          <div id="iol-badge-reader" className={`checkin-reader${mirrored ? ' is-mirrored' : ''}`} />
          {!scanning && !starting && <p className="checkin-reader-idle">{allowed ? 'Press Start scanning to turn the camera on.' : 'Allow the camera first.'}</p>}
        </div>
        <div className="checkin-manual"><span>Camera cannot read it? Paste the badge code, or look the person up by name in People.</span><div><input className="reg-control" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Badge code" aria-label="Badge code" /><button type="button" className="reg-btn reg-btn-secondary" onClick={() => { last.current = { payload: '', at: 0 }; void submitScan(manualCode) }}>Check badge</button></div></div>
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
        intro="For check-in staff during event week. Scan badges only on this page: the QR on each badge holds a random code that only this scanner can read." />
      <div className="reg-shell wrap">
        {user === undefined && <p className="reg-loading" role="status">Loading…</p>}
        {user === null && <>{error && <Alert>{error}</Alert>}<Entry allowSignup={false} onSignedIn={setUser} onCreated={setUser} /></>}
        {user && !mayScan && <div className="reg-panel"><Alert>{roleLabel[user.role]} accounts cannot scan badges. Ask a super admin for a check-in staff account.</Alert></div>}
        {mayScan && <Scanner />}
      </div>
    </div>
  )
}
