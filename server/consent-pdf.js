// Consent forms (meeting of 24 Nov 2026): the organisers' two forms, Form A for anyone 18 or over on the first day of
// the Olympiad and Form B (a parent or guardian signs) for anyone younger. The forms are the professor's HTML, printed
// once to blank A4 PDFs (server/assets/consent, with layout.json saying where each field is). For each person the
// server writes their name and country in and adds boxes that can be typed in and ticked: the signature, the date,
// the parent's name and the consent choice. The forms can also be printed, signed by hand and photographed. Nobody
// reads the signed files: they are kept as evidence, and the national representative's tick for each person in the
// portal is what counts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'

const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url))
const layout = JSON.parse(readFileSync(asset('consent/layout.json'), 'utf8'))
const templates = { adult: readFileSync(asset('consent/consent-adult.pdf')), under18: readFileSync(asset('consent/consent-under18.pdf')) }
const fontBytes = readFileSync(asset('fonts/NotoSans-Regular.ttf'))

/** Ages are counted on the first day of the Olympiad. */
export const CONSENT_AGE_DAY = '2027-07-21'

/** Age in whole years on a day, from a date of birth (a Date or YYYY-MM-DD). */
export function ageOn(dateOfBirth, day = CONSENT_AGE_DAY) {
  const birth = typeof dateOfBirth === 'string' ? dateOfBirth.slice(0, 10) : dateOfBirth.toISOString().slice(0, 10)
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = day.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** Which form a person signs: 'adult', 'under18', or null while their date of birth is not in yet. */
export function consentFormKind(member) {
  if (!member.date_of_birth) return null
  return ageOn(member.date_of_birth) >= 18 ? 'adult' : 'under18'
}

/** The name written on the form: as on certificates, else as in the passport, else the name in the portal. */
export const consentName = (member) => (member.official_name || member.passport_name || member.display_name || '').trim()

/** The file's name, as agreed: the person's name and surname, then the country, e.g. IOL2027-Consent_Somchai-Boonmee_Thailand.pdf. */
export function consentFileName(member, country) {
  const part = (text) => String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'person'
  return `IOL2027-Consent_${part(consentName(member))}_${part(country)}.pdf`
}

/** Writes text into a field's line, made smaller if it would not fit. */
function writeIn(page, font, box, text) {
  let size = 10.5
  while (size > 6.5 && font.widthOfTextAtSize(text, size) > box.w - 6) size -= 0.5
  page.drawText(text, { x: box.x + 3, y: box.y + 4, size, font, color: rgb(0.1, 0.1, 0.1) })
}

/**
 * One person's form as a PDF (a Buffer). `member` is a members row (with date_of_birth), `country` the delegation's
 * country or territory (for a jury member or volunteer: "IOL 2027 jury" or "IOL 2027 volunteers").
 */
export async function consentPdf(member, country) {
  const kind = consentFormKind(member)
  if (!kind) throw new Error('No date of birth, so the form cannot be chosen.')
  const doc = await PDFDocument.load(templates[kind])
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })
  const page = doc.getPage(0)
  const form = doc.getForm()
  const { lines, boxes } = layout[kind]
  // Form A: 01 the attendee's name and 02 the country are written in; 03 (the signature) and 04 (the date) are left to
  // fill. Form B: 02 the participant's name and 03 the country are written in; the parent's name (01 and 04) and the
  // date (05) are left to fill, as the organisers do not know the parent's name.
  const filled = kind === 'adult' ? { 0: consentName(member), 1: country } : { 1: consentName(member), 2: country }
  lines.forEach((box, i) => {
    if (filled[i] !== undefined) { writeIn(page, font, box, filled[i]); return }
    // Named after the line it fills, which PDF viewers show as the field's tooltip (review of 27 Nov 2026).
    const base = String(box.label ?? `Field ${i + 1}`).replace(/\./g, '')
    const name = form.getFields().some((f) => f.getName() === base) ? `${base} (${i + 1})` : base
    const field = form.createTextField(name)
    field.addToPage(page, { x: box.x, y: box.y + 1.5, width: box.w, height: box.h - 1.5, font, borderWidth: 0, borderColor: undefined, backgroundColor: undefined, textColor: rgb(0.1, 0.1, 0.1) })
    field.setFontSize(10)
  })
  // The consent statement: tick one box.
  const choice = form.createRadioGroup('consent')
  boxes.forEach((box, i) => choice.addOptionToPage(i === 0 ? 'I consent' : 'I do not consent', page, { x: box.x, y: box.y, width: box.w, height: box.h, borderWidth: 0, borderColor: undefined, backgroundColor: undefined, textColor: rgb(0.41, 0.12, 0.48) }))
  form.updateFieldAppearances(font)
  doc.setTitle(`IOL 2027 consent form: ${consentName(member)} (${country})`)
  doc.setAuthor('IOL 2027 Organising Committee')
  return Buffer.from(await doc.save())
}
