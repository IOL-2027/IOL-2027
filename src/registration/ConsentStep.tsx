// Consent forms (meeting of 24 Nov 2026). Each person signs a form about the photos, videos and personal data of IOL
// 2027: Form A at 18 or over on 21 July 2027, Form B, signed by a parent or guardian, under 18. The forms come filled in
// with the name and country, by email once People is complete and here to download. The national representative
// uploads the signed forms, as one file or several, and ticks for each person whether they consent: the organisers go
// by the ticks and keep the files as the record.
import type { FormEvent } from 'react'
import { Download, FileText, Mail, Upload } from 'lucide-react'
import type { DelegationData, Member } from './api'
import { roleToLabel } from './live'
import { Alert, Card } from './ui'

/** Ages count on the first day of the Olympiad, as on the server (server/consent-pdf.js). */
const AGE_DAY = '2027-07-21'
export function consentForm(member: Member): 'adult' | 'under18' | null {
  if (!member.dateOfBirth) return null
  const [by, bm, bd] = member.dateOfBirth.slice(0, 10).split('-').map(Number)
  const [y, m, d] = AGE_DAY.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0) >= 18 ? 'adult' : 'under18'
}

export const consentFiles = (data: DelegationData) => data.attachments.filter((a) => a.kind === 'consent_form').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
export const consentUnanswered = (data: DelegationData) => data.members.filter((m) => m.photoConsent === null || m.photoConsent === undefined)
export const consentDone = (data: DelegationData) => data.members.length > 0 && !consentUnanswered(data).length && consentFiles(data).length > 0

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
const memberOrder = (m: Member) => (m.role === 'team_leader' ? 0 : m.role === 'contestant' ? 1 : 2)

type Props = {
  data: DelegationData
  busy: boolean
  country: boolean
  error: React.ReactNode
  onUpload: (files: File[]) => void
  onRemove: (id: string) => void
  onEmail: () => void
  onSave: (answers: { memberId: string; consents: boolean | null }[]) => void
}

export function ConsentStep({ data, busy, country, error, onUpload, onRemove, onEmail, onSave }: Props) {
  const d = data.delegation
  const people = [...data.members].sort((a, b) => memberOrder(a) - memberOrder(b))
  const files = consentFiles(data)
  const self = !country
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSave(people.map((m) => {
      const v = form.get(`consent-${m.id}`)
      return { memberId: m.id, consents: v === 'yes' ? true : v === 'no' ? false : null }
    }))
  }
  const formName = (m: Member) => {
    const f = consentForm(m)
    return f === 'adult' ? 'Form A: signs it themselves' : f === 'under18' ? 'Form B: a parent or guardian signs' : 'Date of birth needed in People'
  }

  return (
    <form onSubmit={submit} noValidate data-dirty-key="consent">
      <div className="reg-cards">
        <Card id="consent-forms" number={1} title={self ? 'Get your form' : 'Get each person’s form'}
          intro={self
            ? 'The form covers the photos, videos and personal data of IOL 2027. Your name is already filled in: type the rest in on a computer or tablet, or print it, sign it and take a photo.'
            : 'Each form covers the photos, videos and personal data of IOL 2027, with the person’s name and country already filled in. Anyone under 18 on 21 July 2027 needs a parent or guardian to sign. The forms can be typed in on a computer or tablet, or printed, signed and photographed.'}>
          <p className="reg-consent-status">
            <Mail size={18} aria-hidden="true" />
            <span>{d.consentFormsEmailedAt
              ? <>We emailed {self ? 'your form' : 'the forms'} to {d.teamLeaderEmail} on {dayOf(d.consentFormsEmailedAt)}. Not there? Check your spam folder, or download {self ? 'it' : 'them'} below.</>
              : <>We email {self ? 'your form' : 'everyone’s forms'} to {d.teamLeaderEmail} once {self ? 'your details are' : 'everyone’s details are'} complete in {self ? 'Your details' : 'People'}. You can download {self ? 'it' : 'them'} here meanwhile.</>}</span>
            <button type="button" className="reg-btn-link" disabled={busy} onClick={onEmail}>{d.consentFormsEmailedAt ? 'Email again' : 'Email now'}</button>
          </p>
          <ul className="reg-consent-people">
            {people.map((m) => (
              <li key={m.id}>
                <span><strong>{m.displayName}</strong><small>{roleToLabel[m.role]} · {formName(m)}</small></span>
                {consentForm(m)
                  ? <a className="reg-btn-link" href={`/api/registration/members/${m.id}/consent-form`} download><Download size={16} aria-hidden="true" />Download<span className="reg-visually-hidden"> the form for {m.displayName}</span></a>
                  : <span className="reg-muted">Not ready</span>}
              </li>
            ))}
          </ul>
        </Card>

        <Card id="consent-upload" number={2} done={files.length > 0} title={self ? 'Upload your signed form' : 'Upload the signed forms'}
          intro={self ? 'The signed form, or a photo of it.' : 'One PDF with everyone’s forms, or a file for each person: either is fine. Photos of printed forms are fine too.'}>
          {files.length > 0 && (
            <ul className="reg-files" aria-label="Signed forms uploaded">
              {files.map((file) => (
                <li key={file.id}>
                  <FileText size={20} aria-hidden="true" />
                  <span><strong>{file.originalFilename}</strong>Uploaded {dayOf(file.createdAt)}</span>
                  <button type="button" className="reg-btn-link reg-btn-remove" disabled={busy} onClick={() => onRemove(file.id)}>
                    Remove<span className="reg-visually-hidden"> {file.originalFilename}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="reg-field reg-field-wide">
            <span className="reg-label-text" id="consent-files-label">{files.length ? 'Add more files' : 'Signed forms'}</span>
            <p className="reg-hint" id="consent-files-hint">You can choose several files at once: PDF, JPG, PNG, WEBP or HEIC, up to 10 MB each.</p>
            <label className="reg-dropzone">
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy}
                aria-labelledby="consent-files-label" aria-describedby="consent-files-hint"
                onChange={(e) => { const chosen = [...(e.target.files ?? [])]; if (chosen.length) onUpload(chosen); e.target.value = '' }} />
              <Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : files.length ? 'Choose more files' : 'Choose files'}</strong><span className="reg-drag-hint">or drag them here</span></span>
            </label>
          </div>
        </Card>

        <Card id="consent-answers" number={3} done={!consentUnanswered(data).length && people.length > 0} title={self ? 'Your answer' : 'Each person’s answer'}
          intro={self ? 'As you ticked on your signed form.' : 'As ticked on each signed form. We go by these answers; the files are kept as the record. Anyone who does not consent can step out of group photos.'}>
          <table className="reg-consent-table">
            <thead><tr><th scope="col">Person</th><th scope="col">Consents</th><th scope="col">Does not consent</th></tr></thead>
            <tbody>
              {people.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.displayName}<small>{roleToLabel[m.role]}</small></th>
                  <td><label className="reg-consent-choice"><input type="radio" name={`consent-${m.id}`} value="yes" defaultChecked={m.photoConsent === true} /><span className="reg-visually-hidden">{m.displayName} consents</span></label></td>
                  <td><label className="reg-consent-choice"><input type="radio" name={`consent-${m.id}`} value="no" defaultChecked={m.photoConsent === false} /><span className="reg-visually-hidden">{m.displayName} does not consent</span></label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="reg-panel-actions">
        <Alert>{error}</Alert>
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </form>
  )
}
