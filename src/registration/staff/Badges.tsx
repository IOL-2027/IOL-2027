// Badges: every lanyard badge, for delegation members and for event staff, ready for the print shop. Download a
// print file of what the filters show, send it to print, then mark those badges printed; a badge whose name, role,
// place or QR changes afterwards comes back under "Needs reprint". Staff, guides, volunteers and guests are added
// here, since they are not in any delegation, and the contacts on the back of every badge are edited at the end.
import { useRef, useState, type FormEvent } from 'react'
import { Check, Eye, FileDown, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Alert, TextField } from '../ui'
import { Done, FilterField, Note, Panel, Problem, TableWrap, day, errorText, useLoad } from './common'

type Badge = {
  id: string; kind: 'member' | 'staff'; holderId: string; delegationId: string | null
  name: string; fullName: string | null; place: string | null; role: string; detail: string | null
  category: string | null; badgeName: string | null; email: string | null
  status: string; issuedAt: string; printedAt: string | null; fingerprint: string
  printState: 'not_printed' | 'printed' | 'reprint'; unprintable: string; canPrint: boolean
}
type BadgeData = { badges: Badge[]; waiting: { country: string; people: number }[]; printCutoff: string; back: string; categories: string[] }
type State = 'not_printed' | 'reprint' | 'printed' | 'all'

const categoryLabel: Record<string, string> = { staff: 'Staff', guide: 'Guide', volunteer: 'Volunteer', guest: 'Guest' }
const stateLabel: Record<Exclude<State, 'all'>, string> = { not_printed: 'Not printed', reprint: 'Needs reprint', printed: 'Printed' }

/** "Full name, role, assignment" per line, as pasted from a spreadsheet; the role is staff, guide, volunteer or guest. */
function parseLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [fullName = '', category = '', ...rest] = line.split(/\s*[,\t]\s*/)
    return { fullName, category: category.toLowerCase(), assignment: rest.join(', ') }
  })
}

function StaffForm({ categories, onAdded }: { categories: string[]; onAdded: (message: string) => void }) {
  const [mode, setMode] = useState<'one' | 'many'>('one')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    setFormError(''); setFieldErrors({})
    const people = mode === 'one'
      ? [{ fullName: value('fullName'), badgeName: value('badgeName'), category: value('category'), assignment: value('assignment') }]
      : parseLines(value('lines'))
    if (mode === 'one' && !people[0].fullName) { setFieldErrors({ fullName: 'Enter the person’s full name.' }); return }
    if (mode === 'many' && !people.length) { setFieldErrors({ lines: 'Add at least one line.' }); return }
    setBusy(true)
    try {
      const result = await api<{ badges: Badge[] }>('/api/admin/event-staff', { method: 'POST', body: { people } })
      onAdded(result.badges.length === 1 ? `${result.badges[0].name} added, with a badge.` : `${result.badges.length} people added, each with a badge.`)
      formRef.current?.reset()
    } catch (e) {
      setFormError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form ref={formRef} className="reg-staff-form" onSubmit={add} noValidate>
      <h3 className="reg-staff-subhead">Add staff, guides, volunteers and guests</h3>
      <div className="reg-switch reg-switch-small" role="group" aria-label="Add people">
        <button type="button" aria-pressed={mode === 'one'} className={mode === 'one' ? 'active' : undefined} onClick={() => setMode('one')}>One person</button>
        <button type="button" aria-pressed={mode === 'many'} className={mode === 'many' ? 'active' : undefined} onClick={() => setMode('many')}>Paste a list</button>
      </div>
      {mode === 'one' ? (
        <div className="reg-grid reg-grid-3">
          <TextField idPrefix="staff" name="fullName" label="Full name" error={fieldErrors.fullName} autoComplete="off" />
          <TextField idPrefix="staff" name="badgeName" label="Badge name (optional)" hint="Printed large. Leave empty to print the full name large." autoComplete="off" />
          <div className="reg-field">
            <label htmlFor="staff-category">Role</label>
            <select id="staff-category" name="category" className="reg-control">{categories.map((c) => <option key={c} value={c}>{categoryLabel[c] ?? c}</option>)}</select>
          </div>
          <TextField idPrefix="staff" name="assignment" label="Assignment (optional)" hint="Printed under the name, e.g. “Guide for Japan A” or “Registration desk”." autoComplete="off" />
        </div>
      ) : (
        <div className={`reg-field${fieldErrors.lines ? ' has-error' : ''}`}>
          <label htmlFor="staff-lines">People, one per line</label>
          <p className="reg-hint" id="staff-lines-hint">Full name, role (staff, guide, volunteer or guest), assignment. The assignment may be left out. Up to 300 lines; paste straight from a spreadsheet.</p>
          {fieldErrors.lines && <p className="reg-error" id="staff-lines-error">{fieldErrors.lines}</p>}
          <textarea id="staff-lines" name="lines" className="reg-control" rows={6} aria-describedby={`staff-lines-hint${fieldErrors.lines ? ' staff-lines-error' : ''}`}
            placeholder={'Kanokwan Srisuk, guide, Guide for Japan A\nSomchai Jaidee, staff, Registration desk'} />
        </div>
      )}
      <Alert>{formError}</Alert>
      <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary" disabled={busy}><Plus size={18} aria-hidden="true" />{busy ? 'Adding…' : mode === 'one' ? 'Add person' : 'Add people'}</button></div>
    </form>
  )
}

function EditStaff({ badge, categories, onDone, onCancel }: { badge: Badge; categories: string[]; onDone: (message: string) => void; onCancel: () => void }) {
  const [error, setError] = useState('')
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    try {
      await api(`/api/admin/event-staff/${badge.holderId}`, { method: 'PATCH', body: { fullName: value('fullName'), badgeName: value('badgeName'), category: value('category'), assignment: value('assignment') } })
      onDone(`${value('badgeName') || value('fullName')}: saved.`)
    } catch (e) {
      setError(errorText(e))
    }
  }
  const id = (name: string) => `edit-${badge.id}-${name}`
  return (
    <form className="reg-badge-edit" onSubmit={save} noValidate>
      <div className="reg-grid reg-grid-3">
        <div className="reg-field"><label htmlFor={id('fullName')}>Full name</label><input id={id('fullName')} name="fullName" className="reg-control" defaultValue={badge.fullName ?? badge.name} /></div>
        <div className="reg-field"><label htmlFor={id('badgeName')}>Badge name (optional)</label><input id={id('badgeName')} name="badgeName" className="reg-control" defaultValue={badge.badgeName ?? ''} /></div>
        <div className="reg-field"><label htmlFor={id('category')}>Role</label>
          <select id={id('category')} name="category" className="reg-control" defaultValue={badge.category ?? 'staff'}>{categories.map((c) => <option key={c} value={c}>{categoryLabel[c] ?? c}</option>)}</select></div>
        <div className="reg-field"><label htmlFor={id('assignment')}>Assignment (optional)</label><input id={id('assignment')} name="assignment" className="reg-control" defaultValue={badge.place ?? ''} /></div>
      </div>
      <Alert>{error}</Alert>
      <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary">Save</button><button type="button" className="reg-btn-link" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

function PrintCutoff({ value, onSaved }: { value: string; onSaved: (message: string) => void }) {
  const [error, setError] = useState('')
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const printCutoff = String(new FormData(event.currentTarget).get('printCutoff') ?? '')
    setError('')
    try {
      await api('/api/admin/settings/badges', { method: 'PUT', body: { printCutoff } })
      onSaved(`Print cut-off saved: ${day(printCutoff)}.`)
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <form onSubmit={save} noValidate key={value}>
      <h3 className="reg-staff-subhead">Print schedule</h3>
      <div className="reg-inline-fields">
        <div className="reg-field">
          <label htmlFor="badge-cutoff">Print cut-off</label>
          <p className="reg-hint" id="badge-cutoff-hint">The last day of changes that go to the print shop. Badges changed after it are printed on A4 at the registration desk.</p>
          <input id="badge-cutoff" name="printCutoff" type="date" className="reg-control" defaultValue={value} aria-describedby="badge-cutoff-hint" />
        </div>
        <button type="submit" className="reg-btn reg-btn-secondary">Save date</button>
      </div>
      <Alert>{error}</Alert>
    </form>
  )
}

function BadgeBack({ value, onSaved }: { value: string; onSaved: (message: string) => void }) {
  const [error, setError] = useState('')
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('back') ?? '')
    setError('')
    try {
      await api('/api/admin/settings/badge-back', { method: 'PUT', body: { text } })
      onSaved('Back of the badge saved. Print files from now on use it.')
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <form onSubmit={save} noValidate key={value}>
      <h3 className="reg-staff-subhead">Back of the badge</h3>
      <div className="reg-field">
        <label htmlFor="badge-back">Contacts</label>
        <p className="reg-hint" id="badge-back-hint">The same on every badge, above Thailand’s emergency numbers (1669, 191, 1155, 199), which are always printed. Start each place with a line beginning with #, then its Thai name after a | if it has one. Lines under it get an icon: a phone number gets a phone, an email address an envelope, and the first other line (the address) a map pin. Up to 5 places, 4 lines each; the text shrinks to fit.</p>
        <textarea id="badge-back" name="back" className="reg-control reg-badge-back" rows={18} defaultValue={value} aria-describedby="badge-back-hint" spellCheck={false} />
      </div>
      <Alert>{error}</Alert>
      <div className="reg-staff-form-actions">
        <button type="submit" className="reg-btn reg-btn-secondary">Save the back</button>
        <a className="reg-btn-link" href="/api/admin/badges/back" target="_blank" rel="noreferrer"><Eye size={15} aria-hidden="true" />Preview the saved back</a>
      </div>
    </form>
  )
}

export default function Badges() {
  const { data, error, reload } = useLoad<BadgeData>('/api/admin/badges')
  const [kind, setKind] = useState<'member' | 'staff'>('member')
  const [state, setState] = useState<State>('not_printed')
  const [place, setPlace] = useState('')
  const [search, setSearch] = useState('')
  const [done, setDone] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirming, setConfirming] = useState('')
  const [editing, setEditing] = useState('')

  const act = async (work: () => Promise<string>) => {
    setActionError(''); setDone(''); setConfirming('')
    try { setDone(await work()); reload() } catch (e) { setActionError(errorText(e)) }
  }
  const finished = (message: string) => { setDone(message); setEditing(''); reload() }

  const ofKind = (data?.badges ?? []).filter((b) => b.kind === kind)
  const places = [...new Set(ofKind.map((b) => b.place).filter((p): p is string => Boolean(p)))].sort()
  const term = search.trim().toLowerCase()
  const rows = ofKind.filter((b) => (state === 'all' || b.printState === state) && (!place || b.place === place)
    && (!term || `${b.name} ${b.fullName ?? ''} ${b.place ?? ''}`.toLowerCase().includes(term)))
  const printable = rows.filter((b) => b.canPrint)
  const count = (s: Exclude<State, 'all'>) => ofKind.filter((b) => b.printState === s).length
  const query = new URLSearchParams({ kind, state, ...(place ? { place } : {}), ...(term ? { search: search.trim() } : {}) }).toString()
  const waiting = data?.waiting ?? []
  const placeLabel = kind === 'member' ? 'Country' : 'Assignment'

  const markPrinted = () => act(async () => {
    const result = await api<{ marked: number }>('/api/admin/badges/printed', { method: 'POST', body: { badges: printable.map(({ id, fingerprint }) => ({ id, fingerprint })) } })
    return `${result.marked} ${result.marked === 1 ? 'badge' : 'badges'} marked as printed.`
  })
  const newQr = (b: Badge) => act(async () => {
    await api(`/api/admin/badges/${b.id}/new-qr`, { method: 'POST' })
    return `${b.name} has a new QR. The old badge no longer scans; print this one again.${b.kind === 'member' ? ' The Team Leader gets the new badge by email at 8:00 Bangkok time.' : ''}`
  })
  const remove = (b: Badge) => act(async () => {
    await api(`/api/admin/event-staff/${b.holderId}`, { method: 'DELETE' })
    return `${b.name} removed, with their badge.`
  })

  return (
    <Panel id="badges" title="Badges" intro="Lanyard badges for every delegation member and for staff, guides, volunteers and guests. Download a print file, send it to the print shop, then mark those badges as printed. A badge whose name, role or QR changes afterwards comes back under Needs reprint.">
      <Problem message={error} />
      {data && <>
        <div className="reg-switch reg-switch-small" role="group" aria-label="Whose badges">
          {([['member', 'Delegations'], ['staff', 'Staff and volunteers']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={kind === value} className={kind === value ? 'active' : undefined}
              onClick={() => { setKind(value); setPlace(''); setEditing(''); setConfirming('') }}>{label} ({data.badges.filter((b) => b.kind === value).length})</button>
          ))}
        </div>

        {kind === 'member' && waiting.length > 0 && <Note>
          {waiting.reduce((n, w) => n + w.people, 0)} more people get a badge once their country’s registration is settled (submitted, paid and everyone’s travel entered): {waiting.map((w) => `${w.country} (${w.people})`).join(', ')}.
        </Note>}
        {kind === 'member' && <p className="reg-hint">Each Team Leader is emailed their country’s badges as PDFs when the registration is settled, and again at 8:00 Bangkok time the next morning whenever a name, team or QR changes.</p>}
        {kind === 'staff' && <StaffForm categories={data.categories} onAdded={finished} />}

        <div className="reg-filter-bar">
          <div className="reg-filter" role="group" aria-label="Show badges">
            {(['not_printed', 'reprint', 'printed'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={state === value} className={state === value ? 'active' : undefined} onClick={() => setState(value)}>{stateLabel[value]} ({count(value)})</button>
            ))}
            <button type="button" aria-pressed={state === 'all'} className={state === 'all' ? 'active' : undefined} onClick={() => setState('all')}>All</button>
          </div>
          {places.length > 1 && <FilterField id="badge-place" label={placeLabel}>
            <select id="badge-place" className="reg-control reg-control-compact" value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">All</option>{places.map((p) => <option key={p}>{p}</option>)}
            </select>
          </FilterField>}
          <FilterField id="badge-search" label="Search">
            <input id="badge-search" className="reg-control reg-control-compact" type="search" placeholder={`Name or ${placeLabel.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </FilterField>
        </div>

        <div className="reg-badge-print">
          {printable.length ? <>
            <a className="reg-btn reg-btn-primary" href={`/api/admin/badges/print?${query}&layout=shop`}><FileDown size={18} aria-hidden="true" />Print file for the print shop ({printable.length})</a>
            <a className="reg-btn reg-btn-secondary" href={`/api/admin/badges/print?${query}&layout=a4`}><FileDown size={18} aria-hidden="true" />A4 sheets, 4 per page</a>
            {state !== 'printed' && <button type="button" className="reg-btn-link" onClick={() => void markPrinted()}><Check size={16} aria-hidden="true" />Mark these {printable.length} as printed</button>}
          </> : rows.length > 0 && <p className="reg-muted">No badges to print with these filters.</p>}
        </div>
        <p className="reg-hint">The print shop file has one page per side: each badge’s front, then its back, 10 × 14 cm with 3 mm bleed, to print double-sided. The A4 file has a sheet of backs after each sheet of fronts; print it double-sided, flipping on the long edge. Check the file, send it, then mark the badges as printed.</p>

        <Problem message={actionError} />
        <Done message={done} />
        {rows.length === 0 ? <Note>{ofKind.length ? 'No badges match these filters.' : kind === 'member' ? 'No delegation has finished registering yet, so there are no badges.' : 'Nobody added yet.'}</Note> : (
          <TableWrap label="Badges">
            <thead><tr><th scope="col">Badge</th><th scope="col">{placeLabel}</th><th scope="col">Role</th><th scope="col">Print</th><th scope="col"><span className="reg-visually-hidden">Actions</span></th></tr></thead>
            <tbody>{rows.flatMap((b) => {
              const row = (
                <tr key={b.id}>
                  <th scope="row">{b.name}{b.fullName && <small>{b.fullName}</small>}
                    {b.unprintable && <small className="reg-attn-text">Can’t print “{b.unprintable}”; another name is used</small>}</th>
                  <td>{b.place ?? <span className="reg-muted">—</span>}</td>
                  <td>{b.role}{b.detail && <small>{b.detail}</small>}</td>
                  <td>{!b.canPrint ? <span className="reg-chip is-attention">Needs a new QR</span>
                    : b.printState === 'printed' ? <span className="reg-chip is-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Printed</span>
                    : <span className={`reg-chip ${b.printState === 'reprint' ? 'is-attention' : 'is-later'}`}>{stateLabel[b.printState]}</span>}
                    {b.printedAt && <small>{day(b.printedAt)}</small>}</td>
                  <td><div className="reg-row-actions">
                    {b.canPrint && <a className="reg-btn-link" href={`/api/admin/badges/print?id=${b.id}&layout=preview&inline=1`} target="_blank" rel="noreferrer"><Eye size={15} aria-hidden="true" />Preview<span className="reg-visually-hidden"> {b.name}’s badge</span></a>}
                    {confirming === `qr:${b.id}`
                      ? <span className="reg-confirm">The old QR will stop working. <button type="button" className="reg-btn-link" onClick={() => void newQr(b)}>Give a new QR</button> <button type="button" className="reg-btn-link" onClick={() => setConfirming('')}>Cancel</button></span>
                      : <button type="button" className="reg-btn-link" onClick={() => setConfirming(`qr:${b.id}`)}><QrCode size={15} aria-hidden="true" />New QR<span className="reg-visually-hidden"> for {b.name}</span></button>}
                    {b.kind === 'staff' && <>
                      <button type="button" className="reg-btn-link" onClick={() => setEditing(editing === b.id ? '' : b.id)}><Pencil size={15} aria-hidden="true" />Edit<span className="reg-visually-hidden"> {b.name}</span></button>
                      {confirming === `remove:${b.id}`
                        ? <span className="reg-confirm">Remove {b.name} and their badge? <button type="button" className="reg-btn-link" onClick={() => void remove(b)}>Remove</button> <button type="button" className="reg-btn-link" onClick={() => setConfirming('')}>Cancel</button></span>
                        : <button type="button" className="reg-btn-link" onClick={() => setConfirming(`remove:${b.id}`)}><Trash2 size={15} aria-hidden="true" />Remove<span className="reg-visually-hidden"> {b.name}</span></button>}
                    </>}
                  </div></td>
                </tr>
              )
              return editing === b.id
                ? [row, <tr key={`${b.id}-edit`} className="reg-badge-edit-row"><td colSpan={5}><EditStaff badge={b} categories={data.categories} onDone={finished} onCancel={() => setEditing('')} /></td></tr>]
                : [row]
            })}</tbody>
          </TableWrap>
        )}

        <PrintCutoff value={data.printCutoff} onSaved={finished} />
        <BadgeBack value={data.back} onSaved={finished} />
      </>}
    </Panel>
  )
}
