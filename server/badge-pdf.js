// Lanyard badges as a print-ready PDF: 10 × 14 cm, front only. One design for delegation members (Team Leaders,
// contestants and observers, on plum) and one for event staff, guides, volunteers and guests (on gold). Names are
// fitted to the space: a long one gets smaller, then takes two lines. The QR is drawn as shapes, so it stays sharp
// at any size, with the IOL 2027 flame in the middle; it uses the highest error correction so the flame does not
// stop it from scanning.
//
// Layouts: `shop` puts one badge on each page with 3 mm bleed and sets the trim and bleed boxes, for a print shop;
// `a4` puts four on an A4 sheet with cut marks, for printing a few at the registration desk; `preview` is one
// badge at its finished size.
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
  const staff = badge.kind === 'staff'
  const left = x + MARGIN
  const inner = WIDTH - 2 * MARGIN

  doc.rect(x - bleed, y - bleed, WIDTH + 2 * bleed, HEIGHT + 2 * bleed).fill(colour.white)
  doc.rect(x - bleed, y + BAND_TOP, WIDTH + 2 * bleed, BAND_BOTTOM - BAND_TOP).fill(staff ? colour.gold : colour.plum)
  doc.rect(x - bleed, y + STRIP_TOP, WIDTH + 2 * bleed, HEIGHT - STRIP_TOP + bleed).fill(staff ? colour.plum : colour.gold)

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
  drawBlock(doc, name, left, by, inner, staff ? colour.ink : colour.white)
  by += name.height
  if (fullName) { by += GAP_AFTER_NAME; drawBlock(doc, fullName, left, by, inner, staff ? colour.onGold : colour.onPlum); by += fullName.height }
  if (place) { by += GAP_BEFORE_PLACE; drawBlock(doc, place, left, by, inner, staff ? colour.plum : colour.gold) }

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
  drawBlock(doc, role, sideX, sy, sideWidth, colour.plum)
  if (detail) { sy += role.height + mm(2); drawBlock(doc, detail, sideX, sy, sideWidth, colour.muted) }
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
 * @param {{ layout?: 'shop'|'a4'|'preview', title?: string }} options
 * @returns {Promise<Buffer>}
 */
export function badgesPdf(badges, { layout = 'shop', title = 'IOL 2027 badges' } = {}) {
  const size = layout === 'a4' ? 'A4' : layout === 'shop' ? [WIDTH + 2 * BLEED, HEIGHT + 2 * BLEED] : [WIDTH, HEIGHT]
  const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false, info: { Title: title, Author: 'IOL 2027 organisers' } })
  for (const [name, file] of Object.entries(fontFiles)) doc.registerFont(name, asset(`fonts/${file}`))
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  const logo = doc.openImage(asset('badge-logo.png'))

  if (layout === 'a4') {
    let x0
    let y0
    badges.forEach((badge, i) => {
      if (i % 4 === 0) {
        doc.addPage()
        x0 = (doc.page.width - 2 * WIDTH) / 2
        y0 = (doc.page.height - 2 * HEIGHT) / 2
        cutMarks(doc, x0, y0)
      }
      drawBadge(doc, badge, x0 + (i % 2) * WIDTH, y0 + Math.floor((i % 4) / 2) * HEIGHT, 0, logo)
    })
  } else {
    const bleed = layout === 'shop' ? BLEED : 0
    for (const badge of badges) {
      doc.addPage()
      if (bleed) {
        // Print shops cut along the trim box; the colours run on to the edge of the bleed box.
        doc.page.dictionary.data.TrimBox = [bleed, bleed, bleed + WIDTH, bleed + HEIGHT]
        doc.page.dictionary.data.BleedBox = [0, 0, WIDTH + 2 * bleed, HEIGHT + 2 * bleed]
      }
      drawBadge(doc, badge, bleed, bleed, bleed, logo)
    }
  }
  doc.end()
  return done
}
