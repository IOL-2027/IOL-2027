// Two forms of the portal whose fields depend on each other as they are filled in: Team and observers (who registers
// and leads each team, the teams, the observer each team may bring, and who needs a single room, which set the fees)
// and the invoice details
// on Payment (one invoice, or several with a payer and an amount each that must add up to the total).
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CircleAlert, Info, Lock, Plus } from 'lucide-react'
import type { DelegationData, Payment } from './api'
import { selectOptions } from './portalData'
import { Alert, Card, Chip, Facts, longDate } from './ui'

export const MAX_INVOICES = 5
const singleAnswers = selectOptions['Single room']
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
export const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const cents = (n: number) => Math.round(n * 100)

/** Moves the focus to an element by id once React has drawn it: after adding or removing an observer or an invoice. */
function useFocusAfter() {
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    if (!target) return
    document.getElementById(target)?.focus()
    setTarget(null)
  }, [target])
  return setTarget
}

/** A select whose value the form reacts to (FieldControl's are read only when the form is sent). */
function LiveSelect({ id, label, value, options, help, error, onChange, disabled, placeholder }: {
  id: string; label: string; value: string; options: string[]; help?: string; error?: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string
}) {
  return (
    <div className={`reg-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {help && <p className="reg-hint" id={`${id}-hint`}>{help}</p>}
      {error && <p className="reg-error" id={`${id}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      <select id={id} name={label} className="reg-control" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        aria-describedby={[help && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : undefined}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}

export type FeeLine = { key: string; label: string; detail: string; amount: number | null }

/** Fee lines and their total, on Team and observers (as they are chosen) and on Payment (as invoiced). */
export function FeeTable({ lines, total, pending }: { lines: FeeLine[]; total: number; pending?: boolean }) {
  return (
    <table className="reg-fee-table">
      <tbody>
        {lines.map((line) => (
          <tr key={line.key}><th scope="row">{line.label}<small>{line.detail}</small></th><td>{line.amount === null ? 'Rate to be confirmed' : usd(line.amount)}</td></tr>
        ))}
      </tbody>
      <tfoot><tr><th scope="row">Total</th><td>{usd(total)}{pending ? ' + observer fees' : ''}</td></tr></tfoot>
    </table>
  )
}

/** Shown beside a Save button while its form has changes that are not saved yet. */
export function UnsavedNote({ show }: { show: boolean }) {
  return show ? <span className="reg-unsaved"><span aria-hidden="true" />Unsaved changes</span> : null
}

/** Team names as Teams shows them: the country for one team, its A and B teams for two, or a name given in Teams. */
export function teamNames(data: DelegationData, count: number) {
  const country = data.delegation.countryTerritory.replace(/\s*\(TEST\)\s*/i, '').trim()
  const defaults = [country, `${country} A`, `${country} B`]
  return range(count).map((i) => {
    const saved = data.teams[i]?.name
    return saved && !defaults.includes(saved) ? saved : count === 1 ? country : `${country} ${'AB'[i]}`
  })
}

// numberOfObservers is sent too, for an API from before observers were added team by team.
export type NamesBody = { nationalRepresentativeName: string; representativeTeam?: number | null; teamLeaderNames?: string[] }
export type SetupBody = NamesBody & Partial<{ numberOfTeams: number; numberOfObservers: number; observerTeams: number[]; singleRooms: { teamLeaders: boolean[]; observers: boolean[] }; needsAccommodation: boolean }>
type Observer = { key: number; team: number; room: string }

/** A text field for a name, with its hint and error, used by the first step's forms. */
function NameField({ id, label, value, onChange, help, error, disabled }: {
  id: string; label: string; value: string; onChange: (value: string) => void; help?: string; error?: string; disabled?: boolean
}) {
  return (
    <div className={`reg-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {help && <p className="reg-hint" id={`${id}-hint`}>{help}</p>}
      {error && <p className="reg-error" id={`${id}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
      <input id={id} className="reg-control" value={value} autoComplete="off" maxLength={200} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        aria-describedby={[help && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : undefined} />
    </div>
  )
}

/**
 * Team and observers (IOL Board, 16 Nov 2026): how many teams first, then each team with its Team Leader and the
 * observer it may bring, then the national representative, who is the country's one main contact even with two teams
 * and may lead either team or neither. Then who wants a single room, and what it all costs. Once the proof of payment
 * is uploaded everything but the names is locked (shown, not changed), because it sets the amount paid.
 */
export function TeamSetup({ data, locked, busy, error, dirty, onTouched, onSave, onContinue }: {
  data: DelegationData; locked: boolean; busy: boolean; error: ReactNode; dirty: boolean; onTouched: () => void; onSave: (body: SetupBody) => void; onContinue: () => void
}) {
  const d = data.delegation
  const rules = data.feeRules
  const oneTeamOnly = d.feeCategory === 'non_accredited'
  const maxTeams = oneTeamOnly ? 1 : 2
  const perTeam = rules.maxObserversPerTeam
  const [teams, setTeamCount] = useState(oneTeamOnly ? 1 : d.numberOfTeams)
  const answer = (yes: boolean | undefined) => (yes === undefined ? '' : yes ? singleAnswers[1] : singleAnswers[0])
  const [leaderRooms, setLeaderRooms] = useState(() => range(2).map((i) => answer(d.singleRooms.teamLeaders[i])))
  // Each observer as added, with the team they come with and their room. Those of a team taken away come back with it.
  const [observers, setObservers] = useState<Observer[]>(() => range(d.numberOfObservers).map((i) => ({
    key: i, team: d.singleRooms.observerTeams?.[i] ?? Math.min(Math.floor(i / Math.max(perTeam, 1)), 1), room: answer(d.singleRooms.observers[i]),
  })))
  const nextKey = useRef(d.numberOfObservers)
  const [announce, setAnnounce] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const focusAfter = useFocusAfter()
  const names = teamNames(data, maxTeams === 2 ? Math.max(teams, 2) : 1).slice(0, maxTeams)
  const shownNames = teamNames(data, teams)
  // Each team's Team Leader, as named before: the record assigned to that team.
  const savedLeaders = range(2).map((i) => data.members.find((m) => m.role === 'team_leader' && data.teams[i] && m.teamId === data.teams[i].id)?.displayName ?? '')
  const [repName, setRepName] = useState(d.nationalRepresentativeName ?? '')
  // Which team the national representative leads: 0, 1, null for neither, undefined while not answered yet.
  const savedRepTeam = d.representativeTeam !== undefined && d.representativeTeam !== null ? d.representativeTeam
    : d.representativeIsTeamLeader === true ? 0 : d.representativeIsTeamLeader === false ? null : undefined
  const [repTeam, setRepTeam] = useState<number | null | undefined>(savedRepTeam !== undefined && savedRepTeam !== null && savedRepTeam >= teams ? undefined : savedRepTeam)
  const [leaderNames, setLeaderNames] = useState(() => range(2).map((i) => (i === savedRepTeam ? '' : savedLeaders[i])))
  const leaderName = (i: number) => (i === repTeam ? repName.trim() : leaderNames[i].trim())
  const shown = observers.filter((o) => o.team < teams).sort((a, b) => a.team - b.team || a.key - b.key)
  const observerFee = rules.observerFee === null ? 'Rate to be confirmed' : usd(rules.observerFee)
  const clearError = (id: string) => { if (errors[id]) setErrors(({ [id]: _fixed, ...rest }) => rest) }
  /** "Observer", numbered when a team may bring more than one, and with the team's name when there are two. */
  const observerName = (o: Observer, withTeam = teams > 1) => {
    const mates = shown.filter((x) => x.team === o.team)
    return `Observer${mates.length > 1 ? ` ${mates.indexOf(o) + 1}` : ''}${withTeam ? `, ${shownNames[o.team]}` : ''}`
  }
  const leaderLabel = (i: number) => {
    const who = leaderName(i)
    const role = `Team Leader${teams > 1 ? `, ${shownNames[i]}` : ''}`
    return who ? `${who} (${role})` : role
  }
  const rooms = [
    ...range(teams).map((i) => ({ id: `setup-room-leader-${i + 1}`, label: leaderLabel(i), value: leaderRooms[i], set: (v: string) => setLeaderRooms((l) => l.map((a, j) => (j === i ? v : a))) })),
    ...shown.map((o) => ({ id: `setup-room-observer-${o.key}`, label: observerName(o), value: o.room, set: (v: string) => setObservers((l) => l.map((x) => (x.key === o.key ? { ...x, room: v } : x))) })),
  ]
  // Down to one team: a representative who led the second team has to say again which team, if any, they lead.
  const setTeams = (n: number) => {
    setTeamCount(n)
    if (repTeam !== undefined && repTeam !== null && repTeam >= n) setRepTeam(undefined)
    setAnnounce(n === 2 ? `${names[1]} added. Name its Team Leader.` : `${names[1] ?? 'The second team'} removed.`)
    onTouched()
  }

  const addObserver = (team: number) => {
    const key = nextKey.current++
    setObservers((list) => [...list, { key, team, room: '' }])
    setAnnounce(`Observer added to ${shownNames[team]}. Choose their room under Single rooms.`)
    onTouched()
    focusAfter(`setup-observer-${key}-remove`)
  }
  const removeObserver = (o: Observer) => {
    setObservers((list) => list.filter((x) => x.key !== o.key))
    setErrors(({ [`setup-room-observer-${o.key}`]: _gone, ...rest }) => rest)
    setAnnounce(`Observer removed from ${shownNames[o.team]}.`)
    onTouched()
    focusAfter(`setup-add-observer-${o.team}`)
  }

  // The fees for what is chosen right now, worked out as the server will once this is saved.
  const singles = rooms.filter((r) => r.value === singleAnswers[1]).length
  const rate = `${data.fees.tierLabel} rate, ${data.fees.categoryLabel.toLowerCase()}`
  const lines: FeeLine[] = [
    ...rules.teamFees.slice(0, teams).map((amount, i) => ({ key: `team${i}`, label: oneTeamOnly ? 'Team' : i === 0 ? 'First team' : 'Second team', detail: `${shownNames[i]}. ${rate}. Four contestants and their Team Leader.`, amount })),
    { key: 'observers', label: 'Observers', detail: shown.length ? `${shown.length} × ${rules.observerFee === null ? 'rate to be confirmed' : usd(rules.observerFee)}` : 'None', amount: !shown.length ? 0 : rules.observerFee === null ? null : shown.length * rules.observerFee },
    { key: 'singles', label: 'Single rooms', detail: singles ? `${singles} × ${usd(rules.singleRoomFee)}` : 'None: everyone shares a twin room', amount: singles * rules.singleRoomFee },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  // An unpaid invoice follows this step when it is saved: say so before its amount changes under whoever pays it.
  const invoice = data.payments[0]
  const invoiceChanges = Boolean(invoice && !locked && cents(total) !== cents(Number(invoice.amountDue)))
  // Observers already named in People must still be covered by the fees.
  const named = data.members.filter((m) => m.role === 'observer').length

  const namesBody: NamesBody = { nationalRepresentativeName: repName.trim(), representativeTeam: repTeam ?? null, teamLeaderNames: range(teams).map(leaderName) }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const missing: Record<string, string> = {}
    for (const i of range(teams)) {
      if (i !== repTeam && !leaderNames[i].trim()) missing[`setup-leader-${i}`] = teams > 1 ? `Enter the Team Leader of ${shownNames[i]}. Each team has its own Team Leader.` : 'Enter the Team Leader’s full name.'
    }
    if (!repName.trim()) missing['setup-rep-name'] = 'Enter the national representative’s full name.'
    if (repTeam === undefined) missing['setup-rep-team'] = 'Say whether the national representative is also a Team Leader.'
    if (!locked) for (const r of rooms) if (!r.value) missing[r.id] = 'Choose yes or no.'
    setErrors(missing)
    if (Object.keys(missing).length) {
      const first = Object.keys(missing)[0]
      document.getElementById(first === 'setup-rep-team' ? 'setup-rep-team-0' : first)?.focus()
      return
    }
    // Once locked only the names can change: save them if they did, then move on.
    if (locked) {
      const same = namesBody.nationalRepresentativeName === (d.nationalRepresentativeName ?? '') && (repTeam ?? null) === (savedRepTeam ?? null)
        && namesBody.teamLeaderNames!.every((n, i) => n === (i === savedRepTeam ? d.nationalRepresentativeName : savedLeaders[i]))
      if (same) onContinue(); else onSave(namesBody)
      return
    }
    onSave({
      ...namesBody,
      numberOfTeams: teams, numberOfObservers: shown.length, observerTeams: shown.map((o) => o.team),
      singleRooms: { teamLeaders: range(teams).map((i) => leaderRooms[i] === singleAnswers[1]), observers: shown.map((o) => o.room === singleAnswers[1]) },
    })
  }
  const repChoices: { value: number | null; label: string }[] = [
    ...range(teams).map((i) => ({ value: i, label: teams > 1 ? `Yes, the Team Leader of ${shownNames[i]}` : 'Yes, they are the Team Leader' })),
    { value: null, label: 'No, they are the main contact only' },
  ]

  return (
    <form onSubmit={submit} noValidate data-dirty-key="setup">
      <div className="reg-cards">
        {locked && (
          <p className="reg-aside reg-aside-lock"><Lock size={18} aria-hidden="true" />
            <span>Teams, observers and single rooms are locked, because your proof of payment is uploaded and they set the amount you paid. To change them, email the organisers at <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a>. The names can still change.</span>
          </p>
        )}
        <Card id="setup-numbers" title="Teams"
          intro={`Each team is four contestants and a Team Leader, whose place is in the team fee.${perTeam ? ` A team may also bring ${perTeam === 1 ? 'an observer' : `up to ${perTeam} observers`}, for example a parent or someone from your national olympiad.` : ''} You name the contestants and observers later, in People.`}>
          <div className="reg-grid">
            <LiveSelect id="setup-number-of-teams" label="Number of teams" value={String(teams)} options={oneTeamOnly ? ['1'] : ['1', '2']} onChange={(v) => setTeams(Number(v))} disabled={locked}
              help={oneTeamOnly ? 'A country or territory that is not accredited registers one team.' : 'One or two. Only accredited countries and territories may bring a second team, which costs more than the first.'} />
          </div>
          <ul className="reg-team-boxes" aria-label="Your teams">
            {range(maxTeams).map((t) => {
              const off = t >= teams
              const mine = shown.filter((o) => o.team === t)
              return (
                <li key={t} className={`reg-team-box${off ? ' is-off' : ''}`} aria-disabled={off || undefined}>
                  <div className="reg-team-box-head">
                    <h4>{names[t]}</h4>
                    <span>{usd(rules.teamFees[t] ?? 0)}</span>
                  </div>
                  <p className="reg-team-box-who">{off ? 'Choose 2 teams above to register a second team.' : 'Four contestants and their Team Leader'}</p>
                  {t === repTeam && !off
                    ? <p className="reg-team-box-leader"><span>Team Leader</span><strong>{repName.trim() || 'The national representative'}</strong><small>The national representative, as chosen under Main contact.</small></p>
                    : <NameField id={`setup-leader-${t}`} label="Team Leader" value={off ? '' : leaderNames[t]} disabled={off}
                      help={off ? undefined : 'Full name. Each team has its own Team Leader, who travels with the team.'} error={off ? undefined : errors[`setup-leader-${t}`]}
                      onChange={(v) => { setLeaderNames((l) => l.map((n, j) => (j === t ? v : n))); onTouched(); clearError(`setup-leader-${t}`) }} />}
                  {!off && mine.length > 0 && (
                    <ul className="reg-team-box-observers">
                      {mine.map((o) => (
                        <li key={o.key}>
                          <span><strong>{observerName(o, false)}</strong><small>{observerFee} · named later, in People</small></span>
                          {!locked && (
                            <button type="button" id={`setup-observer-${o.key}-remove`} className="reg-btn-link reg-btn-remove" onClick={() => removeObserver(o)}>
                              Remove<span className="reg-visually-hidden"> the {observerName(o, false).toLowerCase()} of {names[t]}</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!off && mine.length < perTeam && !locked && (
                    <button type="button" id={`setup-add-observer-${t}`} className="reg-btn-link reg-add-link" onClick={() => addObserver(t)}>
                      <Plus size={16} aria-hidden="true" />Add observer<span className="reg-visually-hidden"> to {names[t]}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {named > shown.length && (
            <p className="reg-aside reg-aside-warn reg-card-foot"><Info size={18} aria-hidden="true" />
              <span>{locked
                ? <>People names {named} {named === 1 ? 'observer' : 'observers'}, more than you paid for. Remove the extra {named - shown.length === 1 ? 'one' : 'ones'} in People, or email the organisers to add an observer.</>
                : <>People already names {named} {named === 1 ? 'observer' : 'observers'}, more than you have here. Add an observer back, or remove the extra {named - shown.length === 1 ? 'one' : 'ones'} in People, so your fees cover everyone who comes.</>}</span>
            </p>
          )}
          <span className="reg-visually-hidden" role="status">{announce}</span>
        </Card>

        <Card id="setup-delegation" title="Main contact"
          intro={`Your country has one main contact for the organisers${teams > 1 ? ', even with two teams' : ''}: the national representative, who uses this account. The country and fee rate come from your invitation code; if they look wrong, email the organisers.`}>
          <Facts items={[
            { label: 'Country or territory', value: d.countryTerritory },
            { label: 'Fee rate', value: data.fees.categoryLabel, help: d.feeCategory === 'previous_host' ? 'Countries that have hosted the IOL pay a lower team fee.' : d.feeCategory === 'non_accredited' ? 'Not yet accredited: one team.' : undefined },
            { label: 'Account email', value: d.teamLeaderEmail },
          ]} />
          <div className="reg-grid reg-names">
            <NameField id="setup-rep-name" label="National representative" value={repName} error={errors['setup-rep-name']}
              help="Full name of the person registering your country, who uses this account."
              onChange={(v) => { setRepName(v); onTouched(); clearError('setup-rep-name') }} />
            <fieldset className={`reg-field reg-field-wide${errors['setup-rep-team'] ? ' has-error' : ''}`} aria-describedby={errors['setup-rep-team'] ? 'setup-rep-team-error' : undefined}>
              <legend>Is the national representative also a Team Leader?</legend>
              {errors['setup-rep-team'] && <p className="reg-error" id="setup-rep-team-error"><CircleAlert size={16} aria-hidden="true" />{errors['setup-rep-team']}</p>}
              <div className="reg-radios">
                {repChoices.map((c, i) => (
                  <label key={String(c.value)} className="reg-check">
                    <input type="radio" id={`setup-rep-team-${i}`} name="setup-rep-team" checked={repTeam === c.value}
                      onChange={() => { setRepTeam(c.value); onTouched(); clearError('setup-rep-team'); if (c.value !== null) clearError(`setup-leader-${c.value}`) }} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        <Card id="setup-rooms" title="Single rooms" intro={`Team Leaders and observers share twin rooms. Anyone who would rather have a room to themselves can ask for a single room, at ${usd(rules.singleRoomFee)} more. Contestants share with a teammate of the same gender.`}>
          <div className="reg-grid">
            {rooms.map((r) => <LiveSelect key={r.id} id={r.id} label={r.label} value={r.value} options={singleAnswers} placeholder="Choose…" error={errors[r.id]} onChange={(v) => { r.set(v); onTouched(); clearError(r.id) }} disabled={locked} />)}
          </div>
        </Card>

        <Card id="setup-fees" title="Your fees" intro={locked ? 'The amount on your invoice, for what you chose above.' : 'Updates as you choose. Saving this step sets the amount on your invoice.'} status={<Chip tone="later">{data.fees.tierLabel} rate</Chip>}>
          <FeeTable lines={lines} total={total} pending={shown.length > 0 && rules.observerFee === null} />
          {invoiceChanges && invoice && (
            <p className="reg-aside reg-aside-warn"><Info size={18} aria-hidden="true" />
              <span>Your invoice {invoice.invoiceNumber} is for {usd(Number(invoice.amountDue))}. Saving changes it to {usd(total)}{invoice.invoiceSplits?.length ? ', and you will need to share the new total between your payers again in Payment' : ''}. Then download the new PDF in Payment for whoever pays.</span>
            </p>
          )}
        </Card>
      </div>
      <div className="reg-panel-actions">
        <Alert>{error}</Alert>
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : locked && !dirty ? 'Continue' : 'Save and continue'} <ArrowRight size={18} aria-hidden="true" /></button>
        <UnsavedNote show={dirty} />
      </div>
    </form>
  )
}

/**
 * About you, the first step for a jury member or a volunteer, who register only themselves (IOL Board, 16 Nov 2026):
 * their name, whether they need a hotel room and a single one, and for a jury member one observer they may bring, at
 * the observer fee. Nothing to pay unless they bring an observer or ask for a single room. Locked once a proof of
 * payment is uploaded, as Team and observers is, apart from the name.
 */
export function SelfSetup({ data, locked, busy, error, dirty, onTouched, onSave, onContinue }: {
  data: DelegationData; locked: boolean; busy: boolean; error: ReactNode; dirty: boolean; onTouched: () => void; onSave: (body: SetupBody) => void; onContinue: () => void
}) {
  const d = data.delegation
  const rules = data.feeRules
  const jury = d.kind === 'jury'
  const self = data.members.find((m) => m.role === d.kind)
  const answer = (yes: boolean | undefined) => (yes === undefined ? '' : yes ? singleAnswers[1] : singleAnswers[0])
  const [name, setName] = useState(self?.displayName ?? d.nationalRepresentativeName ?? '')
  const [room, setRoom] = useState(d.needsAccommodation === false ? 'no' : d.needsAccommodation === true ? 'yes' : '')
  const [single, setSingle] = useState(answer(d.singleRooms.teamLeaders[0]))
  const [observer, setObserver] = useState(d.numberOfObservers > 0)
  const [observerRoom, setObserverRoom] = useState(answer(d.singleRooms.observers[0]))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const clearError = (id: string) => { if (errors[id]) setErrors(({ [id]: _fixed, ...rest }) => rest) }
  const touch = (id: string) => { onTouched(); clearError(id) }

  const needsRoom = room === 'yes'
  const singles = (needsRoom && single === singleAnswers[1] ? 1 : 0) + (observer && observerRoom === singleAnswers[1] ? 1 : 0)
  const observerAmount = observer ? rules.observerFee : 0
  const lines: FeeLine[] = [
    ...(jury ? [{ key: 'observers', label: 'Observer', detail: observer ? `1 × ${rules.observerFee === null ? 'rate to be confirmed' : usd(rules.observerFee)}` : 'None', amount: observerAmount }] : []),
    { key: 'singles', label: 'Single rooms', detail: singles ? `${singles} × ${usd(rules.singleRoomFee)}` : jury ? 'None: you share a twin room' : 'None: you share a room with another volunteer', amount: singles * rules.singleRoomFee },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const missing: Record<string, string> = {}
    if (!name.trim()) missing['self-name'] = 'Enter your full name.'
    if (!locked) {
      if (!room) missing['self-room-0'] = 'Say whether you need a hotel room.'
      if (needsRoom && !single) missing['self-single'] = 'Choose yes or no.'
      if (observer && !observerRoom) missing['self-observer-room'] = 'Choose yes or no.'
    }
    setErrors(missing)
    if (Object.keys(missing).length) { document.getElementById(Object.keys(missing)[0])?.focus(); return }
    if (locked) {
      if (name.trim() === (self?.displayName ?? d.nationalRepresentativeName)) onContinue(); else onSave({ nationalRepresentativeName: name.trim() })
      return
    }
    onSave({
      nationalRepresentativeName: name.trim(), needsAccommodation: needsRoom,
      numberOfObservers: observer ? 1 : 0, observerTeams: observer ? [0] : [],
      singleRooms: { teamLeaders: [needsRoom && single === singleAnswers[1]], observers: observer ? [observerRoom === singleAnswers[1]] : [] },
    })
  }

  return (
    <form onSubmit={submit} noValidate data-dirty-key="setup">
      <div className="reg-cards">
        {locked && (
          <p className="reg-aside reg-aside-lock"><Lock size={18} aria-hidden="true" />
            <span>Your room and observer choices are locked, because your proof of payment is uploaded. To change them, email the organisers at <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a>. Your name can still change.</span>
          </p>
        )}
        <Card id="self-about" title="About you" intro={jury ? 'You are registering as a member of the IOL 2027 jury.' : 'You are registering as an IOL 2027 volunteer.'}>
          <Facts items={[{ label: 'Registering as', value: jury ? 'Jury member' : 'Volunteer' }, { label: 'Account email', value: d.teamLeaderEmail }]} />
          <div className="reg-grid">
            <NameField id="self-name" label="Your full name" value={name} error={errors['self-name']} help="As you would like it on programme lists. Your other details come in the next steps."
              onChange={(v) => { setName(v); touch('self-name') }} />
          </div>
        </Card>

        <Card id="self-room" title="Hotel room"
          intro={`The organisers provide a room from the night of ${longDate(data.event.hotelFirstNight)} to the night of ${longDate(data.event.hotelLastNight)}.${jury ? '' : ' If you live in Bangkok, you may not need one.'}`}>
          <fieldset className={`reg-field reg-field-wide${errors['self-room-0'] ? ' has-error' : ''}`} disabled={locked}>
            <legend>Do you need a hotel room?</legend>
            {errors['self-room-0'] && <p className="reg-error"><CircleAlert size={16} aria-hidden="true" />{errors['self-room-0']}</p>}
            <div className="reg-radios">
              {[['yes', 'Yes, I need a room'], ['no', 'No, I will stay elsewhere']].map(([value, label], i) => (
                <label key={value} className="reg-check">
                  <input type="radio" id={`self-room-${i}`} name="self-room" checked={room === value} onChange={() => { setRoom(value); touch('self-room-0') }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {needsRoom && (
            <div className="reg-grid">
              <LiveSelect id="self-single" label="Single room" value={single} options={singleAnswers} placeholder="Choose…" error={errors['self-single']} disabled={locked}
                help={`${jury ? 'Jury members share twin rooms' : 'Volunteers share twin rooms with another volunteer'}. A room to yourself costs ${usd(rules.singleRoomFee)}.`}
                onChange={(v) => { setSingle(v); touch('self-single') }} />
            </div>
          )}
        </Card>

        {jury && (
          <Card id="self-observer" title="Observer"
            intro={`You may bring one observer, for example a family member, at ${rules.observerFee === null ? 'the observer fee (to be confirmed)' : usd(rules.observerFee)}. You name them later, in Your details.`}>
            <label className="reg-check">
              <input type="checkbox" checked={observer} disabled={locked} onChange={(e) => { setObserver(e.target.checked); touch('self-observer-room') }} />
              <span>I am bringing an observer</span>
            </label>
            {observer && (
              <div className="reg-grid">
                <LiveSelect id="self-observer-room" label="Observer’s single room" value={observerRoom} options={singleAnswers} placeholder="Choose…" error={errors['self-observer-room']} disabled={locked}
                  help={`Observers share twin rooms unless they ask for a single room, at ${usd(rules.singleRoomFee)}.`} onChange={(v) => { setObserverRoom(v); touch('self-observer-room') }} />
              </div>
            )}
          </Card>
        )}

        <Card id="self-fees" title="Your fees" intro={total ? 'Saving this step sets the amount on your invoice, in Payment.' : 'Nothing to pay: there is no payment step unless you bring an observer or ask for a single room.'}>
          <FeeTable lines={lines} total={total} />
        </Card>
      </div>
      <div className="reg-panel-actions">
        <Alert>{error}</Alert>
        <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : locked && !dirty ? 'Continue' : 'Save and continue'} <ArrowRight size={18} aria-hidden="true" /></button>
        <UnsavedNote show={dirty} />
      </div>
    </form>
  )
}

export type InvoiceBody = { recipientName: string; recipientAddress: string; recipientTin: string; invoices?: { recipientName: string; recipientAddress: string; recipientTin: string; amount: number }[] }

/** Reads the invoice details back from the Payment form: one invoice, or several with their amounts. */
export function readInvoices(form: FormData): InvoiceBody {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const count = Number(form.get('Number of invoices') || 1)
  const invoices = range(count).map((i) => ({
    recipientName: text(`invoice-${i}-name`), recipientAddress: text(`invoice-${i}-address`), recipientTin: text(`invoice-${i}-tin`), amount: Number(text(`invoice-${i}-amount`) || 0),
  }))
  const { amount: _amount, ...first } = invoices[0]
  return count <= 1 ? first : { ...first, invoices }
}

/** What is wrong with the invoice details before they are sent, keyed like the fields; empty when they can be saved. */
export function invoiceProblems(body: InvoiceBody, total: number): Record<string, string> {
  if (!body.invoices) return body.recipientName ? {} : { 'invoice-0-name': 'Enter the organisation named on the invoice.' }
  const problems: Record<string, string> = {}
  body.invoices.forEach((invoice, i) => {
    if (!invoice.recipientName) problems[`invoice-${i}-name`] = 'Enter who this invoice is for.'
    if (!(invoice.amount > 0) || Math.abs(invoice.amount * 100 - cents(invoice.amount)) > 1e-6) problems[`invoice-${i}-amount`] = 'Enter an amount in US dollars, such as 1200 or 1200.50.'
  })
  const sum = body.invoices.reduce((s, invoice) => s + cents(invoice.amount || 0), 0)
  if (!Object.keys(problems).length && sum !== cents(total)) problems['invoice-split'] = `The amounts add up to ${usd(sum / 100)}, not ${usd(total)}.`
  return problems
}

/** Splits the total into equal parts in whole dollars, the remainder on the first invoice. */
const evenSplit = (total: number, count: number) => {
  const each = Math.floor(total / count)
  return range(count).map((i) => String(i === 0 ? Math.round((total - each * (count - 1)) * 100) / 100 : each))
}

type InvoiceDraft = { key: number; name: string; tin: string; address: string; amount: string }
type InvoicePart = Exclude<keyof InvoiceDraft, 'key'>

/**
 * The invoice details on Payment: one invoice, and "Add another invoice" when several organisations each pay a part.
 * Each invoice then sits in a box of its own with a payer and an amount, and a running total says what is left.
 */
export function InvoiceDetails({ data, payment, disabled, errors, onTouched }: { data: DelegationData; payment: Payment | undefined; disabled: boolean; errors: Record<string, string>; onTouched: () => void }) {
  const total = data.fees.total
  const saved = payment?.invoiceCount && payment.invoiceCount > 1 && payment.invoiceSplits?.length ? payment.invoiceSplits : null
  const [invoices, setInvoices] = useState<InvoiceDraft[]>(() => saved
    ? saved.map((s, i) => ({ key: i, name: s.recipientName ?? '', tin: s.recipientTin ?? '', address: s.recipientAddress ?? '', amount: String(s.amount) }))
    : [{ key: 0, name: payment?.invoiceRecipientName ?? data.delegation.accreditedOrganisation ?? '', tin: payment?.invoiceRecipientTin ?? '', address: payment?.invoiceRecipientAddress ?? '', amount: '' }])
  const nextKey = useRef(invoices.length)
  const focusAfter = useFocusAfter()
  const count = invoices.length
  const split = count > 1
  const assigned = invoices.reduce((s, inv) => s + cents(Number(inv.amount) || 0), 0) / 100
  const left = Math.round((total - assigned) * 100) / 100
  const edit = (key: number, part: InvoicePart, value: string) => setInvoices((list) => list.map((inv) => (inv.key === key ? { ...inv, [part]: value } : inv)))
  // Amounts still at an even share (or a first split) are shared evenly again when an invoice is added or removed;
  // amounts someone has typed are kept, and a new invoice then takes what is left.
  const reshare = (next: InvoiceDraft[], before: InvoiceDraft[]) => {
    if (next.length === 1) return next.map((inv) => ({ ...inv, amount: '' }))
    const even = before.length === 1 || evenSplit(total, before.length).every((share, i) => before[i].amount === share)
    if (!even) return next
    const shares = evenSplit(total, next.length)
    return next.map((inv, i) => ({ ...inv, amount: shares[i] }))
  }
  const add = () => {
    const key = nextKey.current++
    setInvoices((list) => {
      const next = reshare([...list, { key, name: '', tin: '', address: '', amount: '' }], list)
      return next.map((inv) => (inv.key === key && !inv.amount && left > 0 ? { ...inv, amount: String(left) } : inv))
    })
    onTouched()
    focusAfter(`invoice-${count}-name`)
  }
  const remove = (key: number) => {
    setInvoices((list) => reshare(list.filter((inv) => inv.key !== key), list))
    onTouched()
    focusAfter('invoice-add')
  }

  const field = (i: number, inv: InvoiceDraft, part: InvoicePart, label: string, extra: { optional?: boolean; help?: string; wide?: boolean } = {}) => {
    const name = `invoice-${i}-${part}`
    const error = errors[name]
    const common = {
      id: name, name, className: 'reg-control', disabled, value: inv[part],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => edit(inv.key, part, e.target.value),
      'aria-describedby': [extra.help && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined,
    }
    return (
      <div key={part} className={`reg-field${extra.wide ? ' reg-field-wide' : ''}${error ? ' has-error' : ''}`}>
        <label htmlFor={name}>{label}{extra.optional && <span className="reg-optional"> (optional)</span>}</label>
        {extra.help && <p className="reg-hint" id={`${name}-hint`}>{extra.help}</p>}
        {error && <p className="reg-error" id={`${name}-error`}><CircleAlert size={16} aria-hidden="true" />{error}</p>}
        {part === 'amount' ? <input {...common} type="number" min="0" step="0.01" inputMode="decimal" />
          : part === 'address' ? <textarea {...common} rows={2} /> : <input {...common} />}
      </div>
    )
  }

  return <>
    <input type="hidden" name="Number of invoices" value={count} />
    <ol className={`reg-invoices${split ? ' is-split' : ''}`}>
      {invoices.map((inv, i) => (
        <li key={inv.key} className="reg-invoice-part" aria-labelledby={split ? `invoice-${inv.key}-title` : undefined}>
          {split && (
            <div className="reg-invoice-head">
              <span className="reg-invoice-number" aria-hidden="true">{i + 1}</span>
              <h4 id={`invoice-${inv.key}-title`}>Invoice {i + 1}<span className="reg-visually-hidden"> of {count}</span></h4>
              <span className="reg-invoice-amount">{Number(inv.amount) > 0 ? usd(Number(inv.amount)) : 'No amount yet'}</span>
              {!disabled && (
                <button type="button" className="reg-btn-link reg-btn-remove" onClick={() => remove(inv.key)}>Remove<span className="reg-visually-hidden"> invoice {i + 1}</span></button>
              )}
            </div>
          )}
          <div className="reg-grid">
            {split ? [
              field(i, inv, 'name', 'Invoice recipient name', { help: 'The organisation that pays this part.' }),
              field(i, inv, 'amount', 'Amount (USD)', { help: 'Whole dollars, or dollars and cents.' }),
              field(i, inv, 'tin', 'Tax identification number (TIN)', { optional: true }),
              field(i, inv, 'address', 'Invoice recipient address', { optional: true }),
            ] : [
              field(i, inv, 'name', 'Invoice recipient name', { help: 'The organisation named on the invoice.' }),
              field(i, inv, 'tin', 'Tax identification number (TIN)', { optional: true, help: 'Only if your institution needs it on the invoice.' }),
              field(i, inv, 'address', 'Invoice recipient address', { optional: true, wide: true, help: 'Only if your institution needs a postal address on the invoice.' }),
            ]}
          </div>
        </li>
      ))}
    </ol>
    {split && (
      <p className={`reg-invoice-sum${left === 0 ? ' is-even' : ''}${errors['invoice-split'] ? ' has-error' : ''}`} role="status" id="invoice-split">
        {left === 0 ? <>The {count} invoices add up to the total, {usd(total)}.</>
          : left > 0 ? <>{usd(assigned)} of {usd(total)} assigned. <strong>{usd(left)} still to assign.</strong></>
          : <>{usd(assigned)} assigned. <strong>That is {usd(-left)} more than the total of {usd(total)}.</strong></>}
      </p>
    )}
    {!disabled && (
      <div className="reg-invoice-add">
        {count < MAX_INVOICES
          ? <button type="button" id="invoice-add" className="reg-btn-link reg-add-link" onClick={add}><Plus size={16} aria-hidden="true" />Add another invoice</button>
          : <p className="reg-hint">That is the most: up to {MAX_INVOICES} invoices.</p>}
        {!split && <p className="reg-hint">Only if several organisations each pay part of the fees. Each invoice then gets its own payer and amount.</p>}
      </div>
    )}
  </>
}
