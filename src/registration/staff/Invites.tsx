import { useRef, useState, type FormEvent } from 'react'
import { Ban, Copy, Plus, RotateCcw, Send } from 'lucide-react'
import { api, feeCategoryLabel, type FeeCategory } from '../api'
import { Alert, TextField } from '../ui'
import { Done, FilterField, Note, Panel, Problem, TableWrap, day, errorText, useLoad } from './common'

type Invite = {
  id: string; code: string; countryTerritory: string; accreditedOrganisation: string | null; contactEmail: string | null
  status: 'active' | 'used' | 'revoked'; usedAt: string | null; usedByEmail: string | null; sentAt: string | null; sendCount: number
  feeCategory: FeeCategory
  /** A shared code (jury, volunteers) is never used up: everyone given it creates their own account. */
  kind?: 'country' | 'jury' | 'volunteer'; shared?: boolean; registrations?: number
}

const feeCategories = Object.keys(feeCategoryLabel) as FeeCategory[]

/** "Country, Organisation, email" per line; organisation and email may be left out. */
function parseLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s*[,\t]\s*/)
    const email = parts.find((p) => p.includes('@')) ?? ''
    const rest = parts.filter((p) => p !== email)
    return { countryTerritory: rest[0] ?? '', accreditedOrganisation: rest.slice(1).join(', '), contactEmail: email }
  })
}

const statusText = (invite: Invite) => (invite.status === 'used' ? 'Used' : invite.status === 'revoked' ? 'Revoked' : 'Not used yet')

export default function Invites() {
  const { data, error, reload } = useLoad<{ invites: Invite[] }>('/api/admin/invites')
  const [mode, setMode] = useState<'one' | 'many'>('one')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<'all' | 'active' | 'used' | 'revoked'>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setFormError(''); setFieldErrors({}); setDone('')
    const invites = mode === 'one'
      ? [{ countryTerritory: String(form.get('country') ?? '').trim(), accreditedOrganisation: String(form.get('organisation') ?? '').trim(), contactEmail: String(form.get('email') ?? '').trim(), feeCategory: String(form.get('feeCategory') ?? '') || undefined }]
      : parseLines(String(form.get('lines') ?? ''))
    if (mode === 'one' && !invites[0].countryTerritory) { setFieldErrors({ country: 'Enter the country or territory.' }); return }
    if (mode === 'many' && !invites.length) { setFieldErrors({ lines: 'Add at least one line.' }); return }
    setBusy(true)
    try {
      const result = await api<{ invites: Invite[] }>('/api/admin/invites', { method: 'POST', body: { invites } })
      setDone(result.invites.length === 1 ? `Code ${result.invites[0].code} created for ${result.invites[0].countryTerritory}.` : `${result.invites.length} codes created.`)
      formRef.current?.reset()
      reload()
    } catch (e) {
      setFormError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const act = async (invite: Invite, work: () => Promise<string>) => {
    setActionError(''); setDone('')
    try { setDone(await work()); reload() } catch (e) { setActionError(errorText(e)) }
  }
  const send = (invite: Invite) => act(invite, async () => {
    const result = await api<{ emailSent: boolean }>(`/api/admin/invites/${invite.id}/send`, { method: 'POST' })
    return result.emailSent ? `Invitation emailed to ${invite.contactEmail}.` : `Recorded, but not sent: ${invite.contactEmail} is a test address, or email is switched off on this server. Give them ${invite.code} yourself if needed.`
  })
  const setStatus = (invite: Invite, status: 'active' | 'revoked') => act(invite, async () => {
    await api(`/api/admin/invites/${invite.id}`, { method: 'PATCH', body: { status } })
    return status === 'revoked' ? `${invite.code} revoked. It can no longer create an account.` : `${invite.code} is active again.`
  })
  const saveContact = (invite: Invite, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    act(invite, async () => {
      await api(`/api/admin/invites/${invite.id}`, { method: 'PATCH', body: { contactEmail: String(form.get('email') ?? ''), accreditedOrganisation: String(form.get('organisation') ?? '') } })
      setEditing(null)
      return `${invite.countryTerritory}: contact saved.`
    })
  }
  const setFeeRate = (invite: Invite, feeCategory: FeeCategory) => act(invite, async () => {
    await api(`/api/admin/invites/${invite.id}`, { method: 'PATCH', body: { feeCategory } })
    return `${invite.countryTerritory}: fee rate is now ${feeCategoryLabel[feeCategory].toLowerCase()}.${invite.status === 'used' ? ' An invoice not paid yet is worked out again.' : ''}`
  })
  const makeShared = (kind: 'jury' | 'volunteer') => act({} as Invite, async () => {
    const result = await api<{ invites: Invite[] }>('/api/admin/invites', { method: 'POST', body: { kind } })
    return `${kind === 'jury' ? 'Jury' : 'Volunteer'} code ${result.invites[0].code} created. Give it only to the people the organisers have chosen.`
  })
  // "Registration is open": every country's invitation not sent yet.
  const sendAll = () => act({} as Invite, async () => {
    const result = await api<{ due: number; sent: number; failed: string[] }>('/api/admin/invites/send-all', { method: 'POST' })
    return !result.due ? 'Every country with a contact email has had its invitation already.'
      : `${result.sent} of ${result.due} invitations emailed.${result.due > result.sent ? ' The rest are test addresses, or email is off on this server.' : ''}${result.failed.length ? ` Not sent: ${result.failed.join('; ')}.` : ''}`
  })
  const copy = (invite: Invite) => act(invite, async () => {
    await navigator.clipboard.writeText(invite.code)
    return `${invite.code} copied.`
  })

  const term = search.trim().toLowerCase()
  const shared = (data?.invites ?? []).filter((i) => i.shared)
  const rows = (data?.invites ?? []).filter((i) => !i.shared && (show === 'all' || i.status === show) && (!term || `${i.countryTerritory} ${i.code} ${i.contactEmail ?? ''}`.toLowerCase().includes(term)))
  const unsent = (data?.invites ?? []).filter((i) => !i.shared && i.status === 'active' && i.contactEmail && !i.sentAt).length

  return (
    <Panel id="invites" title="Invitation codes" intro="One code per country or territory: it creates exactly one account, for the country’s national representative. Jury members and volunteers share one code each.">
      <form ref={formRef} className="reg-staff-form" onSubmit={create} noValidate>
        <div className="reg-switch reg-switch-small" role="group" aria-label="Add codes">
          <button type="button" aria-pressed={mode === 'one'} className={mode === 'one' ? 'active' : undefined} onClick={() => setMode('one')}>One country</button>
          <button type="button" aria-pressed={mode === 'many'} className={mode === 'many' ? 'active' : undefined} onClick={() => setMode('many')}>Paste a list</button>
        </div>
        {mode === 'one' ? (
          <div className="reg-grid reg-grid-3">
            <TextField idPrefix="invite" name="country" label="Country or territory" error={fieldErrors.country} autoComplete="off" />
            <TextField idPrefix="invite" name="organisation" label="Organisation (optional)" autoComplete="off" />
            <TextField idPrefix="invite" name="email" label="Contact email (optional)" type="email" autoComplete="off" />
            <div className="reg-field">
              <label htmlFor="invite-fee">Fee rate</label>
              <p className="reg-hint" id="invite-fee-hint">Automatic goes by name: previous IOL hosts, then the countries accredited on ioling.org/countries (27 Oct 2026); any other is not accredited. Check it when a name is spelt differently.</p>
              <select id="invite-fee" name="feeCategory" className="reg-control" defaultValue="" aria-describedby="invite-fee-hint">
                <option value="">Automatic</option>
                {feeCategories.map((c) => <option key={c} value={c}>{feeCategoryLabel[c]}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className={`reg-field${fieldErrors.lines ? ' has-error' : ''}`}>
            <label htmlFor="invite-lines">Countries, one per line</label>
            <p className="reg-hint" id="invite-lines-hint">Country, organisation, contact email. Only the country is required. Up to 100 lines; paste straight from a spreadsheet. Previous IOL hosts get their fee rate automatically; change any rate in the list below.</p>
            {fieldErrors.lines && <p className="reg-error" id="invite-lines-error">{fieldErrors.lines}</p>}
            <textarea id="invite-lines" name="lines" className="reg-control" rows={6} aria-describedby={`invite-lines-hint${fieldErrors.lines ? ' invite-lines-error' : ''}`}
              placeholder={'Estonia, Estonian Linguistics Olympiad, contact@example.ee\nJapan, Japan Linguistics Olympiad'} />
          </div>
        )}
        <Alert>{formError}</Alert>
        <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary" disabled={busy}><Plus size={18} aria-hidden="true" />{busy ? 'Creating…' : mode === 'one' ? 'Create code' : 'Create codes'}</button></div>
      </form>

      <h3 className="reg-staff-subhead">Jury and volunteer codes</h3>
      <p className="reg-hint">One code for all jury members and one for all volunteers. Each person given the code creates their own account. Give it only to the people the organisers have chosen (volunteers after the Google Form screening).</p>
      <ul className="reg-shared-codes">
        {(['jury', 'volunteer'] as const).map((kind) => {
          const live = shared.find((i) => i.kind === kind && i.status === 'active')
          return (
            <li key={kind}>
              <div><strong>{kind === 'jury' ? 'Jury' : 'Volunteers'}</strong>{live
                ? <span><span className="reg-code">{live.code}</span> · {live.registrations ?? 0} {live.registrations === 1 ? 'registration' : 'registrations'}</span>
                : <span className="reg-muted">No active code</span>}</div>
              <div className="reg-row-actions">
                {live ? <>
                  <button type="button" className="reg-btn-link" onClick={() => copy(live)}><Copy size={15} aria-hidden="true" />Copy<span className="reg-visually-hidden"> {live.code}</span></button>
                  <button type="button" className="reg-btn-link" onClick={() => setStatus(live, 'revoked')}><Ban size={15} aria-hidden="true" />Revoke<span className="reg-visually-hidden"> {live.code}</span></button>
                </> : <button type="button" className="reg-btn-link" onClick={() => makeShared(kind)}><Plus size={15} aria-hidden="true" />Create a {kind} code</button>}
              </div>
            </li>
          )
        })}
      </ul>

      <h3 className="reg-staff-subhead">Countries</h3>
      <div className="reg-staff-form-actions">
        <button type="button" className="reg-btn reg-btn-secondary" disabled={!unsent} onClick={sendAll}><Send size={16} aria-hidden="true" />Send every unsent invitation ({unsent})</button>
        <span className="reg-hint">Registration is open: emails each country’s official contact its code, if not sent yet.</span>
      </div>
      <div className="reg-filter-bar">
        <div className="reg-filter" role="group" aria-label="Show codes">
          {([['all', 'All'], ['active', 'Not used'], ['used', 'Used'], ['revoked', 'Revoked']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} className={show === value ? 'active' : undefined} onClick={() => setShow(value)}>{label}</button>
          ))}
        </div>
        <FilterField id="invite-search" label="Search">
          <input id="invite-search" className="reg-control reg-control-compact" type="search" placeholder="Country, code or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FilterField>
      </div>
      <Problem message={error || actionError} />
      <Done message={done} />
      {data && (rows.length === 0 ? <Note>No codes match.</Note> : (
        <TableWrap label="Invitation codes">
          <thead><tr><th scope="col">Country</th><th scope="col">Code</th><th scope="col">Fee rate</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col"><span className="reg-visually-hidden">Actions</span></th></tr></thead>
          <tbody>{rows.map((i) => (
            <tr key={i.id}>
              <th scope="row">{i.countryTerritory}{i.accreditedOrganisation && <small>{i.accreditedOrganisation}</small>}</th>
              <td><span className="reg-code">{i.code}</span></td>
              <td>
                <label className="reg-visually-hidden" htmlFor={`inv-fee-${i.id}`}>Fee rate for {i.countryTerritory}</label>
                <select id={`inv-fee-${i.id}`} className="reg-control reg-control-compact" value={i.feeCategory} disabled={i.status === 'revoked'} onChange={(e) => setFeeRate(i, e.target.value as FeeCategory)}>
                  {feeCategories.map((c) => <option key={c} value={c}>{feeCategoryLabel[c]}</option>)}
                </select>
              </td>
              <td>{editing === i.id ? (
                <form className="reg-inline-form" onSubmit={(e) => saveContact(i, e)}>
                  <label className="reg-visually-hidden" htmlFor={`inv-email-${i.id}`}>Contact email for {i.countryTerritory}</label>
                  <input id={`inv-email-${i.id}`} name="email" type="email" className="reg-control reg-control-compact" defaultValue={i.contactEmail ?? ''} placeholder="Email" />
                  <label className="reg-visually-hidden" htmlFor={`inv-org-${i.id}`}>Organisation for {i.countryTerritory}</label>
                  <input id={`inv-org-${i.id}`} name="organisation" className="reg-control reg-control-compact" defaultValue={i.accreditedOrganisation ?? ''} placeholder="Organisation" />
                  <span><button type="submit" className="reg-btn-link">Save</button> <button type="button" className="reg-btn-link" onClick={() => setEditing(null)}>Cancel</button></span>
                </form>
              ) : <>{i.contactEmail ?? <span className="reg-muted">No email</span>}{i.status !== 'used' && <> <button type="button" className="reg-inline-btn" onClick={() => setEditing(i.id)}>Edit<span className="reg-visually-hidden"> contact for {i.countryTerritory}</span></button></>}</>}</td>
              <td>{statusText(i)}<small>{i.status === 'used'
                ? <>{i.usedByEmail && i.usedByEmail !== i.contactEmail ? `by ${i.usedByEmail} ` : ''}on {day(i.usedAt)}</>
                : i.sentAt ? <>Sent {day(i.sentAt)}{i.sendCount > 1 ? ` (${i.sendCount} times)` : ''}</> : 'Not sent yet'}</small></td>
              <td><div className="reg-row-actions">
                <button type="button" className="reg-btn-link" onClick={() => copy(i)}><Copy size={15} aria-hidden="true" />Copy<span className="reg-visually-hidden"> {i.code}</span></button>
                {i.status === 'active' && i.contactEmail && <button type="button" className="reg-btn-link" onClick={() => send(i)}><Send size={15} aria-hidden="true" />{i.sentAt ? 'Send again' : 'Send'}<span className="reg-visually-hidden"> to {i.countryTerritory}</span></button>}
                {i.status === 'active' && <button type="button" className="reg-btn-link" onClick={() => setStatus(i, 'revoked')}><Ban size={15} aria-hidden="true" />Revoke<span className="reg-visually-hidden"> {i.code}</span></button>}
                {i.status === 'revoked' && <button type="button" className="reg-btn-link" onClick={() => setStatus(i, 'active')}><RotateCcw size={15} aria-hidden="true" />Reactivate<span className="reg-visually-hidden"> {i.code}</span></button>}
              </div></td>
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
    </Panel>
  )
}
