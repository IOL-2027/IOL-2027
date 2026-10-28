// Lanyard badges as a print-ready PDF: 10 × 14 cm. The front's name band is coloured by group, so a door or desk can
// tell people apart at a glance: contestants plum, Team Leaders teal, observers terracotta, and event staff, guides,
// volunteers and guests gold. The role is printed beside the QR as well, for anyone who cannot tell the colours
// apart. Names are fitted to the space: a long one gets smaller, then takes two lines. The QR is drawn as shapes, so
// it stays sharp at any size, with the IOL 2027 flame in the middle; it uses the highest error correction so the
// flame does not stop it from scanning.
//
// The back, the same for everyone, lists contacts (the organisers, the campus, the hotel, the hospital) from text
// the registration admins edit in the back office, above Thailand's emergency numbers.
//
// Layouts: `shop` puts one badge on each page with 3 mm bleed and sets the trim and bleed boxes, for a print shop,
// with its back on the next page; `a4` puts four on an A4 sheet with cut marks, for printing a few at the
// registration desk, with a sheet of backs after each sheet of fronts; `preview` is one badge at its finished size.
import { fileURLToPath } from 'node:url'
import * as fontkit from 'fontkit'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url))
const mm = (value) => (value * 72) / 25.4
const WIDTH = mm(100)
const HEIGHT = mm(140)
const BLEED = mm(3)
const MARGIN = mm(7)
const colour = { ink: '#160c1b', muted: '#5f5565', plum: '#681f7a', gold: '#eda363', onPlum: '#eadcef', onGold: '#3a2a35', white: '#ffffff' }
// Each group's band, the text on it, the strip along the bottom and the role beside the QR. White on every dark band
// is above 7:1; the country line is gold, or a paler gold where plain gold would fall below 4.5:1.
const groups = {
  contestant: { band: colour.plum, name: colour.white, fullName: colour.onPlum, place: colour.gold, strip: colour.gold, role: colour.plum },
  team_leader: { band: '#0f5c5a', name: colour.white, fullName: '#d2e9e6', place: '#f7c98c', strip: colour.gold, role: '#0f5c5a' },
  observer: { band: '#8f3222', name: colour.white, fullName: '#f3d9d1', place: '#f7c98c', strip: colour.gold, role: '#8f3222' },
  staff: { band: colour.gold, name: colour.ink, fullName: colour.onGold, place: colour.plum, strip: colour.plum, role: colour.plum },
}
const groupOf = (badge) => (badge.kind === 'staff' ? 'staff' : { 'Team Leader': 'team_leader', Observer: 'observer' }[badge.role] ?? 'contestant')
// Top to bottom: the white header with the logo, the coloured band with the name, the QR area, the strip.
const BAND_TOP = mm(36)
const BAND_BOTTOM = mm(92)
const STRIP_TOP = mm(133)
const GAP_AFTER_NAME = mm(2.2)
const GAP_BEFORE_PLACE = mm(4.2)

// Each style tries Manrope (the website's typeface) first, then Noto Sans for scripts Manrope lacks (and for
// Vietnamese it has), then Noto Sans Thai.
const fontFiles = {
  'Manrope-ExtraBold': 'Manrope-ExtraBold.ttf', 'Manrope-Bold': 'Manrope-Bold.ttf', 'Manrope-Medium': 'Manrope-Medium.ttf',
  'NotoSans-Bold': 'NotoSans-Bold.ttf', 'NotoSans-Regular': 'NotoSans-Regular.ttf',
  'NotoSansThai-Bold': 'NotoSansThai-Bold.ttf', 'NotoSansThai-Medium': 'NotoSansThai-Medium.ttf',
}
const styles = {
  display: ['Manrope-ExtraBold', 'NotoSans-Bold', 'NotoSansThai-Bold'],
  bold: ['Manrope-Bold', 'NotoSans-Bold', 'NotoSansThai-Bold'],
  medium: ['Manrope-Medium', 'NotoSans-Regular', 'NotoSansThai-Medium'],
}
const glyphs = Object.fromEntries(Object.entries(fontFiles).map(([name, file]) => [name, fontkit.openSync(asset(`fonts/${file}`))]))
const printableIn = (font, char) => /\s/.test(char) || glyphs[font].hasGlyphForCodePoint(char.codePointAt(0))
const fontFor = (style, text) => styles[style].find((font) => [...text].every((char) => printableIn(font, char))) ?? styles[style][0]

/** Characters no badge font has (Chinese or Japanese, for example), so the back office can warn before printing. */
export function unprintable(text) {
  return [...new Set([...String(text ?? '')].filter((char) => !styles.medium.some((font) => printableIn(font, char))))].join('')
}

/** Word-wraps `text` into at most `max` lines at the current font and size; null if it does not fit. */
function wrap(doc, text, width, max, spacing) {
  const fits = (line) => doc.widthOfString(line, { characterSpacing: spacing }) <= width
  const lines = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = lines.length ? `${lines[lines.length - 1]} ${word}` : word
    if (lines.length && fits(joined)) lines[lines.length - 1] = joined
    else if (fits(word) && lines.length < max) lines.push(word)
    else return null
  }
  return lines
}

/** Breaks a word too long for the line even at the smallest size, with a hyphen where it splits a word. */
function breakAnywhere(doc, text, width, spacing) {
  const fits = (line) => doc.widthOfString(line, { characterSpacing: spacing }) <= width
  const lines = ['']
  for (const char of text) {
    const line = lines[lines.length - 1]
    if (line && !fits(`${line + char}-`)) {
      const midWord = /\p{L}/u.test(char) && /\p{L}$/u.test(line)
      lines[lines.length - 1] = midWord ? `${line}-` : line.trimEnd()
      lines.push(char.trim())
    } else lines[lines.length - 1] = line + char
  }
  return lines
}

/**
 * How far the ink of `text` reaches above and below the baseline, in em, so blocks sit by what is printed:
 * at least a capital's height and a descender's depth, more for stacked accents or Thai vowels.
 */
function inkOf(font, text) {
  const face = glyphs[font]
  const run = face.layout(text)
  let top = face.capHeight
  let bottom = 0.2 * face.unitsPerEm
  run.glyphs.forEach((glyph, i) => {
    const { minY, maxY } = glyph.bbox
    if (Number.isFinite(maxY)) top = Math.max(top, maxY + run.positions[i].yOffset)
    if (Number.isFinite(minY)) bottom = Math.max(bottom, -(minY + run.positions[i].yOffset))
  })
  return { top: top / face.unitsPerEm, bottom: bottom / face.unitsPerEm }
}

/**
 * The largest size at which `text` fits `width`: on one line down to `oneLineMin`, then on up to `lines` lines down
 * to `min`. `scale` shrinks every size when the whole name block is too tall; `tracking` is letter spacing in em;
 * `leading` is baseline to baseline, in em.
 */
function fit(doc, text, { style, max, min, oneLineMin = min, lines = 2, width, tracking = 0, leading = 1.1, scale = 1 }) {
  const font = fontFor(style, text)
  const block = (size, wrapped) => {
    const ink = inkOf(font, text)
    return { font, size, lines: wrapped, spacing: tracking * size, leading, top: ink.top * size, height: (ink.top + (wrapped.length - 1) * leading + ink.bottom) * size }
  }
  doc.font(font)
  const attempts = [[1, oneLineMin], ...(lines > 1 ? [[lines, min]] : [])]
  for (const [count, floor] of attempts) {
    for (let size = max * scale; size >= floor * scale - 0.01; size -= 0.5) {
      doc.fontSize(size)
      const wrapped = wrap(doc, text, width, count, tracking * size)
      if (wrapped) return block(size, wrapped)
    }
  }
  const size = min * scale
  doc.fontSize(size)
  return block(size, breakAnywhere(doc, text, width, tracking * size))
}

/** Height of the name band's text: the name, then the full name and the place if there are any. */
const total = ([name, fullName, place]) => name.height + (fullName ? GAP_AFTER_NAME + fullName.height : 0) + (place ? GAP_BEFORE_PLACE + place.height : 0)

/** Draws a fitted block with the top of its ink at `y`. */
function drawBlock(doc, block, x, y, width, fill) {
  doc.font(block.font).fontSize(block.size).fillColor(fill)
  for (const [i, line] of block.lines.entries()) {
    doc.text(line, x, y + block.top + i * block.size * block.leading, { width, lineBreak: false, baseline: 'alphabetic', characterSpacing: block.spacing })
  }
}

/** The QR as filled squares, with the flame on a white tile in the middle. */
function drawQr(doc, payload, x, y, size) {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'H' })
  const cell = size / modules.size
  for (let row = 0; row < modules.size; row++) {
    let start = -1
    for (let col = 0; col <= modules.size; col++) {
      const dark = col < modules.size && modules.get(row, col)
      if (dark && start < 0) start = col
      // A hair taller than a module, so screens show no seams between rows.
      if (!dark && start >= 0) { doc.rect(x + start * cell, y + row * cell, (col - start) * cell, cell + 0.05); start = -1 }
    }
  }
  doc.fill(colour.ink)
  // The tile hides about 7% of the code; level H still reads with 30% missing.
  const tile = size * 0.27
  const tx = x + (size - tile) / 2
  const ty = y + (size - tile) / 2
  doc.roundedRect(tx, ty, tile, tile, tile * 0.16).fill(colour.white)
  doc.image(asset('badge-mark.png'), tx + tile * 0.1, ty + tile * 0.1, { width: tile * 0.8, height: tile * 0.8 })
}

/**
 * One badge with its top-left corner at (x, y). `bleed` is how far the colours run past the edge.
 * @param {{ kind: 'member'|'staff', name: string, fullName: string|null, place: string|null, role: string, detail: string|null, payload: string }} badge
 */
function drawBadge(doc, badge, x, y, bleed, logo) {
  const look = groups[groupOf(badge)]
  const left = x + MARGIN
  const inner = WIDTH - 2 * MARGIN

  doc.rect(x - bleed, y - bleed, WIDTH + 2 * bleed, HEIGHT + 2 * bleed).fill(colour.white)
  doc.rect(x - bleed, y + BAND_TOP, WIDTH + 2 * bleed, BAND_BOTTOM - BAND_TOP).fill(look.band)
  doc.rect(x - bleed, y + STRIP_TOP, WIDTH + 2 * bleed, HEIGHT - STRIP_TOP + bleed).fill(look.strip)

  // Header: the logo, and the event beside it
  const logoHeight = mm(26)
  const logoTop = y + mm(5)
  doc.image(asset('badge-logo.png'), left, logoTop, { height: logoHeight })
  const textX = left + logoHeight * (logo.width / logo.height) + mm(5)
  const textWidth = x + WIDTH - MARGIN - textX
  let ty = logoTop + logoHeight / 2 - mm(9.2)
  doc.font('Manrope-Bold').fontSize(12.5).fillColor(colour.plum)
  for (const line of ['24th International', 'Linguistics Olympiad']) { doc.text(line, textX, ty, { width: textWidth, lineBreak: false }); ty += 12.5 * 1.18 }
  ty += mm(1.6)
  doc.font('Manrope-Medium').fontSize(8.5).fillColor(colour.muted)
  for (const line of ['Bangkok, Thailand', '21–28 July 2027']) { doc.text(line, textX, ty, { width: textWidth, lineBreak: false }); ty += 8.5 * 1.35 }

  // The band: name, full name and country (or, for staff, what they are assigned to), shrunk together until they fit
  const room = BAND_BOTTOM - BAND_TOP - mm(12)
  let blocks
  for (const scale of [1, 0.92, 0.85, 0.78, 0.7, 0.62, 0.55]) {
    blocks = [
      fit(doc, badge.name, { style: 'display', max: 40, oneLineMin: 26, min: 17, lines: 2, width: inner, leading: 1.05, scale }),
      badge.fullName && fit(doc, badge.fullName, { style: 'medium', max: 13.5, oneLineMin: 11, min: 9, lines: 2, width: inner, leading: 1.3, scale }),
      badge.place && fit(doc, badge.place.toLocaleUpperCase('en'), { style: 'bold', max: 16.5, oneLineMin: 12.5, min: 9.5, lines: 2, width: inner, tracking: 0.07, leading: 1.25, scale }),
    ]
    if (total(blocks) <= room) break
  }
  const [name, fullName, place] = blocks
  let by = y + BAND_TOP + (BAND_BOTTOM - BAND_TOP - total(blocks)) / 2
  drawBlock(doc, name, left, by, inner, look.name)
  by += name.height
  if (fullName) { by += GAP_AFTER_NAME; drawBlock(doc, fullName, left, by, inner, look.fullName); by += fullName.height }
  if (place) { by += GAP_BEFORE_PLACE; drawBlock(doc, place, left, by, inner, look.place) }

  // The QR, and beside it the role (and team)
  const qrSize = mm(33)
  const qrTop = y + BAND_BOTTOM + (STRIP_TOP - BAND_BOTTOM - qrSize) / 2
  drawQr(doc, badge.payload, left, qrTop, qrSize)
  const sideX = left + qrSize + mm(6)
  const sideWidth = x + WIDTH - MARGIN - sideX
  const role = fit(doc, badge.role.toLocaleUpperCase('en'), { style: 'display', max: 17, min: 10, lines: 2, width: sideWidth, tracking: 0.03 })
  const detail = badge.detail && fit(doc, badge.detail, { style: 'medium', max: 10.5, min: 8, lines: 2, width: sideWidth, leading: 1.3 })
  const sideHeight = role.height + (detail ? mm(2) + detail.height : 0)
  let sy = qrTop + (qrSize - sideHeight) / 2
  drawBlock(doc, role, sideX, sy, sideWidth, look.role)
  if (detail) { sy += role.height + mm(2); drawBlock(doc, detail, sideX, sy, sideWidth, colour.muted) }
}

/* The back --------------------------------------------------------------------------------------------------- */

const BACK_INTRO = ['Show this side to a taxi driver or anyone helping you.', 'หากผู้ถือบัตรนี้ต้องการความช่วยเหลือ โปรดติดต่อตามข้อมูลด้านล่าง']
// Thailand's national numbers, the same on every back; the contacts above them are the admins' to edit.
const EMERGENCY = [['1669', 'Medical emergency'], ['191', 'Police'], ['1155', 'Tourist Police, in English'], ['199', 'Fire']]
const EMERGENCY_TOP = mm(114)
const ICON_COLUMN = mm(4.6)
const BACK_LIMITS = { places: 5, lines: 4, length: 90 }
// Lucide's phone, mail and map-pin icons, on its 24-unit grid with 2-unit strokes.
const icons = {
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  place: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
}

/**
 * The places on the back, from the admins' text. A line starting with # names a place ("# Name | Thai name"); the
 * lines under it are its details. A line with an email address gets a mail icon, one with a phone number a phone
 * icon, and the first other line (the address) a map pin.
 */
export function parseBack(text) {
  const places = []
  for (const line of String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('#')) {
      const [name = '', local = ''] = line.replace(/^#+\s*/, '').split('|').map((part) => part.trim())
      places.push({ name, local, lines: [] })
      continue
    }
    const place = places[places.length - 1]
    if (!place) throw new Error('Start with a line beginning with #, the name of the first place.')
    const icon = /\S+@\S+\.\S+/.test(line) ? 'mail' : /\+?\d[\d\s()-]{5,}\d/.test(line) ? 'phone' : place.lines.some((l) => l.icon === 'place') ? null : 'place'
    place.lines.push({ text: line, icon })
  }
  return places
}

function drawIcon(doc, kind, x, y, size) {
  doc.save().translate(x, y).scale(size / 24)
  for (const d of icons[kind]) doc.path(d)
  doc.lineWidth(2).lineCap('round').lineJoin('round').stroke(colour.plum)
  doc.restore()
}

/** The heading and the two lines under it, and where the contacts may start below them. */
function backHeader(doc, inner) {
  const title = fit(doc, 'Help and contacts', { style: 'display', max: 19, min: 19, lines: 1, width: inner })
  const intro = BACK_INTRO.map((text) => fit(doc, text, { style: 'medium', max: 8, min: 6.5, lines: 2, width: inner, leading: 1.3 }))
  const top = mm(8.5)
  const rule = top + title.height + mm(2.2) + intro.reduce((h, b) => h + b.height + mm(1.3), 0) + mm(1.2)
  return { title, intro, top, rule, contentTop: rule + mm(4) }
}

/**
 * Lays the places out at the largest scale at which they fit `room`: each place's name (with its Thai name beside
 * it when both fit on one line), then its lines beside their icons. `fits` is false if even the smallest is too tall.
 */
function backLayout(doc, places, room) {
  const inner = WIDTH - 2 * MARGIN
  let layout
  // No smaller than 82%: below that the address lines are under 7 pt, too small to read on a lanyard.
  for (const scale of [1.12, 1.06, 1, 0.94, 0.88, 0.82]) {
    const items = []
    let y = 0
    places.forEach((place, i) => {
      if (i) y += mm(3.2) * scale
      const name = fit(doc, place.name, { style: 'bold', max: 10, min: 10, lines: 2, width: inner, scale })
      const local = place.local && fit(doc, place.local, { style: 'medium', max: 8.5, min: 8.5, lines: 2, width: inner, scale })
      const nameWidth = doc.font(name.font).fontSize(name.size).widthOfString(name.lines[0])
      const localWidth = local && doc.font(local.font).fontSize(local.size).widthOfString(local.lines[0])
      if (local && name.lines.length === 1 && local.lines.length === 1 && nameWidth + mm(2.5) + localWidth <= inner) {
        // One line: both sit on the same baseline.
        const baseline = Math.max(name.top, local.top)
        items.push({ block: name, x: 0, y: y + baseline - name.top, fill: colour.plum }, { block: local, x: nameWidth + mm(2.5), y: y + baseline - local.top, fill: colour.muted })
        y += baseline + Math.max(name.height - name.top, local.height - local.top)
      } else {
        items.push({ block: name, x: 0, y, fill: colour.plum })
        y += name.height
        if (local) { y += mm(1) * scale; items.push({ block: local, x: 0, y, fill: colour.muted }); y += local.height }
      }
      for (const line of place.lines) {
        y += mm(1.6) * scale
        const strong = line.icon === 'phone' || line.icon === 'mail'
        const block = fit(doc, line.text, { style: strong ? 'bold' : 'medium', max: strong ? 8.8 : 8.2, min: strong ? 8.8 : 8.2, lines: 3, width: inner - ICON_COLUMN, leading: 1.32, scale })
        items.push({ block, x: ICON_COLUMN, y, fill: colour.ink, icon: line.icon })
        y += block.height
      }
    })
    layout = { items, height: y, scale, fits: y <= room }
    if (layout.fits) break
  }
  return layout
}

function drawBack(doc, places, x, y, bleed) {
  const left = x + MARGIN
  const inner = WIDTH - 2 * MARGIN
  doc.rect(x - bleed, y - bleed, WIDTH + 2 * bleed, HEIGHT + 2 * bleed).fill(colour.white)
  doc.rect(x - bleed, y - bleed, WIDTH + 2 * bleed, mm(3) + bleed).fill(colour.gold)

  const header = backHeader(doc, inner)
  let hy = y + header.top
  drawBlock(doc, header.title, left, hy, inner, colour.plum)
  hy += header.title.height + mm(2.2)
  for (const block of header.intro) { drawBlock(doc, block, left, hy, inner, colour.muted); hy += block.height + mm(1.3) }
  doc.moveTo(left, y + header.rule).lineTo(left + inner, y + header.rule).lineWidth(0.6).strokeColor('#e3d9e6').stroke()

  // The contacts, shrunk together until they fit above the emergency numbers
  const layout = backLayout(doc, places, EMERGENCY_TOP - mm(4) - header.contentTop)
  for (const item of layout.items) {
    const top = y + header.contentTop + item.y
    drawBlock(doc, item.block, left + item.x, top, inner - item.x, item.fill)
    if (item.icon) {
      const size = mm(3.1) * layout.scale
      drawIcon(doc, item.icon, left, top + item.block.top - item.block.size * 0.36 - size / 2, size)
    }
  }

  // Thailand's emergency numbers, in a row along the bottom
  const ey = y + EMERGENCY_TOP
  doc.rect(x - bleed, ey, WIDTH + 2 * bleed, HEIGHT - EMERGENCY_TOP + bleed).fill(colour.plum)
  const head = fit(doc, 'EMERGENCY IN THAILAND', { style: 'bold', max: 7.5, min: 7.5, lines: 1, width: inner, tracking: 0.1 })
  drawBlock(doc, head, left, ey + mm(4), inner, colour.gold)
  const cell = inner / EMERGENCY.length
  const numbersTop = ey + mm(4) + head.height + mm(2.6)
  EMERGENCY.forEach(([number, label], i) => {
    const cx = left + i * cell
    const n = fit(doc, number, { style: 'display', max: 17, min: 12, lines: 1, width: cell - mm(2) })
    const l = fit(doc, label, { style: 'medium', max: 7.5, oneLineMin: 7.5, min: 6.5, lines: 2, width: cell - mm(2), leading: 1.25 })
    drawBlock(doc, n, cx, numbersTop, cell - mm(2), colour.white)
    drawBlock(doc, l, cx, numbersTop + n.height + mm(1.2), cell - mm(2), colour.onPlum)
  })
}

let measuring
/** Why `text` cannot go on the back of the badge, or null if it can. */
export function backProblem(text) {
  let places
  try { places = parseBack(text) } catch (error) { return error.message }
  if (!places.length) return 'Add at least one place, on a line starting with #.'
  if (places.length > BACK_LIMITS.places) return `At most ${BACK_LIMITS.places} places fit on the back.`
  if (places.some((p) => !p.name)) return 'Every line starting with # needs the place’s name after it.'
  if (places.some((p) => p.lines.length > BACK_LIMITS.lines)) return `At most ${BACK_LIMITS.lines} lines fit under each place.`
  if (String(text).split(/\r?\n/).some((l) => l.trim().length > BACK_LIMITS.length)) return `Keep each line under ${BACK_LIMITS.length} characters.`
  const missing = unprintable(String(text).replace(/\s/g, ''))
  if (missing) return `The badge fonts cannot print “${missing}”.`
  if (!measuring) {
    measuring = new PDFDocument({ autoFirstPage: false })
    for (const [name, file] of Object.entries(fontFiles)) measuring.registerFont(name, asset(`fonts/${file}`))
  }
  const header = backHeader(measuring, WIDTH - 2 * MARGIN)
  if (!backLayout(measuring, places, EMERGENCY_TOP - mm(4) - header.contentTop).fits) return 'This is too long for the back of the badge. Shorten some lines or remove a place.'
  return null
}

/** Short cut marks in the margin of an A4 sheet, in line with the edges of the four badges. */
function cutMarks(doc, x0, y0) {
  const { width, height } = doc.page
  doc.lineWidth(0.4).strokeColor('#000000')
  for (const x of [x0, x0 + WIDTH, x0 + 2 * WIDTH]) {
    doc.moveTo(x, mm(1)).lineTo(x, y0 - mm(1.5)).moveTo(x, y0 + 2 * HEIGHT + mm(1.5)).lineTo(x, height - mm(1))
  }
  for (const y of [y0, y0 + HEIGHT, y0 + 2 * HEIGHT]) {
    doc.moveTo(mm(1), y).lineTo(x0 - mm(1.5), y).moveTo(x0 + 2 * WIDTH + mm(1.5), y).lineTo(width - mm(1), y)
  }
  doc.stroke()
}

/**
 * @param {Array<object>} badges what each badge says and its QR content (see drawBadge)
 * @param {{ layout?: 'shop'|'a4'|'preview', title?: string, back?: string|null }} options `back` is the text for the
 *   backs (see parseBack); without it the file has fronts only, as in the emails to Team Leaders
 * @returns {Promise<Buffer>}
 */
export function badgesPdf(badges, { layout = 'shop', title = 'IOL 2027 badges', back = null } = {}) {
  const size = layout === 'a4' ? 'A4' : layout === 'shop' ? [WIDTH + 2 * BLEED, HEIGHT + 2 * BLEED] : [WIDTH, HEIGHT]
  const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false, info: { Title: title, Author: 'IOL 2027 organisers' } })
  for (const [name, file] of Object.entries(fontFiles)) doc.registerFont(name, asset(`fonts/${file}`))
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  const logo = doc.openImage(asset('badge-logo.png'))
  const places = back == null ? null : parseBack(back)

  if (layout === 'a4') {
    const sheet = () => {
      doc.addPage()
      const x0 = (doc.page.width - 2 * WIDTH) / 2
      const y0 = (doc.page.height - 2 * HEIGHT) / 2
      cutMarks(doc, x0, y0)
      return [x0, y0]
    }
    for (let start = 0; start < badges.length; start += 4) {
      const four = badges.slice(start, start + 4)
      const [x0, y0] = sheet()
      four.forEach((badge, i) => drawBadge(doc, badge, x0 + (i % 2) * WIDTH, y0 + Math.floor(i / 2) * HEIGHT, 0, logo))
      if (places) {
        // Printed double-sided and flipped on the long edge, each back lands behind its front: columns swap.
        const [bx, by] = sheet()
        four.forEach((_, i) => drawBack(doc, places, bx + (1 - (i % 2)) * WIDTH, by + Math.floor(i / 2) * HEIGHT, 0))
      }
    }
  } else {
    const bleed = layout === 'shop' ? BLEED : 0
    const page = () => {
      doc.addPage()
      if (bleed) {
        // Print shops cut along the trim box; the colours run on to the edge of the bleed box.
        doc.page.dictionary.data.TrimBox = [bleed, bleed, bleed + WIDTH, bleed + HEIGHT]
        doc.page.dictionary.data.BleedBox = [0, 0, WIDTH + 2 * bleed, HEIGHT + 2 * bleed]
      }
    }
    for (const badge of badges) {
      page()
      drawBadge(doc, badge, bleed, bleed, bleed, logo)
      if (places) { page(); drawBack(doc, places, bleed, bleed, bleed) }
    }
  }
  doc.end()
  return done
}

/** The back alone at its finished size, so admins can check it before any badge exists. */
export function badgeBackPdf(back) {
  const doc = new PDFDocument({ size: [WIDTH, HEIGHT], margin: 0, info: { Title: 'IOL 2027 badge, back', Author: 'IOL 2027 organisers' } })
  for (const [name, file] of Object.entries(fontFiles)) doc.registerFont(name, asset(`fonts/${file}`))
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  drawBack(doc, parseBack(back), 0, 0, 0)
  doc.end()
  return done
}
