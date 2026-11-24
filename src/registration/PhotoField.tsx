// A jury member's or volunteer's photo (IOL Board, 16 Nov 2026): chosen as a JPG, PNG or HEIC (iPhone) file, then
// moved and zoomed inside one frame, so everyone's photo comes out the same shape and size (4:5, 800 × 1000 pixels).
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, CircleAlert, Upload } from 'lucide-react'
import type { Attachment } from './api'

const FRAME = { w: 240, h: 300 }
const OUT = { w: 800, h: 1000 }

type View = { x: number; y: number; zoom: number }

/** Reads a chosen file as an image the browser can draw; HEIC is converted first, as most browsers cannot show it. */
async function loadImage(file: File): Promise<HTMLImageElement> {
  let blob: Blob = file
  if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type)) {
    const { default: heic2any } = await import('heic2any')
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    blob = Array.isArray(converted) ? converted[0] : converted
  }
  // The address stays valid while the photo is shown in the frame; PhotoField releases it when the photo goes.
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  return image
}

export function PhotoField({ current, busy, onSave }: { current?: Attachment; busy: boolean; onSave: (photo: Blob) => void }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  // The smallest scale at which the photo still covers the whole frame.
  const base = image ? Math.max(FRAME.w / image.naturalWidth, FRAME.h / image.naturalHeight) : 1
  const scale = base * view.zoom
  const size = image ? { w: image.naturalWidth * scale, h: image.naturalHeight * scale } : { w: 0, h: 0 }
  // The photo always covers the frame: it cannot be moved so far that an edge shows.
  const clamp = (v: View): View => {
    if (!image) return v
    const s = base * v.zoom
    return { zoom: v.zoom, x: Math.min(0, Math.max(FRAME.w - image.naturalWidth * s, v.x)), y: Math.min(0, Math.max(FRAME.h - image.naturalHeight * s, v.y)) }
  }
  useEffect(() => {
    if (!image) return
    setView(clamp({ x: (FRAME.w - image.naturalWidth * base) / 2, y: (FRAME.h - image.naturalHeight * base) / 2, zoom: 1 }))
    // Releases the photo's temporary address once it is replaced, saved, cancelled or the page moves on.
    return () => URL.revokeObjectURL(image.src)
  }, [image])

  const choose = async (file: File) => {
    setError('')
    if (!/\.(jpe?g|png|heic|heif)$/i.test(file.name) && !/image\/(jpeg|png|hei[cf])/.test(file.type)) { setError('Choose a JPG, PNG or HEIC photo.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('That photo is over 20 MB. Choose a smaller one.'); return }
    setReading(true)
    try { setImage(await loadImage(file)) } catch { setError('That photo could not be opened. Try a JPG or PNG.') } finally { setReading(false) }
  }
  // Zooming keeps the middle of the frame where it is.
  const zoomTo = (zoom: number) => setView((v) => {
    const cx = FRAME.w / 2, cy = FRAME.h / 2
    const ratio = zoom / v.zoom
    return clamp({ zoom, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio })
  })
  const down = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y } }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start) setView((v) => clamp({ ...v, x: start.x + e.clientX - start.px, y: start.y + e.clientY - start.py }))
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 20 : 5
    const by = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (by) { e.preventDefault(); setView((v) => clamp({ ...v, x: v.x + by[0], y: v.y + by[1] })) }
  }
  const save = () => {
    if (!image) return
    const canvas = document.createElement('canvas')
    canvas.width = OUT.w
    canvas.height = OUT.h
    const r = OUT.w / FRAME.w
    canvas.getContext('2d')!.drawImage(image, view.x * r, view.y * r, size.w * r, size.h * r)
    canvas.toBlob((blob) => { if (blob) { onSave(blob); setImage(null) } else setError('The photo could not be prepared. Try again.') }, 'image/jpeg', 0.9)
  }

  return (
    <div className={`reg-field reg-field-wide reg-photo${error ? ' has-error' : ''}`}>
      <span className="reg-label-text" id="photo-label">Photo</span>
      <p className="reg-hint" id="photo-hint">For your badge and the IOL 2027 website: a clear, recent photo of your face, like a passport photo. JPG, PNG or HEIC (iPhone). Then move and zoom it to fit the frame.</p>
      {error && <p className="reg-error" id="photo-error"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      {image ? (
        <div className="reg-photo-crop">
          <div className="reg-photo-frame" style={{ width: FRAME.w, height: FRAME.h }} tabIndex={0} role="img"
            aria-label="Your photo in the frame. Drag it, or use the arrow keys, to move it." onPointerDown={down} onPointerMove={move}
            onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onKeyDown={key}>
            <img src={image.src} alt="" draggable={false} style={{ width: size.w, height: size.h, transform: `translate(${view.x}px, ${view.y}px)` }} />
          </div>
          <div className="reg-photo-tools">
            <label htmlFor="photo-zoom">Zoom</label>
            <input id="photo-zoom" type="range" min={1} max={3} step={0.01} value={view.zoom} onChange={(e) => zoomTo(Number(e.target.value))} />
            <div className="reg-photo-actions">
              <button type="button" className="reg-btn reg-btn-secondary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save photo'}</button>
              <button type="button" className="reg-btn-link" onClick={() => setImage(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <label className={`reg-dropzone${current ? ' is-filled' : ''}`}>
          <input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif" disabled={busy || reading}
            aria-labelledby="photo-label" aria-describedby={`photo-hint${error ? ' photo-error' : ''}`}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) choose(file); e.target.value = '' }} />
          {current
            ? <><Check size={22} strokeWidth={2.6} aria-hidden="true" /><span><strong>Photo saved</strong>Choose another photo to replace it.</span></>
            : <><Upload size={22} aria-hidden="true" /><span><strong>{reading ? 'Opening…' : 'Choose a photo'}</strong><span className="reg-drag-hint">or drag it here</span></span></>}
        </label>
      )}
    </div>
  )
}
