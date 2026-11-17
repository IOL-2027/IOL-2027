// The national representative's registration workspace: a step rail on the left and one step at a time on the right. The last
// step, Submit, shows where every step stands and is where the registration is submitted.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock, Copy, Download, FileText, Info, Lock, Plus, Send, Upload, UserPlus } from 'lucide-react'
import { api, ApiError, type DelegationData, type DelegationKind, type Member, type TravelRecord } from './api'
import { personFieldGroups, sections, type Field, type PortalRecord, type Section, type SectionId } from './portalData'
import { consentFor, personFields, personPayload, personRecord, photoFor, teamRecord, transportChoices, transportLabel, tripComplete, tripPayload, tripRecord, welfareFacts } from './live'
import { FeeTable, InvoiceDetails, SelfSetup, TeamSetup, UnsavedNote, invoiceProblems, readInvoices, usd, type SetupBody } from './SetupForms'
import { openReceipt } from './invoice'
import { PhotoField } from './PhotoField'
import { Alert, Card, Chip, Facts, FieldControl, PageHead, focusFirstError, longDate, messageOf, unsavedWork } from './ui'

// "attention": saved, but something in it is missing since (a person's details, the stay dates), or a proof of payment
// Finance returned.
type StepStatus = 'done' | 'attention' | 'todo' | 'locked' | 'info' | 'waiting' | 'after'
const statusLabel: Record<StepStatus, string> = {
  done: 'Done', attention: 'Something to finish', todo: 'To do', locked: 'Opens after payment', info: 'Read first', waiting: 'After the steps above', after: 'After you submit',
}
const paymentLabel: Record<string, string> = {
  none: 'Payment: invoice details not saved yet', awaiting_proof: 'Payment: waiting for proof', awaiting_review: 'Payment: waiting for Finance',
  approved: 'Payment approved', rejected: 'Payment: proof returned', refunded: 'Payment refunded',
}

// The payment after the proof is in: uploaded, Finance's check, confirmed. Said in words for screen readers.
const progressWords = { done: 'done', current: 'in progress', problem: 'needs your attention', later: 'not yet' } as const
type PayStage = { key: string; state: keyof typeof progressWords; title: string; detail: ReactNode; action?: ReactNode }

function StatusMark({ status, number }: { status: StepStatus; number: number }) {
  if (status === 'done') return <span className="reg-mark is-done" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></span>
  if (status === 'locked') return <span className="reg-mark is-locked" aria-hidden="true"><Lock size={13} strokeWidth={2.4} /></span>
  if (status === 'info') return <span className="reg-mark is-info" aria-hidden="true"><Info size={13} strokeWidth={2.4} /></span>
  return <span className={`reg-mark is-${status}`} aria-hidden="true">{number}</span>
}

function recordChip(record: PortalRecord) {
  if (record.status === 'complete') return <span className="reg-chip is-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Complete</span>
  if (record.status === 'later') return <span className="reg-chip is-later"><Clock size={13} aria-hidden="true" />{record.issue ?? 'Later'}</span>
  return <span className="reg-chip is-attention"><CircleAlert size={13} aria-hidden="true" />{record.issue ?? 'Needs attention'}</span>
}

const NEW_PERSON = 'new-person'
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
// Trips in date and time order; undated ones last, and trips at the same time in the order they were added.
const tripOrder = (t: TravelRecord) => `${t.localDate ?? '9999'}${t.localTime ?? ''}${t.createdAt ?? ''}`
// Room requests go to the welfare team as free text, as the IOL Host's Handbook (6.2.2) asks registration to allow.
const welfareNoteLabel = 'Room requests and anything else the welfare team should know'

/**
 * The steps a registration has. A jury member or volunteer registers only themselves: no Teams step, the first step is
 * About you, People holds their own details (and a jury member's observer), and Payment is there only when they owe
 * something (an observer or a single room).
 */
function stepsFor(kind: DelegationKind, owes: boolean) {
  const country = kind === 'country'
  const all: Section[] = sections
    .filter((s) => country || (s.id !== 'teams' && (s.id !== 'payment' || owes)))
    .map((s) => (country ? s
      : s.id === 'setup' ? { ...s, title: 'About you', intro: kind === 'jury' ? 'Your name, your hotel room, and whether you bring an observer. This sets anything you pay.' : 'Your name, and whether you need a hotel room.' }
      : s.id === 'people' ? { ...s, title: 'Your details', intro: kind === 'jury' ? 'Your passport and personal details, your photo, and your observer’s details if you bring one.' : 'Your passport and personal details, and your photo.' }
      : s))
  const main = all.filter((s) => !s.afterSubmission)
  // "Before you begin" is an introduction, not a step: the numbered steps run from the first step to Submit.
  return { all, main, numbered: main.filter((s) => s.id !== 'start'), after: all.filter((s) => s.afterSubmission), required: all.filter((s) => s.required) }
}
const owesFor = (data: DelegationData) => (data.delegation.kind ?? 'country') === 'country' || data.fees.total > 0 || data.payments.length > 0
const kindNoun: Record<DelegationKind, string> = { country: 'National representative', jury: 'Jury member', volunteer: 'Volunteer' }

type StaffView = { roleLabel: string; onBack: () => void }

/**
 * One delegation's registration, step by step. Team Leaders see their own; registration admins open
 * any country's from the back office (staff), and every change is recorded under their name.
 */
export default function Workspace({ delegationId, onSessionEnd, staff, session }: { delegationId: string; onSessionEnd: () => void; staff?: StaffView; session?: ReactNode }) {
  const [data, setData] = useState<DelegationData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [activeId, setActiveId] = useState<SectionId>('start')
  const [selected, setSelected] = useState<Partial<Record<SectionId, string>>>({})
  const [draftOpen, setDraftOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [sectionError, setSectionError] = useState<ReactNode>(null)
  const [savedNote, setSavedNote] = useState('')
  const [busy, setBusy] = useState(false)
  // Said at the top of the step just opened: a step saved (ok), or one left unfinished (warn).
  const [infoNote, setInfoNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  // The transport chosen in the open trip form, which decides whether its airport and flight are asked.
  const [tripMode, setTripMode] = useState<'organisers' | 'own' | null>(null)
  // The two notices ticked on Submit: the royal reception's dress code and protocol, and travel insurance.
  const [acks, setAcks] = useState({ dressCode: false, insurance: false })
  const [navOpen, setNavOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const [draftTrip, setDraftTrip] = useState<'arrival' | 'departure' | null>(null)
  // "Add another" pressed before the first flight that way is saved: that first one opens, with a word on what to do.
  const [firstTripHint, setFirstTripHint] = useState<'arrival' | 'departure' | null>(null)
  // Forms with changes that are not saved yet, by their data-dirty-key: setup, invoice, welfare, record (the person,
  // team or trip being edited) and stay-note. Leaving one of them asks first, and so does closing the tab.
  const [dirty, setDirty] = useState<Record<string, true>>({})
  // A question before something that cannot be taken back: leaving unsaved changes, removing a person or a trip.
  const [ask, setAsk] = useState<{ title: string; text: ReactNode; stay: string; go: string; onGo: () => void } | null>(null)
  const askRef = useRef<HTMLDialogElement>(null)
  const stayRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const invoiceRef = useRef<HTMLFormElement>(null)
  const firstRender = useRef(true)
  const hasUnsaved = Object.keys(dirty).length > 0

  useEffect(() => {
    if (!hasUnsaved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])
  // The dialog opens on its safe answer: showModal would otherwise focus the first button, which is the risky one.
  useEffect(() => {
    if (!ask || askRef.current?.open) return
    askRef.current?.showModal()
    stayRef.current?.focus()
  }, [ask])
  useEffect(() => {
    unsavedWork.current = hasUnsaved
    return () => { unsavedWork.current = false }
  }, [hasUnsaved])

  const load = useCallback(async () => {
    const next = await api<DelegationData>(`/api/registration/delegations/${delegationId}`)
    setData(next)
    return next
  }, [delegationId])

  // Opens the first unfinished step once the data arrives, unless the person has already picked a step.
  const navigated = useRef(false)
  useEffect(() => {
    let current = true
    load().then((d) => {
      if (!current) return
      const { all: sections, required } = stepsFor(d.delegation.kind ?? 'country', owesFor(d))
      const steps = new Set(d.delegation.completedSteps)
      const paid = d.payments[0] && ['awaiting_review', 'approved'].includes(d.payments[0].status)
      if (navigated.current) return
      // Links in emails open a given step, e.g. the portal address with ?step=travel.
      const requested = new URLSearchParams(window.location.search).get('step')
      if (requested && sections.some((s) => s.id === requested)) { navigated.current = true; setActiveId(requested as SectionId); return }
      // A first visit starts with "Before you begin". Anyone coming back opens the first step still to do, or Submit once
      // there is none; so does a submitted registration, and a link to the old Review step.
      if (d.delegation.registrationStatus !== 'draft' || requested === 'review') setActiveId('submit')
      else if (steps.has('start')) setActiveId(required.find((s) => (s.id === 'payment' ? !paid : !steps.has(s.id)))?.id ?? 'submit')
    }).catch((e) => { if (!current) return; if (e instanceof ApiError && e.status === 401) onSessionEnd(); else setLoadError(messageOf(e)) })
    return () => { current = false }
  }, [load, onSessionEnd])

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    titleRef.current?.focus({ preventScroll: true })
    const top = panelRef.current?.getBoundingClientRect().top ?? 0
    if (top < 100 || top > window.innerHeight * 0.6) panelRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [activeId, recordOpen])

  const derived = useMemo(() => {
    if (!data) return null
    const d = data.delegation
    const kind = d.kind ?? 'country'
    const country = kind === 'country'
    const flow = stepsFor(kind, owesFor(data))
    const steps = new Set(d.completedSteps)
    const payment = data.payments[0]
    const paymentDone = Boolean(payment && ['awaiting_review', 'approved'].includes(payment.status))
    // Once a proof of payment is in (with Finance, confirmed, or returned to be completed), People opens, and Team and
    // observers and the invoice details lock, because they set the amount paid. Submitting still needs a proof
    // Finance has not returned.
    const proofIn = paymentDone || payment?.status === 'rejected'
    // People, and Rooms and welfare, open with the proof, or from the start for a delegation the organisers opened early,
    // and for jury members and volunteers.
    const peopleOpen = proofIn || Boolean(d.peopleOpenEarly) || !country
    const submitted = d.registrationStatus !== 'draft'
    // People holds what Team and observers chose (IOL Board, 16 Nov 2026): four contestants for each team, the Team
    // Leaders named there, and the observers chosen; a jury member's observer. "Add person" stops when all are in.
    const placesLeft = {
      contestant: country ? 4 * d.numberOfTeams - data.members.filter((m) => m.role === 'contestant').length : 0,
      observer: d.numberOfObservers - data.members.filter((m) => m.role === 'observer').length,
    }
    const draftRole = placesLeft.contestant > 0 ? 'contestant' as const : 'observer' as const
    const draftMember = { role: draftRole, teamId: draftRole === 'contestant' ? data.teams.find((t) => data.members.filter((m) => m.role === 'contestant' && m.teamId === t.id).length < 4)?.id ?? null : null }
    const records: Partial<Record<SectionId, PortalRecord[]>> = {
      teams: data.teams.map((t) => teamRecord(t, data)),
      people: [
        ...data.members.map((m) => personRecord(m, data)),
        ...(draftOpen ? [{ id: NEW_PERSON, label: 'New person', meta: 'Not saved yet', status: 'attention' as const, issue: 'Not saved yet', fields: personFields(draftMember, data) }] : []),
      ],
      // Every arrival and departure saved, by date, with an empty one to fill when there is none yet or one is being added.
      travel: (['arrival', 'departure'] as const).flatMap((dir) => {
        const trips = data.travelRecords.filter((t) => t.direction === dir).sort((a, b) => tripOrder(a).localeCompare(tripOrder(b)))
        const adding = !trips.length || draftTrip === dir
        const several = trips.length + (adding && trips.length ? 1 : 0) > 1
        const mode = (id: string) => (selected.travel === id && tripMode ? tripMode : undefined)
        return [...trips.map((t, i) => tripRecord(dir, t, data, several ? i + 1 : undefined, mode(t.id))), ...(adding ? [tripRecord(dir, undefined, data, several ? trips.length + 1 : undefined, mode(`new-${dir}`))] : [])]
      }),
    }
    return { d, kind, country, flow, steps, payment, paymentDone, proofIn, peopleOpen, submitted, records, placesLeft }
  }, [data, draftOpen, draftTrip, tripMode, selected.travel])

  const kindOfData = data?.delegation.kind ?? 'country'
  const eyebrow = staff ? `Back office · ${staff.roleLabel}` : kindOfData === 'jury' ? 'Jury registration' : kindOfData === 'volunteer' ? 'Volunteer registration' : 'National representative portal'
  if (loadError || !data || !derived) {
    return <>
      <PageHead eyebrow={eyebrow} title={staff ? 'Registration' : 'Your registration'} session={session} />
      <div className="reg-shell wrap">
        {loadError ? <div className="reg-panel"><Alert>{loadError}</Alert></div> : <p className="reg-loading" role="status">{staff ? 'Loading the registration…' : 'Loading your registration…'}</p>}
      </div>
    </>
  }

  const { d, kind, country, flow, steps, payment, paymentDone, proofIn, peopleOpen, submitted, records, placesLeft } = derived
  const { main, numbered, after, required } = flow
  const sectionList = flow.all
  const ev = data.event
  const isDone = (id: SectionId) => (id === 'payment' ? paymentDone : id === 'submit' ? submitted : steps.has(id))
  const doneCount = required.filter((s) => isDone(s.id)).length
  const allRequiredDone = doneCount === required.length

  /* still to do, by step ------------------------------------------- */
  // What a step needs beyond being saved: unfinished teams and people, stay dates, observers that match the fees.
  const todo: Partial<Record<SectionId, string[]>> = {}
  const needs = (step: SectionId, item: string) => { (todo[step] ??= []).push(item) }
  // Names asked in Team and observers since sign-up stopped asking for one (12 Nov 2026): the national representative,
  // and a Team Leader for each team.
  if (country) {
    if (!d.nationalRepresentativeName) needs('setup', 'Enter the national representative’s name')
    const leaders = data.members.filter((m) => m.role === 'team_leader').length
    if (leaders < d.numberOfTeams) needs('setup', d.numberOfTeams === 1 ? 'Name the Team Leader' : 'Name a Team Leader for each team')
    // Each team brings four contestants (IOL Board, 16 Nov 2026).
    if (peopleOpen) for (const t of data.teams) {
      const n = data.members.filter((m) => m.role === 'contestant' && m.teamId === t.id).length
      if (n !== 4) needs('people', `${t.name}: ${n} of 4 contestants`)
    }
  } else if (!data.members.some((m) => m.role === kind)) needs('setup', 'Enter your name')
  for (const id of ['teams', 'people'] as const) {
    (records[id] ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).forEach((r) => needs(id, `${r.label}: ${r.issue?.toLowerCase()}`))
  }
  const namedObservers = data.members.filter((m) => m.role === 'observer').length
  if (namedObservers !== d.numberOfObservers) {
    // Once Team and observers is locked, an extra observer is removed in People (or added by the organisers).
    const extra = namedObservers > d.numberOfObservers
    needs(extra && !proofIn ? 'setup' : 'people', extra && proofIn
      ? `Observers: ${d.numberOfObservers} paid for, ${namedObservers} in People. Remove the extra in People, or email the organisers to add one`
      : `Observers: ${d.numberOfObservers} in Team and observers, ${namedObservers} in People`)
  }
  const ready = !submitted && allRequiredDone && !Object.values(todo).some((items) => items?.length)

  const statusOf = (s: Section): StepStatus => {
    // People, and Rooms and welfare (built from People), open once the proof of payment is uploaded.
    if ((s.id === 'people' || s.id === 'welfare') && !peopleOpen) return 'locked'
    if (s.id === 'payment' && payment?.status === 'rejected') return 'attention'
    if (isDone(s.id)) return todo[s.id]?.length ? 'attention' : 'done'
    if (s.id === 'start') return 'info'
    if (s.id === 'submit') return ready ? 'todo' : 'waiting'
    if (s.afterSubmission) return submitted ? 'todo' : 'after'
    return 'todo'
  }
  const section = sectionList.find((s) => s.id === activeId) ?? sectionList[0]
  const status = statusOf(section)
  const locked = status === 'locked'
  // Payment is done on the representative's side once the proof is in; the label says where Finance is with it.
  const stepLabel = (s: Section, st = statusOf(s)) => (s.id === 'payment' && st === 'done' ? (payment?.status === 'approved' ? 'Confirmed' : 'With Finance')
    : s.id === 'payment' && st === 'attention' ? 'Proof returned'
    : s.id === 'submit' ? (submitted ? 'Submitted' : ready ? 'Ready to submit' : statusLabel.waiting)
    : st === 'attention' ? `${todo[s.id]!.length} ${todo[s.id]!.length === 1 ? 'thing' : 'things'} to finish` : statusLabel[st])
  // A step that can be worked on and still needs something: not saved yet, or saved and missing something since.
  const needsWork = (s: Section) => s.required && statusOf(s) !== 'locked' && (!isDone(s.id) || Boolean(todo[s.id]?.length))
  const firstOpenStep = ready || submitted ? undefined : main.find(needsWork)
  const stepNumber = (s: Section) => numbered.findIndex((x) => x.id === s.id) + 1
  // The date beside each step that closes (IOL Board, 16 Nov 2026), as a date rather than days left.
  const deadlineOf = (id: SectionId): string | null => (
    id === 'payment' && (!payment || payment.status === 'awaiting_proof') ? `${data.fees.tier === 'early_bird' ? 'Early bird rate until' : 'Due by'} ${longDate(data.fees.tier === 'early_bird' ? ev.earlyBirdEnds : ev.registrationEnds)}`
    : id === 'teams' ? (ev.languagesLocked ? `Languages closed on ${longDate(ev.languageLock)}` : `Languages can change until ${longDate(ev.languageLock)}`)
    : id === 'people' ? `By ${longDate(ev.peopleDeadline)}`
    : id === 'welfare' ? `By ${longDate(ev.peopleDeadline)}`
    : id === 'travel' ? (ev.travelLocked ? `Closed on ${longDate(ev.travelDeadline)}` : `Flights until ${longDate(ev.travelDeadline)}`)
    : null)
  const stepsDone = numbered.filter((s) => statusOf(s) === 'done').length
  // Steps can be done in any order, so after one comes the next one along that still needs something, and once there is
  // none, Submit, which shows anything left from earlier.
  const nextOf = (id: SectionId) => main.slice(main.findIndex((s) => s.id === id) + 1).find(needsWork)?.id ?? 'submit'

  /* unsaved changes ------------------------------------------------ */
  const markDirty = (key: string) => setDirty((now) => (now[key] ? now : { ...now, [key]: true }))
  const trackChange = (event: ChangeEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target instanceof HTMLInputElement && target.type === 'file') return
    const key = target.closest<HTMLElement>('[data-dirty-key]')?.dataset.dirtyKey
    if (key) markDirty(key)
  }
  const clean = (...keys: string[]) => setDirty((now) => {
    const next = { ...now }
    for (const key of keys) delete next[key]
    return next
  })
  /** Runs `go` straight away, or asks first when any of `keys` (every form, by default) has unsaved changes. */
  const guard = (go: () => void, keys = Object.keys(dirty)) => {
    const pending = keys.filter((key) => dirty[key])
    if (!pending.length) { go(); return }
    setAsk({
      title: 'Leave without saving?', stay: 'Keep editing', go: 'Leave without saving',
      text: <>Your changes to {pending.map((key) => unsavedNames[key] ?? key).join(' and ')} are not saved yet. If you leave now, they will be lost.</>,
      onGo: () => { clean(...pending); go() },
    })
  }

  const go = (id: SectionId) => {
    navigated.current = true
    setActiveId(id); setNavOpen(false); setRecordOpen(false)
    setFieldErrors({}); setSectionError(null); setSavedNote(''); setInfoNote(null); setDraftTrip(null)
  }
  const open = (id: SectionId) => guard(() => go(id))

  /** Runs a server action, reloads, and turns failures into a visible message. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setSectionError(null); setInfoNote(null)
    try {
      await work()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { onSessionEnd(); return }
      setSectionError(e instanceof ApiError && e.missing?.length ? <>Still needed: {e.missing.join(', ')}.</> : messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  const patchDelegation = (body: Record<string, unknown>) => api(`/api/registration/delegations/${d.id}`, { method: 'PATCH', body })
  const finishStep = async (id: SectionId, extra: Record<string, unknown> = {}) => {
    await patchDelegation({ ...extra, completedSteps: [...new Set([...d.completedSteps, id])] })
    await load()
    // The step is saved, so nothing on it is left unsaved (an open record was asked about before finishing).
    setDirty({})
    go(nextOf(id))
    const finished = sectionList.find((s) => s.id === id)
    if (finished?.required) setInfoNote({ tone: 'ok', text: `“${finished.title}” is saved.` })
  }
  /** Moves on from a step that is not finished; it stays on the to-do list, and the next step says so. */
  const moveOn = (text: string) => {
    go(nextOf(activeId))
    setInfoNote({ tone: 'warn', text })
  }

  /* records ------------------------------------------------------- */
  const sectionRecords = records[activeId] ?? []
  const currentRecord = sectionRecords.find((r) => r.id === selected[activeId]) ?? sectionRecords[0]
  // Opening another record (or a new person) replaces the editor, so unsaved changes in it are asked about first.
  const chooseRecord = (id: string) => guard(() => {
    setTripMode(null)
    setSelected((s) => ({ ...s, [activeId]: id }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote(''); clean('record')
  }, id === currentRecord?.id ? [] : ['record'])

  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentRecord) return
    const form = new FormData(event.currentTarget)
    run(async () => {
      if (activeId === 'teams') {
        await api(`/api/registration/teams/${currentRecord.id}`, { method: 'PATCH', body: { name: String(form.get('Team name') ?? '').trim() || currentRecord.label, contestLanguage: String(form.get('Team contest language') ?? '') || null } })
        await load()
        clean('record')
        setSavedNote('Saved.')
      } else if (activeId === 'travel') {
        const isNew = currentRecord.id.startsWith('new-')
        const direction = isNew ? (currentRecord.id.slice(4) as 'arrival' | 'departure') : data.travelRecords.find((t) => t.id === currentRecord.id)!.direction
        const body = tripPayload(form, direction, data.members)
        const before = new Set(data.travelRecords.map((t) => t.id))
        if (isNew) await api(`/api/registration/delegations/${d.id}/travel`, { method: 'POST', body })
        else await api(`/api/registration/travel/${currentRecord.id}`, { method: 'PATCH', body })
        const fresh = await load()
        const saved = isNew ? fresh.travelRecords.find((t) => !before.has(t.id)) : fresh.travelRecords.find((t) => t.id === currentRecord.id)
        if (saved) setSelected((s) => ({ ...s, travel: saved.id }))
        setDraftTrip(null)
        clean('record')
        setTripMode(null)
        setSavedNote(tripComplete({ ...body, id: '', terminal: null, memberIds: [] } as TravelRecord) ? 'Saved.' : 'Saved. Finish this trip once flights are booked.')
      } else if (activeId === 'people') {
        const member = data.members.find((m) => m.id === currentRecord.id)
        const role = member?.role ?? 'contestant'
        const payload = personPayload(form, role, data)
        if (!payload.displayName) { setFieldErrors({ 'Display name': 'Enter a name so we can save this person.' }); focusFirstError(panelRef.current); return }
        let id = currentRecord.id
        if (currentRecord.id === NEW_PERSON) {
          id = (await api<{ member: Member }>(`/api/registration/delegations/${d.id}/members`, { method: 'POST', body: payload })).member.id
          setDraftOpen(false)
          setSelected((s) => ({ ...s, people: id }))
        } else {
          await api(`/api/registration/members/${id}`, { method: 'PATCH', body: payload })
        }
        await load()
        setFieldErrors({})
        clean('record')
        // What is still missing shows above the form, in "Still needed".
        setSavedNote('Saved.')
      }
    })
  }

  const addPerson = () => guard(() => {
    setDraftOpen(true)
    setSelected((s) => ({ ...s, people: NEW_PERSON }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote(''); clean('record')
  }, ['record'])
  const cancelNewPerson = () => {
    setDraftOpen(false); setSelected((s) => ({ ...s, people: undefined })); clean('record')
  }
  const addTrip = (direction: 'arrival' | 'departure') => guard(() => {
    const first = !data!.travelRecords.some((t) => t.direction === direction)
    setFirstTripHint(first ? direction : null)
    if (!first) setDraftTrip(direction)
    setSelected((s) => ({ ...s, travel: `new-${direction}` }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote(''); clean('record')
  }, ['record'])
  const cancelNewTrip = () => {
    setDraftTrip(null); setSelected((s) => ({ ...s, travel: undefined })); clean('record')
  }
  /** Removing a person or a trip asks first: it cannot be undone. */
  const remove = (what: 'person' | 'trip', id: string, name: string) => setAsk({
    title: `Remove ${name}?`, stay: what === 'person' ? 'Keep them' : 'Keep it', go: 'Remove',
    text: what === 'person' ? `${name}’s details are deleted from your registration. This cannot be undone.` : `This ${name.toLowerCase()} is deleted from your registration. This cannot be undone.`,
    onGo: () => run(async () => {
      await api(what === 'person' ? `/api/registration/members/${id}` : `/api/registration/travel/${id}`, { method: 'DELETE' })
      clean('record')
      setSelected((s) => ({ ...s, [activeId]: undefined }))
      setRecordOpen(false); setSavedNote('')
      await load()
      setInfoNote({ tone: 'ok', text: `${name} is removed.` })
    }),
  })

  const finishRecords = () => guard(() => {
    const pending = sectionRecords.filter((r) => r.status === 'attention' && r.id !== NEW_PERSON)
    if (pending.length) {
      moveOn(`${section.title} is not finished yet, so it stays on your list: ${pending.map((r) => `${r.label} (${r.issue?.toLowerCase()})`).join(', ')}.`)
      return
    }
    run(() => finishStep(activeId))
  }, ['record'])

  /* setup, payment, welfare --------------------------------------- */
  const saveSetup = (body: SetupBody) => run(() => finishStep('setup', body))

  const saveInvoice = async () => {
    const body = readInvoices(new FormData(invoiceRef.current!))
    const problems = invoiceProblems(body, data.fees.total)
    setFieldErrors(problems)
    if (Object.keys(problems).length) { focusFirstError(panelRef.current); return false }
    await api(`/api/registration/delegations/${d.id}/invoice`, { method: 'PUT', body })
    await load()
    clean('invoice')
    return true
  }
  // The proof is one or more files; each upload adds to it and sends it to Finance again.
  const uploadProof = (files: File[]) => run(async () => {
    const form = new FormData()
    files.forEach((file) => form.append('proof', file))
    await api(`/api/registration/delegations/${d.id}/payment-proof`, { method: 'POST', form })
    await load()
    setFieldErrors({})
    setSavedNote(files.length > 1 ? `${files.length} files uploaded.` : 'File uploaded.')
  })
  const removeProofFile = (id: string) => run(async () => {
    await api(`/api/registration/attachments/${id}/proof`, { method: 'DELETE' })
    await load()
    setSavedNote('File removed.')
  })
  const uploadConsent = (memberId: string, file: File) => run(async () => {
    const form = new FormData()
    form.append('consent', file)
    await api(`/api/registration/members/${memberId}/guardian-consent`, { method: 'POST', form })
    await load()
    setSavedNote('Consent form uploaded.')
  })
  const savePayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (paymentDone) { go(nextOf('payment')); return }
    run(async () => {
      if ((!payment || dirty.invoice) && !proofIn && !(await saveInvoice())) return
      moveOn(payment?.status === 'rejected'
        ? 'Payment stays on your list until you add the files Finance asked for.'
        : 'Payment stays on your list until you upload the bank’s proof of transfer. Come back to it after you transfer.')
    })
  }

  const saveWelfare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get(welfareNoteLabel) ?? '').trim()
    run(() => finishStep('welfare', { welfareNote: note || null }))
  }

  const uploadPhoto = (memberId: string, file: Blob) => run(async () => {
    const form = new FormData()
    form.append('photo', file, 'photo.jpg')
    await api(`/api/registration/members/${memberId}/photo`, { method: 'POST', form })
    await load()
    setSavedNote('Photo saved.')
  })

  /** A Copy button for something typed into online banking: the payment reference, account number, SWIFT code. */
  const copyButton = (what: string, text: string) => (
    <button type="button" className="reg-copy" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied((c) => (c === what ? '' : c)), 1800) } catch { /* clipboard blocked: the text stays visible to copy by hand */ }
    }}><Copy size={14} aria-hidden="true" />{copied === what ? 'Copied' : 'Copy'}<span className="reg-visually-hidden"> {what}</span></button>
  )

  /** Submits the registration. The server checks everything again and lists anything still missing. */
  const submit = () => run(async () => {
    if (!acks.dressCode || !acks.insurance) {
      setSectionError('Tick both boxes above first: the dress code and protocol, and travel insurance.')
      document.getElementById(!acks.dressCode ? 'ack-dress-code' : 'ack-insurance')?.focus()
      return
    }
    await api(`/api/registration/delegations/${d.id}/submit`, { method: 'POST', body: { acknowledgeDressCode: true, acknowledgeInsurance: true } })
    await load()
    setInfoNote({ tone: 'ok', text: 'Your registration is submitted.' })
  })

  const groupFields = (fields: Field[]) => {
    if (activeId !== 'people') return [{ legend: '', note: undefined as string | undefined, fields }]
    const used = new Set<string>()
    const groups = personFieldGroups.map((g) => {
      const list = g.labels.map((l) => fields.find((f) => f.label === l)).filter((f): f is Field => Boolean(f))
      list.forEach((f) => used.add(f.label))
      return { legend: g.legend, note: g.note, fields: list }
    }).filter((g) => g.fields.length)
    const rest = fields.filter((f) => !used.has(f.label))
    return rest.length ? [...groups, { legend: 'Other', note: undefined, fields: rest }] : groups
  }

  // The files of the proof, oldest first. Files can be added, and removed (one must stay), until Finance confirms it.
  const proofFiles = !payment ? [] : data.attachments
    .filter((a) => a.kind === 'payment_proof' && (a.paymentId ? a.paymentId === payment.id : a.id === payment.proofAttachmentId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const canUpload = Boolean(payment && ['awaiting_proof', 'rejected', 'awaiting_review'].includes(payment.status))
  const canRemoveProof = Boolean(payment && ['rejected', 'awaiting_review'].includes(payment.status)) && proofFiles.length > 1
  const receipt = payment?.status === 'approved' && payment.receiptNumber ? payment : undefined
  const lastProof = proofFiles[proofFiles.length - 1]
  const proofDay = lastProof ? dayOf(lastProof.createdAt) : null
  const reviewDay = payment?.reviewedAt ? dayOf(payment.reviewedAt) : null
  // One PDF per invoice: a split has one for each payer, numbered IOL2027/23-1, -2 and so on.
  const invoiceFiles = !payment ? [] : payment.invoiceSplits?.length
    ? payment.invoiceSplits.map((s, i) => ({ href: `/api/registration/delegations/${d.id}/invoice?part=${i + 1}`, number: `${payment.invoiceNumber}-${i + 1}`, payer: s.recipientName, amount: Number(s.amount) }))
    : [{ href: `/api/registration/delegations/${d.id}/invoice`, number: payment.invoiceNumber ?? '', payer: payment.invoiceRecipientName ?? d.countryTerritory, amount: Number(payment.amountDue) }]
  const proofChip = payment?.status === 'approved' ? <Chip tone="ok">Approved</Chip>
    : payment?.status === 'awaiting_review' ? <Chip tone="later">With Finance</Chip>
    : payment?.status === 'rejected' ? <Chip tone="attention">Returned</Chip>
    : <Chip tone="later">Not uploaded yet</Chip>
  // Once the proof is in, Payment opens with where the payment is: what happened, what Finance is doing, what comes next.
  const payProgress: { title: string; intro: string; stages: PayStage[] } | null = !payment || !['awaiting_review', 'approved', 'rejected'].includes(payment.status) ? null : {
    title: payment.status === 'approved' ? 'Payment confirmed' : payment.status === 'rejected' ? 'Finance returned your proof' : 'Finance is checking your payment',
    intro: payment.status === 'approved' ? 'Thank you. There is nothing more to do in this step.'
      : payment.status === 'rejected' ? 'Add the missing or corrected files in part 4 below, and remove any that were wrong. Everything else you have entered is kept, and the other steps stay open.'
      : 'You do not need to wait for it: carry on with the other steps. We email you as soon as the payment is confirmed.',
    stages: [
      { key: 'uploaded', state: 'done', title: 'Proof uploaded', detail: <>{proofDay ? `On ${proofDay}` : 'Uploaded'}{proofFiles.length === 1 ? <>: {proofFiles[0].originalFilename}</> : proofFiles.length > 1 ? `: ${proofFiles.length} files` : ''}</> },
      payment.status === 'approved' ? { key: 'check', state: 'done', title: 'Finance checked it against the bank statement', detail: `Matched${reviewDay ? ` on ${reviewDay}` : ''}.` }
        : payment.status === 'rejected' ? { key: 'check', state: 'problem', title: 'Finance could not match it', detail: <>Returned{reviewDay ? ` on ${reviewDay}` : ''}{payment.reviewNote ? <>, with this note: “{payment.reviewNote}”</> : '.'}</> }
        : { key: 'check', state: 'current', title: 'Finance checks it against the bank statement', detail: 'Usually within 5 business days. A transfer from abroad can take a few days to reach the account.' },
      payment.status === 'approved'
        ? { key: 'confirmed', state: 'done', title: 'Payment confirmed', detail: `Confirmed${reviewDay ? ` on ${reviewDay}` : ''}. We have emailed you, and your e-receipt is here.`,
          action: receipt && <button type="button" className="reg-btn reg-btn-secondary reg-btn-small" onClick={() => openReceipt({
            organisation: receipt.invoiceRecipientName ?? d.countryTerritory, country: d.countryTerritory, recipientAddress: receipt.invoiceRecipientAddress,
            reference: receipt.paymentReference, receiptNumber: receipt.receiptNumber!, amountPaid: Number(receipt.amountDue), currency: receipt.currency,
            tierLabel: receipt.feeTier === 'early_bird' ? 'Early bird' : 'Normal', approvedAt: receipt.reviewedAt,
          })}><Download size={16} aria-hidden="true" />Download the e-receipt</button> }
        : { key: 'confirmed', state: 'later', title: 'Payment confirmed', detail: 'We email you, and your e-receipt appears here.' },
    ],
  }
  const singleRoomsChosen = [...d.singleRooms.teamLeaders, ...d.singleRooms.observers].filter(Boolean).length
  const unsavedNames: Record<string, string> = {
    setup: country ? 'Team and observers' : 'About you', invoice: 'the invoice details', welfare: 'the note for the welfare team',
    record: currentRecord?.id === NEW_PERSON ? 'the new person' : currentRecord?.label ?? 'this record',
  }
  const consentMember = activeId === 'people' ? data.members.find((m) => m.id === currentRecord?.id && m.needsGuardianConsent) : undefined
  const consent = consentMember ? consentFor(consentMember, data.attachments) : undefined
  // A jury member's or volunteer's own record asks for their photo.
  const photoMember = activeId === 'people' ? data.members.find((m) => m.id === currentRecord?.id && (m.role === 'jury' || m.role === 'volunteer')) : undefined

  /* submit: where every step stands ----------------------------------- */
  const paymentStatus = payment?.status
  const peopleCount = data.members.filter((m) => country ? m.role !== 'team_leader' : true).length
  const peopleToFinish = (records.people ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).length
  const flightsIn = data.travelRecords.filter((t) => tripComplete(t)).length
  // Who is not on any arrival or departure yet: their badges wait for it.
  const offTrips = (direction: 'arrival' | 'departure') => data.members
    .filter((m) => !data.travelRecords.some((t) => t.direction === direction && t.memberIds.includes(m.id)))
    .map((m) => m.badgeName || m.displayName)
  const flightsMissing = data.travelRecords.some((t) => !tripComplete(t)) || (data.members.length > 0 && (offTrips('arrival').length > 0 || offTrips('departure').length > 0))
  const trackDetail: Record<SectionId, string> = {
    start: '',
    setup: !country ? (steps.has('setup') ? `${d.needsAccommodation === false ? 'No hotel room' : singleRoomsChosen ? 'Hotel room, with a single room' : 'Hotel room, shared'}${d.numberOfObservers ? ', bringing an observer' : ''}.` : 'Your name, and your hotel room.')
      : steps.has('setup')
      ? `${d.numberOfTeams} ${d.numberOfTeams === 1 ? 'team' : 'teams'}, ${d.numberOfObservers} ${d.numberOfObservers === 1 ? 'observer' : 'observers'}, ${singleRoomsChosen || 'no'} single ${singleRoomsChosen === 1 ? 'room' : 'rooms'}.`
      : 'How many teams and observers, who leads each team, and who would like a single room. This sets your fees.',
    payment: paymentStatus === 'approved' ? `Confirmed by Finance${reviewDay ? ` on ${reviewDay}` : ''}. Your e-receipt is in this step.`
      : paymentStatus === 'awaiting_review' ? `Proof uploaded${proofDay ? ` on ${proofDay}` : ''}. Finance is checking it against the bank statement, usually within 5 business days.`
      : paymentStatus === 'rejected' ? 'Finance returned the proof. Upload a new one.'
      : payment ? 'Invoice details saved. Transfer, then upload the bank’s proof.' : 'Invoice details, the bank transfer, then the proof of transfer.',
    teams: steps.has('teams') ? data.teams.map((t) => `${t.name}: ${t.contestLanguage ?? 'no language yet'}`).join(' · ') : 'Choose each team’s contest language.',
    people: !peopleOpen ? 'Opens once the proof of payment is uploaded.'
      : `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} entered${peopleToFinish ? `, ${peopleToFinish} still to finish` : ''}.`,
    welfare: !peopleOpen ? 'Opens with People, once the proof of payment is uploaded.' : steps.has('welfare') ? 'Summary checked.' : 'Check the summary built from everyone’s details, and add any room requests.',
    travel: flightsIn ? `${flightsIn} ${flightsIn === 1 ? 'trip' : 'trips'} added${flightsMissing ? ', but not everyone is on an arrival and a departure yet' : ''}. Changes until ${longDate(ev.travelDeadline)}.` : `Flights once they are booked, by ${longDate(ev.travelDeadline)}.`,
    submit: '',
    badges: '',
  }
  type TrackState = StepStatus | 'next'
  type TrackStep = { key: string; title: string; detail: string; state: TrackState; label: string; to?: SectionId; items?: string[] }
  const trackOf = (s: Section): TrackStep => {
    const st = statusOf(s)
    const state: TrackState = st !== 'locked' && s.id === firstOpenStep?.id ? 'next' : st === 'info' ? 'todo' : st
    // What is still missing shows under People as it is filled in, and under any step saved earlier that has lost
    // something since (a step not started yet already says what it needs).
    const items = st !== 'locked' && (isDone(s.id) || s.id === 'people') ? todo[s.id] : undefined
    return { key: s.id, title: s.title, detail: trackDetail[s.id], state, label: state === 'next' ? 'Next' : stepLabel(s, st), to: s.id, items }
  }
  // Submitting is the last step of the registration, done on this page.
  const submitStep: TrackStep = {
    key: 'submit', title: 'Submit registration', state: submitted ? 'done' : ready ? 'next' : 'waiting', label: submitted ? 'Done' : ready ? 'Next' : statusLabel.waiting,
    detail: submitted ? `Submitted${d.submittedAt ? ` on ${dayOf(d.submittedAt)}` : ''}. People and travel can still be updated until the change deadline.`
      : ready ? 'Everything is in. Submit with the button at the top of this page.' : 'Once the steps above are done, you submit here, on this page.',
  }
  const phases: { title: string; steps: TrackStep[] }[] = [
    { title: 'Your account', steps: [
      { key: 'code', title: 'Invitation code', detail: country ? `Linked this account to ${d.countryTerritory}.` : `Registering as ${kind === 'jury' ? 'a jury member' : 'a volunteer'}.`, state: 'done', label: 'Done' },
      { key: 'account', title: 'Your account', detail: `${d.teamLeaderEmail}, email checked.`, state: 'done', label: 'Done' },
    ] },
    { title: 'Registration', steps: [...numbered.filter((s) => s.id !== 'submit').map(trackOf), submitStep] },
    { title: 'Before the Olympiad', steps: [
      { key: 'letters', title: 'Invitation letters', detail: paymentStatus === 'approved' ? 'Your payment is confirmed, so letters for visa applications follow by email.' : 'One for each person, sent once the payment is confirmed.', state: 'after', label: 'Later' },
      { key: 'badges', title: 'QR badges', detail: 'Emailed to you as PDFs once the payment is confirmed and everyone’s arrival and departure are in.', state: 'after', label: 'Later', to: 'badges' },
      { key: 'arrival', title: 'Arrival in Bangkok', detail: 'From 21 July 2027. Badges are scanned at the arrival desk.', state: 'after', label: 'Later' },
    ] },
  ]

  // The card at the top of Submit: the one thing to do next, or submitting once everything is in.
  const nextUp = firstOpenStep ?? numbered[0]
  const nextStep: { tone: 'go' | 'warn' | 'done'; kicker: string; title: string; body: ReactNode; to?: SectionId; cta?: string; submit?: boolean } =
    submitted ? { tone: 'done', kicker: 'Registration submitted', title: 'Submitted. Thank you.', ...(flightsMissing ? { to: 'travel' as const, cta: 'Add flight details' } : {}),
      body: <>A confirmation with your invoice went to {d.teamLeaderEmail}. {paymentStatus === 'approved' ? '' : 'Finance confirms your payment next. '}People and travel can still be updated until the change deadline.</> }
    : paymentStatus === 'rejected' ? { tone: 'warn', kicker: 'Action needed', title: 'Upload a new proof of payment', to: 'payment', cta: 'Go to Payment',
      body: <>Finance could not match your proof of transfer.{payment?.reviewNote ? <> Their note: “{payment.reviewNote}”</> : null}</> }
    : ready ? { tone: 'go', kicker: 'Ready to submit', title: 'Everything is in. Submit your registration.', submit: true,
      body: 'Check anything you like first: each step below opens from its name. After you submit, you can still update people and travel until the change deadline.' }
    : { tone: 'go', kicker: 'Not ready to submit yet', title: `Next: ${nextUp.title}`, to: nextUp.id, cta: `Continue to ${nextUp.title}`,
      body: <>{isDone(nextUp.id) && todo[nextUp.id]?.length ? `${todo[nextUp.id]!.join('; ')}.` : trackDetail[nextUp.id]}{paymentStatus === 'awaiting_review' && <> Finance is checking your proof of payment; carry on meanwhile.</>}</> }

  // Registration steps keep the numbers the step rail gives them.
  const trackMark = (step: TrackStep) => step.state === 'done' ? <Check size={15} strokeWidth={3} />
    : step.state === 'locked' ? <Lock size={14} strokeWidth={2.4} />
    : step.state === 'after' ? <Clock size={14} />
    : stepNumber(sectionList.find((s) => s.id === (step.to ?? step.key)) ?? sectionList[0])

  // Before submitting (IOL Board, 16 Nov 2026): the royal reception's dress code and protocol, and travel insurance.
  const notices = (
    <Card id="submit-notices" title="Before you submit" intro={submitted ? undefined : 'Please read both and tick each box. Submitting needs both.'}>
      <div className="reg-notices">
        <div className="reg-notice">
          <h4>Royal reception: dress code and protocol</h4>
          <p>{ev.dressCode}</p>
          {submitted
            ? <p className="reg-hint"><Check size={14} strokeWidth={3} aria-hidden="true" /> Confirmed{d.dressCodeAcknowledgedAt ? ` on ${dayOf(d.dressCodeAcknowledgedAt)}` : ''}.</p>
            : <label className="reg-check"><input type="checkbox" id="ack-dress-code" checked={acks.dressCode} onChange={(e) => { setAcks((a) => ({ ...a, dressCode: e.target.checked })); setSectionError(null) }} />
              <span>{country ? 'I have read the dress code and protocol, and will make sure everyone in my delegation follows them.' : 'I have read the dress code and protocol, and will follow them.'}</span></label>}
        </div>
        <div className="reg-notice">
          <h4>Travel insurance</h4>
          <p>We strongly recommend that everyone travels with insurance covering medical treatment and accidents. Each participant is responsible for their own personal accident and medical expenses, subject to the official event policy.</p>
          {submitted
            ? <p className="reg-hint"><Check size={14} strokeWidth={3} aria-hidden="true" /> Confirmed{d.insuranceAcknowledgedAt ? ` on ${dayOf(d.insuranceAcknowledgedAt)}` : ''}.</p>
            : <label className="reg-check"><input type="checkbox" id="ack-insurance" checked={acks.insurance} onChange={(e) => { setAcks((a) => ({ ...a, insurance: e.target.checked })); setSectionError(null) }} />
              <span>{country ? 'I understand that each person in my delegation is responsible for their own accident and medical expenses, and that travel insurance is recommended.' : 'I understand that I am responsible for my own accident and medical expenses, and that travel insurance is recommended.'}</span></label>}
        </div>
      </div>
    </Card>
  )

  const overview = (
    <div className="reg-home">
      {notices}
      <div className={`reg-home-next is-${nextStep.tone}`}>
        <div>
          <p className="reg-home-kicker">{nextStep.kicker}</p>
          <h3>{nextStep.title}</h3>
          <p>{nextStep.body}</p>
          {nextStep.submit && <Alert>{sectionError}</Alert>}
        </div>
        {nextStep.submit
          ? <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit registration'} <Send size={17} aria-hidden="true" /></button>
          : nextStep.to && <button type="button" className="reg-btn reg-btn-primary" onClick={() => open(nextStep.to!)}>{nextStep.cta} <ArrowRight size={18} aria-hidden="true" /></button>}
      </div>

      <div className="reg-track">
        {phases.map((phase) => (
            <div className="reg-track-phase" key={phase.title}>
              <h3>{phase.title}</h3>
              <ol>
                {phase.steps.map((step) => (
                  <li key={step.key} className={`is-${step.state}`} aria-current={step.state === 'next' ? 'step' : undefined}>
                    <span className="reg-track-mark" aria-hidden="true">{trackMark(step)}</span>
                    <div className="reg-track-body">
                      <p className="reg-track-title">
                        {step.to && step.state !== 'after' ? <button type="button" onClick={() => open(step.to!)}>{step.title}</button> : <strong>{step.title}</strong>}
                        <span className="reg-track-label">{step.label}</span>
                      </p>
                      <p className="reg-track-detail">{step.detail}</p>
                      {step.items && step.items.length > 0 && (
                        <ul className="reg-track-todo" aria-label={`Still to do in ${step.title}`}>
                          {step.items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
        ))}
      </div>

      <div className="reg-home-foot">
        <dl>
          {owesFor(data) && <div><dt>Early bird rate</dt><dd>Proof of payment uploaded by {longDate(ev.earlyBirdEnds)}</dd></div>}
          <div><dt>Registration closes</dt><dd>{longDate(ev.registrationEnds)}</dd></div>
          {country && <div><dt>Contest languages</dt><dd>Can change until {longDate(ev.languageLock)}</dd></div>}
          <div><dt>People details</dt><dd>By {longDate(ev.peopleDeadline)}</dd></div>
          <div><dt>Flights</dt><dd>Add and change until {longDate(ev.travelDeadline)}</dd></div>
          <div><dt>The Olympiad</dt><dd>21–28 July 2027, Bangkok</dd></div>
        </dl>
        <p>Questions about your registration? <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a></p>
      </div>
    </div>
  )

  const answer = () => {
    const question = ask
    askRef.current?.close()
    question?.onGo()
  }
  // Team Leaders are named in Team and observers, and a jury member's or volunteer's own record comes from About you.
  const fixedRecord = (id: string) => ['team_leader', 'jury', 'volunteer'].includes(data.members.find((m) => m.id === id)?.role ?? '')
  const canAdd = placesLeft.contestant > 0 || placesLeft.observer > 0

  const recordsCard = section.records && !locked && (
    <div className={`reg-card reg-records${recordOpen ? ' is-open' : ''}`}>
      <div className="reg-record-list">
        <div className="reg-record-list-head">
          <h3>{activeId === 'travel' ? 'Flights' : `${sectionRecords.filter((r) => r.id !== NEW_PERSON).length} ${section.records.plural}`}</h3>
          {activeId === 'people' && !draftOpen && canAdd && <button type="button" className="reg-btn-link" onClick={addPerson}><UserPlus size={16} aria-hidden="true" />{country ? 'Add person' : 'Add your observer'}</button>}
        </div>
        {activeId === 'people' && !canAdd && kind !== 'volunteer' && <p className="reg-hint">Everyone is in: {country ? `four contestants for each team, the Team Leaders and ${d.numberOfObservers === 1 ? 'the observer' : d.numberOfObservers ? `the ${d.numberOfObservers} observers` : 'no observers'} chosen in Team and observers` : 'you, and your observer if you bring one'}. To add someone, change {country ? 'Team and observers' : 'About you'} (before the proof of payment), or email the organisers.</p>}
        {activeId === 'people' && canAdd && country && <p className="reg-hint">Still to add: {[placesLeft.contestant > 0 && `${placesLeft.contestant} ${placesLeft.contestant === 1 ? 'contestant' : 'contestants'}`, placesLeft.observer > 0 && `${placesLeft.observer} ${placesLeft.observer === 1 ? 'observer' : 'observers'}`].filter(Boolean).join(' and ')}.</p>}
        {activeId === 'travel' && <p className="reg-hint">Add each flight once it is booked. People on different flights? Add an arrival or departure for each flight, and tick who is on it.</p>}
        <ul>
          {sectionRecords.map((record) => (
            <li key={record.id}>
              <button type="button" className={`reg-record${record.id === currentRecord?.id ? ' is-current' : ''}`} aria-current={record.id === currentRecord?.id ? 'true' : undefined} onClick={() => chooseRecord(record.id)}>
                <span className="reg-record-name"><strong>{record.label}</strong><small>{record.meta}</small></span>
                {recordChip(record)}
              </button>
            </li>
          ))}
        </ul>
        {activeId === 'travel' && !draftTrip && (
          <div className="reg-record-adds">
            {(['arrival', 'departure'] as const).map((dir) => (
              <button key={dir} type="button" className="reg-btn-link reg-add-link" onClick={() => addTrip(dir)}><Plus size={16} aria-hidden="true" />Add another {dir}</button>
            ))}
          </div>
        )}
        {activeId === 'travel' && data.travelRecords.length > 0 && data.members.length > 0 && (['arrival', 'departure'] as const).map((dir) => {
          const left = offTrips(dir)
          return left.length ? <p key={dir} className="reg-hint reg-off-trip">Not on {dir === 'arrival' ? 'an arrival' : 'a departure'} yet: {left.join(', ')}.</p> : null
        })}
      </div>

      {currentRecord && (
        <form className="reg-record-editor" onSubmit={saveRecord} noValidate key={currentRecord.id} data-dirty-key="record"
          onChange={(e) => {
            const target = e.target as unknown as HTMLInputElement
            if (activeId === 'travel' && (target.name === transportLabel('arrival') || target.name === transportLabel('departure'))) {
              setTripMode(target.value === transportChoices.arrival[1] || target.value === transportChoices.departure[1] ? 'own' : 'organisers')
            }
          }}>
          <button type="button" className="reg-btn-link reg-back-to-list" onClick={() => guard(() => { setRecordOpen(false); clean('record') }, ['record'])}><ArrowLeft size={16} aria-hidden="true" />All {section.records.plural}</button>
          <div className="reg-editor-head">
            <h3>{currentRecord.label}</h3>
            {recordChip(currentRecord)}
          </div>
          {activeId === 'travel' && firstTripHint && currentRecord.id === `new-${firstTripHint}` && !data.travelRecords.some((t) => t.direction === firstTripHint) && (
            <p className="reg-aside" role="status"><Info size={18} aria-hidden="true" /><span>Fill in this first {firstTripHint} and tick who is on it, then save it. After that, “Add another {firstTripHint}” adds the next flight, for anyone on a different one.</span></p>
          )}
          {currentRecord.missing && currentRecord.missing.length > 0 && (
            <p className="reg-aside reg-aside-warn reg-still"><CircleAlert size={18} aria-hidden="true" /><span><strong>Still needed:</strong> {currentRecord.missing.map((label) => label.toLowerCase()).join(', ')}.</span></p>
          )}
          {currentRecord.facts && <Facts compact items={currentRecord.facts} />}
          {groupFields(currentRecord.fields).map((group) => group.legend ? (
            <fieldset className="reg-fieldset" key={group.legend}>
              <legend>{group.legend}</legend>
              {group.note && <p className="reg-hint">{group.note}</p>}
              <div className="reg-grid">{group.fields.map((f) => <FieldControl key={f.label} field={f} idPrefix={`${activeId}-${currentRecord.id}`} error={fieldErrors[f.label]} />)}</div>
            </fieldset>
          ) : (
            <div className="reg-grid" key="fields">{group.fields.map((f) => <FieldControl key={f.label} field={f} idPrefix={`${activeId}-${currentRecord.id}`} error={fieldErrors[f.label]} />)}</div>
          ))}
          {photoMember && (
            <PhotoField key={photoFor(photoMember, data.attachments)?.id ?? 'none'} busy={busy} current={photoFor(photoMember, data.attachments)} onSave={(blob) => uploadPhoto(photoMember.id, blob)} />
          )}
          {consentMember && (
            <div className="reg-field reg-field-wide reg-proof">
              <span className="reg-label-text" id="consent-label">Guardian consent form</span>
              <p className="reg-hint" id="consent-hint">Needed because {consentMember.displayName} is under {data.guardianConsent.ageThreshold} during the event. Upload the form signed by a parent or guardian: PDF, JPG or PNG, up to 10 MB.</p>
              <label className={`reg-dropzone${consent ? ' is-filled' : ''}`}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} aria-labelledby="consent-label" aria-describedby="consent-hint"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadConsent(consentMember.id, file); e.target.value = '' }} />
                {consent
                  ? <><Check size={22} strokeWidth={2.6} aria-hidden="true" /><span><strong>{consent.originalFilename}</strong>Uploaded. Choose another file to replace it.</span></>
                  : <><Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : 'Choose a file'}</strong><span className="reg-drag-hint">or drag it here</span></span></>}
              </label>
            </div>
          )}
          <div className="reg-editor-actions">
            <button type="submit" className="reg-btn reg-btn-secondary" disabled={busy}>{busy ? 'Saving…' : `Save ${section.records.noun}`}</button>
            {currentRecord.id === NEW_PERSON && <button type="button" className="reg-btn-link" onClick={cancelNewPerson}>Cancel</button>}
            {draftTrip && currentRecord.id === `new-${draftTrip}` && <button type="button" className="reg-btn-link" onClick={cancelNewTrip}>Cancel</button>}
            {activeId === 'people' && currentRecord.id !== NEW_PERSON && !fixedRecord(currentRecord.id) && (
              <button type="button" className="reg-btn-link reg-btn-remove" onClick={() => remove('person', currentRecord.id, currentRecord.label)}>Remove this person</button>
            )}
            {activeId === 'travel' && !currentRecord.id.startsWith('new-') && (
              <button type="button" className="reg-btn-link reg-btn-remove" onClick={() => remove('trip', currentRecord.id, currentRecord.label)}>Remove this trip</button>
            )}
            {dirty.record ? <UnsavedNote show /> : <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>}
          </div>
        </form>
      )}
    </div>
  )

  return <>
    <PageHead eyebrow={eyebrow} title={country ? d.countryTerritory : d.nationalRepresentativeName || (kind === 'jury' ? 'Jury registration' : 'Volunteer registration')} session={session}
      intro={`${d.nationalRepresentativeName || d.teamLeaderEmail} · ${kindNoun[kind]}${country && d.representativeIsTeamLeader ? ' and Team Leader' : ''}${staff ? ` · ${d.teamLeaderEmail}` : ''}`}
      aside={
        <div className="reg-head-progress">
          <p><strong>{submitted ? 'Submitted' : `${stepsDone} of ${numbered.length}`}</strong>{submitted ? ' · people and travel can still change' : ' steps done'}</p>
          <div className="reg-meter" role="progressbar" aria-label="Registration progress" aria-valuemin={0} aria-valuemax={numbered.length} aria-valuenow={stepsDone}>
            <span style={{ transform: `scaleX(${stepsDone / numbered.length})` }} />
          </div>
          {activeId !== 'submit' && firstOpenStep && firstOpenStep.id !== activeId && (
            <button type="button" className="reg-btn reg-btn-quiet" onClick={() => open(firstOpenStep.id)}>
              Next: {firstOpenStep.title} <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {activeId !== 'submit' && ready && (
            <button type="button" className="reg-btn reg-btn-quiet" onClick={() => open('submit')}>
              Next: submit your registration <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      }>
      <ul className="reg-ws-summary" aria-label="Delegation summary">
        {country && <li>{d.numberOfTeams} {d.numberOfTeams === 1 ? 'team' : 'teams'} · {d.numberOfTeams * 4} contestants</li>}
        {kind !== 'volunteer' && <li>{d.numberOfObservers} {d.numberOfObservers === 1 ? 'observer' : 'observers'}</li>}
        <li>{submitted ? 'Registration submitted' : owesFor(data) ? paymentLabel[payment?.status ?? 'none'] : 'Nothing to pay'}</li>
      </ul>
    </PageHead>
    <div className="reg-shell wrap reg-workspace">
      {staff && (
        <div className="reg-staff-bar">
          <button type="button" className="reg-btn-link" onClick={() => guard(staff.onBack)}><ArrowLeft size={16} aria-hidden="true" />Back to the back office</button>
          <p><Info size={16} aria-hidden="true" />You are working on this registration as {staff.roleLabel}. Changes are saved straight away and recorded under your name.</p>
        </div>
      )}
      <div className="reg-ws-body">
        <nav className={`reg-rail${navOpen ? ' is-open' : ''}`} aria-label="Registration steps">
          <button type="button" className="reg-rail-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
            <span>{section.afterSubmission ? 'After you submit' : section.id === 'start' ? 'Start here' : `Step ${stepNumber(section)} of ${numbered.length}`}</span>
            <strong>{section.title}</strong>
          </button>
          <ol>
            {main.map((s) => {
              const st = statusOf(s)
              return (
                <li key={s.id}>
                  <button type="button" className={`reg-rail-item is-${st}${s.id === activeId ? ' is-current' : ''}`} aria-current={s.id === activeId ? 'step' : undefined} onClick={() => open(s.id)}>
                    <StatusMark status={st} number={stepNumber(s)} />
                    <span className="reg-rail-text"><span>{s.title}</span><small>{stepLabel(s, st)}</small>{!submitted && st !== 'done' && deadlineOf(s.id) && <small className="reg-rail-deadline">{deadlineOf(s.id)}</small>}</span>
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="reg-rail-group" id="after-group">After you submit</p>
          <ul aria-labelledby="after-group">
            {after.map((s) => {
              const st = statusOf(s)
              return (
                <li key={s.id}>
                  <button type="button" className={`reg-rail-item is-${st}${s.id === activeId ? ' is-current' : ''}`} aria-current={s.id === activeId ? 'step' : undefined} onClick={() => open(s.id)}>
                    <span className="reg-mark is-after" aria-hidden="true"><Clock size={13} /></span>
                    <span className="reg-rail-text"><span>{s.title}</span><small>{submitted ? 'Available' : statusLabel[st]}</small></span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Each step is a heading, then its parts on cards of their own, then the step's own button. */}
        <section className="reg-step" ref={panelRef} aria-labelledby="reg-panel-title" aria-busy={busy} key={activeId} onChange={trackChange}>
          <header className="reg-panel-head">
            <p className="reg-step-kicker">{section.afterSubmission ? 'After you submit' : section.id === 'start' ? 'Start here' : `Step ${stepNumber(section)} of ${numbered.length}`}</p>
            <h2 id="reg-panel-title" ref={titleRef} tabIndex={-1}>{section.title}</h2>
            <p>{section.intro}</p>
            {deadlineOf(section.id) && <p className="reg-step-deadline"><Clock size={15} aria-hidden="true" />{deadlineOf(section.id)}</p>}
          </header>

          {infoNote && (
            <p className={`reg-aside reg-step-note ${infoNote.tone === 'ok' ? 'reg-aside-ok' : 'reg-aside-warn'}`} role="status">
              {infoNote.tone === 'ok' ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}{infoNote.text}
            </p>
          )}

          {locked && (
            <Card id="step-locked" title="Opens after the proof of payment"
              intro={`${section.id === 'welfare' ? 'Rooms and welfare is built from People, which opens' : 'People opens'} as soon as you upload the bank’s proof of transfer in Payment, so no registration is completed before its fees are settled.`}>
              <button type="button" className="reg-btn reg-btn-primary" onClick={() => open('payment')}>Go to Payment <ArrowRight size={18} aria-hidden="true" /></button>
            </Card>
          )}

          {activeId === 'start' && <>
            {country ? (
              <Card id="start-steps" title="How registration works" intro="Seven steps, the last of them submitting. Everything you save is kept, so you can stop at any point and come back later, on any device.">
                <p className="reg-hint reg-card-lead">As national representative you are the organisers’ one contact for your whole delegation, even with two teams, so please pass on to your teams and observers what you read here.</p>
                <ol className="reg-journey">
                  <li><strong>Team and observers.</strong> How many teams, each team’s Team Leader, whether each team brings an observer, and who would like a single room. This sets your fees.</li>
                  <li><strong>Payment.</strong> Your invoice details, the bank transfer, then the bank’s proof of transfer. Early bird rate until {longDate(ev.earlyBirdEnds)}.</li>
                  <li><strong>Teams.</strong> Each team’s contest language, which can change until {longDate(ev.languageLock)}.</li>
                  <li><strong>People.</strong> Opens after payment. Fill it in stages, by {longDate(ev.peopleDeadline)}.</li>
                  <li><strong>Rooms and welfare.</strong> Check the summary built from your people, and add any requests.</li>
                  <li><strong>Travel.</strong> Each person’s flights once they are booked, by {longDate(ev.travelDeadline)}.</li>
                  <li><strong>Submit.</strong> Shows where every step stands. Once the six above are done, you read the dress code and travel insurance notices and submit here.</li>
                </ol>
                <p className="reg-hint reg-card-foot">Do steps 1 to 6 in whatever order suits you, except that People and Rooms and welfare open after payment. You can still update people and travel after you submit, until the dates above.</p>
              </Card>
            ) : (
              <Card id="start-steps" title="How registration works" intro="A few steps, the last of them submitting. Everything you save is kept, so you can stop at any point and come back later.">
                <ol className="reg-journey">
                  <li><strong>About you.</strong> Your name, whether you need a hotel room{kind === 'jury' ? ', and whether you bring an observer' : ''}.</li>
                  {owesFor(data) && <li><strong>Payment.</strong> Only for {kind === 'jury' ? 'an observer or ' : ''}a single room: the invoice, the bank transfer, then the proof.</li>}
                  <li><strong>Your details.</strong> Passport and personal details, and your photo, by {longDate(ev.peopleDeadline)}.</li>
                  <li><strong>Rooms and welfare.</strong> Check the summary, and add any requests.</li>
                  <li><strong>Travel.</strong> Your flights once they are booked, by {longDate(ev.travelDeadline)}.</li>
                  <li><strong>Submit.</strong> Read the dress code and travel insurance notices, then submit.</li>
                </ol>
              </Card>
            )}
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              {steps.has('start')
                ? <button type="button" className="reg-btn reg-btn-primary" onClick={() => go(firstOpenStep?.id ?? 'submit')}>Continue to {firstOpenStep?.title ?? 'Submit'} <ArrowRight size={18} aria-hidden="true" /></button>
                : <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={() => run(() => finishStep('start'))}>{country ? 'Start with team and observers' : 'Start with About you'} <ArrowRight size={18} aria-hidden="true" /></button>}
            </div>
          </>}

          {activeId === 'submit' && overview}

          {activeId === 'setup' && (country
            ? <TeamSetup key={`${d.numberOfTeams}-${d.numberOfObservers}`} data={data} locked={proofIn} busy={busy} error={sectionError} dirty={Boolean(dirty.setup)} onTouched={() => markDirty('setup')} onSave={saveSetup} onContinue={() => go(nextOf('setup'))} />
            : <SelfSetup key={`${d.numberOfObservers}-${d.needsAccommodation}`} data={data} locked={proofIn} busy={busy} error={sectionError} dirty={Boolean(dirty.setup)} onTouched={() => markDirty('setup')} onSave={saveSetup} onContinue={() => go(nextOf('setup'))} />)}

          {activeId === 'welfare' && !locked && (
            <form onSubmit={saveWelfare} noValidate data-dirty-key="welfare">
              <div className="reg-cards">
                <Card id="welfare-summary" title="Summary from People" intro="Built from everyone’s records. To change something, edit that person in People.">
                  <Facts items={welfareFacts(data)} />
                </Card>
                <Card id="welfare-requests" title="Requests">
                  <p className="reg-card-lead">We are committed to ensuring that all participants, including trans and non-binary contestants, feel safe, comfortable, and welcome in their accommodation arrangements. Therefore, if any of the participants has specific justifiable accommodation requests or access requirements, please outline them below. This may include, but is not limited to: requests to share a room with a specific contestant from the same country/territory whom they know well, requests to avoid sharing a room with contestants from another country/territory whom they do not know, preferences regarding sharing a room with contestants of their gender assigned at birth, requests for a single room or any alternative accommodation arrangements that would support their wellbeing.</p>
                  <div className="reg-grid">
                    <FieldControl idPrefix="welfare" field={{ label: welfareNoteLabel, value: d.welfareNote ?? '', kind: 'textarea', optional: true, help: 'Seen only by the organising team, and handled privately.' }} />
                  </div>
                  <p className="reg-hint reg-card-foot">The organisers will make every reasonable effort to accommodate requests, but cannot guarantee particular arrangements.</p>
                </Card>
              </div>
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'This is correct, continue'} <ArrowRight size={18} aria-hidden="true" /></button>
                <UnsavedNote show={Boolean(dirty.welfare)} />
              </div>
            </form>
          )}

          {activeId === 'payment' && (
            <form ref={invoiceRef} onSubmit={savePayment} noValidate data-dirty-key="invoice">
              <div className="reg-cards">
                {payProgress && (
                  <Card id="pay-status" title={payProgress.title} intro={payProgress.intro}>
                    <ol className="reg-progress">
                      {payProgress.stages.map((stage) => (
                        <li key={stage.key} className={`is-${stage.state}`}>
                          <span className="reg-progress-mark" aria-hidden="true">
                            {stage.state === 'done' ? <Check size={14} strokeWidth={3} /> : stage.state === 'problem' ? <CircleAlert size={15} strokeWidth={2.6} /> : null}
                          </span>
                          <div>
                            <strong>{stage.title}<span className="reg-visually-hidden">: {progressWords[stage.state]}</span></strong>
                            <p>{stage.detail}</p>
                            {stage.action}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}

                <Card id="pay-amount" title="Amount to transfer" status={<Chip tone="later">{data.fees.tierLabel} rate</Chip>}>
                  <FeeTable lines={data.fees.lines} total={data.fees.total} pending={data.fees.observersPending} />
                  <dl className="reg-ref">
                    <div><dt>Due date</dt><dd>{new Date(`${data.fees.dueDate}T12:00:00+07:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
                    {payment?.invoiceNumber && <div><dt>Invoice number</dt><dd>{payment.invoiceNumber}</dd></div>}
                    <div><dt>Payment reference</dt><dd>{payment ? <>
                      <span className="reg-code">{payment.paymentReference}</span>
                      {copyButton('payment reference', payment.paymentReference)}
                    </> : <span className="reg-muted">Given when you save the invoice details</span>}</dd></div>
                  </dl>
                  <span className="reg-visually-hidden" role="status">{copied ? `${copied} copied` : ''}</span>
                  {(!payment || payment.status === 'awaiting_proof') && data.fees.tier === 'early_bird' && (
                    <p className="reg-hint reg-card-foot">The fee depends on the day your proof of payment is uploaded: upload it by {new Date(`${data.fees.dueDate}T12:00:00+07:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to keep the early bird rate. After that, the invoice moves to the regular rate.</p>
                  )}
                </Card>

                <Card id="pay-invoice" number={1} done={Boolean(payment) && !dirty.invoice} title="Invoice details" intro="Who the invoice is made out to. Invoices cannot be split after you transfer."
                  status={dirty.invoice ? <Chip tone="attention">Unsaved changes</Chip> : payment ? <Chip tone="ok">Saved</Chip> : <Chip tone="later">Not saved yet</Chip>}>
                  {proofIn && <p className="reg-hint reg-card-lead"><Lock size={14} aria-hidden="true" /> Locked, because your proof of payment is uploaded. To change the invoice details, email the organisers.</p>}
                  <InvoiceDetails key={payment?.id ?? 'new'} data={data} payment={payment} disabled={proofIn} errors={fieldErrors} onTouched={() => markDirty('invoice')} />
                  {!proofIn && (
                    <div className="reg-card-actions">
                      <button type="button" className="reg-btn reg-btn-secondary" disabled={busy} onClick={() => run(async () => { if (await saveInvoice()) setSavedNote('Invoice details saved.') })}>{busy ? 'Saving…' : 'Save invoice details'}</button>
                      {dirty.invoice ? <UnsavedNote show /> : <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>}
                    </div>
                  )}
                </Card>

                <Card id="pay-download" number={2} done={Boolean(payment)} title={invoiceFiles.length > 1 ? 'Download your invoices' : 'Download your invoice'}
                  intro={invoiceFiles.length > 1 ? 'One PDF for each payer, to send to them.' : 'For your records, or for whoever pays.'}
                  status={payment ? undefined : <Chip tone="later">After part 1</Chip>}>
                  {payment ? <>
                    <ul className="reg-files">
                      {invoiceFiles.map((file) => (
                        <li key={file.number}>
                          <FileText size={20} aria-hidden="true" />
                          <span><strong>Invoice {file.number}</strong>{file.payer} · {usd(file.amount)}</span>
                          <a className="reg-btn reg-btn-secondary reg-btn-small" href={file.href} target="_blank" rel="noreferrer"><Download size={16} aria-hidden="true" />PDF<span className="reg-visually-hidden">, invoice {file.number}</span></a>
                        </li>
                      ))}
                    </ul>
                    {dirty.invoice && <p className="reg-hint reg-card-lead">These show the saved details. Save your changes in part 1 to update them.</p>}
                  </> : <p className="reg-muted reg-card-empty">Save the invoice details first.</p>}
                </Card>

                <Card id="pay-transfer" number={3} done={paymentDone} title="Transfer the full amount" intro={`Make sure ${usd(data.fees.total)} arrives in this account by the due date.`}>
                  {data.bank
                    ? <dl className="reg-ref reg-bank">
                      <div><dt>Beneficiary</dt><dd>{data.bank.beneficiaryName}{data.bank.beneficiaryAddress && <small>{data.bank.beneficiaryAddress}</small>}</dd></div>
                      <div><dt>Bank</dt><dd>{data.bank.bankName}{data.bank.bankAddress && <small>{data.bank.bankAddress}</small>}</dd></div>
                      <div><dt>Account number</dt><dd><span className="reg-inline"><span className="reg-code">{data.bank.accountNumber}</span>{copyButton('account number', data.bank.accountNumber)}</span></dd></div>
                      <div><dt>SWIFT code</dt><dd><span className="reg-inline"><span className="reg-code">{data.bank.swiftCode}</span>{copyButton('SWIFT code', data.bank.swiftCode)}</span></dd></div>
                      <div><dt>Payment reference</dt><dd>{payment
                        ? <><span className="reg-inline"><span className="reg-code">{payment.paymentReference}</span>{copyButton('payment reference ', payment.paymentReference)}</span><small>Put it in the transfer description, so Finance can match your payment.</small></>
                        : <span className="reg-muted">Given when you save part 1</span>}</dd></div>
                    </dl>
                    : <p className="reg-aside"><Info size={18} aria-hidden="true" />The account name, number and SWIFT code appear here, and on the invoice, once Finance confirms them.</p>}
                  <h4 className="reg-card-subhead">Charges and exchange rates</h4>
                  <ul className="reg-rules">
                    <li><strong>Bank transfer only.</strong> There is no card or online payment.</li>
                    <li><strong>All bank charges are paid by you.</strong> Your bank’s transfer fee, any intermediary (correspondent) bank fees and the receiving bank’s fee for an incoming transfer. Choose <strong>OUR</strong> as the charge option, so none of them is taken from the amount.</li>
                    <li><strong>Currency conversion is paid by you.</strong> If your account is in another currency, the exchange rate and conversion fees are yours. Send enough for the full amount to arrive in US dollars.</li>
                    <li><strong>The full amount must arrive.</strong> Partial payments are not accepted. If less arrives, Finance will ask you to send the difference before confirming your payment.</li>
                  </ul>
                </Card>

                <Card id="pay-proof" number={4} done={paymentDone} title="Upload the proof of transfer"
                  intro="People opens as soon as it is uploaded. Team and observers and the invoice details then lock, because they set the amount you pay." status={proofChip}>
                  {proofFiles.length > 0 && (
                    <ul className="reg-files reg-proof-files" aria-label="Your proof of transfer">
                      {proofFiles.map((file) => (
                        <li key={file.id}>
                          <FileText size={20} aria-hidden="true" />
                          <span><strong>{file.originalFilename}</strong>Uploaded {dayOf(file.createdAt)}{payment?.status === 'approved' ? ' · confirmed by Finance' : ''}</span>
                          {canRemoveProof && (
                            <button type="button" className="reg-btn-link reg-btn-remove" disabled={busy} onClick={() => removeProofFile(file.id)}>
                              Remove<span className="reg-visually-hidden"> {file.originalFilename}</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canUpload && (
                    <div className={`reg-field reg-field-wide${fieldErrors.proof ? ' has-error' : ''}`}>
                      <span className="reg-label-text" id="proof-label">{proofFiles.length ? 'Add more files' : 'Proof of transfer'}</span>
                      <p className="reg-hint" id="proof-hint">{payment?.status === 'rejected'
                        ? 'Finance returned your proof (the reason is at the top of this page). Add the missing or corrected files; adding a file sends the proof to Finance again. '
                        : proofFiles.length ? 'A file missing, such as the confirmation of a second transfer? Add it here. ' : 'The bank’s confirmation or a screenshot of the completed transfer. '}
                        You can choose several files at once, one for each transfer for example: PDF, JPG, PNG, WEBP or HEIC, up to 10 MB each.</p>
                      {fieldErrors.proof && <p className="reg-error" id="proof-error"><CircleAlert size={16} aria-hidden="true" />{fieldErrors.proof}</p>}
                      <label className={`reg-dropzone${fieldErrors.proof ? ' has-error' : ''}`}>
                        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={busy}
                          aria-labelledby="proof-label" aria-describedby={`proof-hint${fieldErrors.proof ? ' proof-error' : ''}`}
                          onChange={(e) => { const files = [...(e.target.files ?? [])]; if (files.length) uploadProof(files); e.target.value = '' }} />
                        <Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : proofFiles.length ? 'Choose more files' : 'Choose files'}</strong><span className="reg-drag-hint">or drag them here</span></span>
                      </label>
                    </div>
                  )}
                  {!payment && <p className="reg-muted reg-card-empty">Save the invoice details first, then upload the proof after you transfer.</p>}
                  {!payProgress && <p className="reg-hint reg-card-foot">After you upload it, Finance checks it against the bank statement, usually within 5 business days. We email you once the payment is confirmed, and your e-receipt appears on this page.</p>}
                </Card>
              </div>

              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{!paymentDone && (!payment || dirty.invoice) ? 'Save and continue' : 'Continue'} <ArrowRight size={18} aria-hidden="true" /></button>
                {!paymentDone && payment && <span className="reg-muted reg-actions-note">You can upload the proof later, after you transfer.</span>}
              </div>
            </form>
          )}

          {activeId === 'travel' && (
            <Card id="travel-info" title="Hotel nights and airport transfers">
              <dl className="reg-ref reg-travel-info">
                <div><dt>Hotel nights</dt><dd>{d.needsAccommodation === false
                  ? 'You said you do not need a hotel room, so none is booked for you.'
                  : <>We provide accommodation from the night of {longDate(ev.hotelFirstNight)} to the night of {longDate(ev.hotelLastNight)}, checking out on the morning after. If you arrive earlier or leave later, please book and pay for those nights yourself: they are outside the official programme and not the organisers’ responsibility.</>}</dd></div>
                <div><dt>Airport pickup and drop-off</dt><dd>We will provide pickup and drop-off at Suvarnabhumi (BKK) and Don Mueang (DMK) airports only. {ev.pickup} Outside these times, or from anywhere else, please make your own way to and from the hotel.</dd></div>
                <div><dt>Arriving late</dt><dd>The opening ceremony is on the morning of 22 July. If you arrive after 21 July, you may miss it.</dd></div>
                <div><dt>Deadline</dt><dd>{ev.travelLocked ? `Travel details closed on ${longDate(ev.travelDeadline)}. To change a flight now, email the organisers.` : `Add and change flights until ${longDate(ev.travelDeadline)}, so the transport team can plan pickups and buses.`}</dd></div>
              </dl>
            </Card>
          )}

          {recordsCard}

          {section.records && !locked && (
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={finishRecords}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          )}

          {activeId === 'badges' && (
            <Card id="badges-about" title="Your QR badges" intro="Emailed to you as PDFs, one for each person, so you can check every name. The organisers print the badges for you.">
              <Facts items={section.facts ?? []} />
            </Card>
          )}
        </section>
      </div>
    </div>

    {/* The safe answer is the filled button on the right, where people click without reading, and has the focus;
        Escape gives it too. Leaving or removing is plain red text on the left. */}
    <dialog ref={askRef} className="reg-dialog" aria-labelledby="ask-title" aria-describedby="ask-text" onClose={() => setAsk(null)}>
      <h2 id="ask-title">{ask?.title}</h2>
      <p id="ask-text">{ask?.text}</p>
      <div className="reg-dialog-actions">
        <button type="button" className="reg-btn reg-btn-danger" onClick={answer}>{ask?.go}</button>
        <button type="button" className="reg-btn reg-btn-primary" ref={stayRef} onClick={() => askRef.current?.close()}>{ask?.stay}</button>
      </div>
    </dialog>
  </>
}
