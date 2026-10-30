// The Team Leader's registration workspace: an overview of the whole track for anyone coming back, then a step
// rail on the left and one step at a time on the right.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock, Copy, Download, FileText, Info, LayoutGrid, Lock, Plus, Upload, UserPlus } from 'lucide-react'
import { api, ApiError, type DelegationData, type Member } from './api'
import { personFieldGroups, programmeWindow, sections, type Field, type PortalRecord, type Section, type SectionId } from './portalData'
import { consentFor, personFields, personGaps, personPayload, personRecord, teamRecord, tripPayload, tripRecord, welfareFacts } from './live'
import { FeeTable, InvoiceDetails, TeamSetup, UnsavedNote, invoiceProblems, readInvoices, usd, type SetupBody } from './SetupForms'
import { openReceipt } from './invoice'
import { Alert, Card, Chip, Facts, FieldControl, PageHead, daysBetween, focusFirstError, formatDate, messageOf, unsavedWork } from './ui'

type StepStatus = 'done' | 'todo' | 'locked' | 'info' | 'waiting' | 'after'
const statusLabel: Record<StepStatus, string> = {
  done: 'Done', todo: 'To do', locked: 'Opens after payment', info: 'Read first', waiting: 'After the steps above', after: 'After you submit',
}
const paymentLabel: Record<string, string> = {
  none: 'Payment: invoice details not saved yet', awaiting_proof: 'Payment: waiting for proof', awaiting_review: 'Payment: waiting for Finance',
  approved: 'Payment approved', rejected: 'Payment: proof returned', refunded: 'Payment refunded',
}

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
// Room requests go to the welfare team as free text, as the IOL Host's Handbook (6.2.2) asks registration to allow.
const welfareNoteLabel = 'Room requests and anything else the welfare team should know'
const main = sections.filter((s) => !s.afterSubmission)
// "Before you begin" is an introduction, not a step: the numbered steps run from Team and observers to Review and submit.
const numbered = main.filter((s) => s.id !== 'start')
const after = sections.filter((s) => s.afterSubmission)
const required = sections.filter((s) => s.required)

type StaffView = { roleLabel: string; onBack: () => void }

/**
 * One delegation's registration, step by step. Team Leaders see their own; registration admins open
 * any country's from the back office (staff), and every change is recorded under their name.
 */
export default function Workspace({ delegationId, onSessionEnd, staff, session }: { delegationId: string; onSessionEnd: () => void; staff?: StaffView; session?: ReactNode }) {
  const [data, setData] = useState<DelegationData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [activeId, setActiveId] = useState<SectionId>('start')
  // The overview: where someone coming back lands, and the first item in the step rail.
  const [home, setHome] = useState(false)
  const [selected, setSelected] = useState<Partial<Record<SectionId, string>>>({})
  const [draftOpen, setDraftOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [sectionError, setSectionError] = useState<ReactNode>(null)
  const [savedNote, setSavedNote] = useState('')
  const [busy, setBusy] = useState(false)
  // Said at the top of the step just opened: a step saved (ok), or one left unfinished (warn).
  const [infoNote, setInfoNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [stay, setStay] = useState({ arrival: '', departure: '' })
  const [stayNote, setStayNote] = useState('')
  const [stayState, setStayState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [navOpen, setNavOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const [draftTrip, setDraftTrip] = useState<'arrival' | 'departure' | null>(null)
  // Forms with changes that are not saved yet, by their data-dirty-key: setup, invoice, welfare, record (the person,
  // team or trip being edited) and stay-note. Leaving one of them asks first, and so does closing the tab.
  const [dirty, setDirty] = useState<Record<string, true>>({})
  // A question before something that cannot be taken back: leaving unsaved changes, removing a person or a trip.
  const [ask, setAsk] = useState<{ title: string; text: ReactNode; stay: string; go: string; onGo: () => void } | null>(null)
  const askRef = useRef<HTMLDialogElement>(null)
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
  useEffect(() => { if (ask && !askRef.current?.open) askRef.current?.showModal() }, [ask])
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
      setStay({ arrival: d.delegation.declaredArrivalDate ?? '', departure: d.delegation.declaredDepartureDate ?? '' })
      setStayNote(d.delegation.stayWindowNote ?? '')
      const steps = new Set(d.delegation.completedSteps)
      const paid = d.payments[0] && ['awaiting_review', 'approved'].includes(d.payments[0].status)
      if (navigated.current) return
      // Links in emails open a given step, e.g. the portal address with ?step=travel.
      const requested = new URLSearchParams(window.location.search).get('step')
      if (requested && sections.some((s) => s.id === requested)) { navigated.current = true; setActiveId(requested as SectionId); return }
      if (d.delegation.registrationStatus !== 'draft') setActiveId('review')
      else if (steps.has('start')) setActiveId(required.find((s) => (s.id === 'payment' ? !paid : !steps.has(s.id)))?.id ?? 'review')
      // A first visit starts with "Before you begin"; anyone who has been here before sees the overview.
      if (steps.has('start') || d.delegation.registrationStatus !== 'draft') setHome(true)
    }).catch((e) => { if (!current) return; if (e instanceof ApiError && e.status === 401) onSessionEnd(); else setLoadError(messageOf(e)) })
    return () => { current = false }
  }, [load, onSessionEnd])

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    titleRef.current?.focus({ preventScroll: true })
    const top = panelRef.current?.getBoundingClientRect().top ?? 0
    if (top < 100 || top > window.innerHeight * 0.6) panelRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [activeId, recordOpen, home])

  const derived = useMemo(() => {
    if (!data) return null
    const d = data.delegation
    const steps = new Set(d.completedSteps)
    const payment = data.payments[0]
    const paymentDone = Boolean(payment && ['awaiting_review', 'approved'].includes(payment.status))
    const submitted = d.registrationStatus !== 'draft'
    const draftMember = { role: 'contestant' as const, teamId: data.teams[0]?.id ?? null }
    // The account's own Team Leader comes first; with two teams, one more person may lead the second team.
    const leaders = data.members.filter((m) => m.role === 'team_leader')
    const canLead = d.numberOfTeams === 2 && leaders.length < 2
    const records: Partial<Record<SectionId, PortalRecord[]>> = {
      teams: data.teams.map((t) => teamRecord(t, data)),
      people: [
        ...data.members.map((m) => personRecord(m, data.teams, data.attachments, { primary: m.id === leaders[0]?.id, canLead })),
        ...(draftOpen ? [{ id: NEW_PERSON, label: 'New person', meta: 'Not saved yet', status: 'attention' as const, issue: 'Not saved yet', fields: personFields(draftMember, data.teams, { canLead }) }] : []),
      ],
      // Every arrival and departure saved, by date, with an empty one to fill when there is none yet or one is being added.
      travel: (['arrival', 'departure'] as const).flatMap((dir) => {
        const trips = data.travelRecords.filter((t) => t.direction === dir).sort((a, b) => `${a.localDate}${a.localTime}`.localeCompare(`${b.localDate}${b.localTime}`))
        const adding = !trips.length || draftTrip === dir
        const several = trips.length + (adding && trips.length ? 1 : 0) > 1
        return [...trips.map((t, i) => tripRecord(dir, t, data.members, several ? i + 1 : undefined)), ...(adding ? [tripRecord(dir, undefined, data.members, several ? trips.length + 1 : undefined)] : [])]
      }),
    }
    return { d, steps, payment, paymentDone, submitted, records }
  }, [data, draftOpen, draftTrip])

  const eyebrow = staff ? `Back office · ${staff.roleLabel}` : 'Team Leader portal'
  if (loadError || !data || !derived) {
    return <>
      <PageHead eyebrow={eyebrow} title={staff ? 'Registration' : 'Your registration'} session={session} />
      <div className="reg-shell wrap">
        {loadError ? <div className="reg-panel"><Alert>{loadError}</Alert></div> : <p className="reg-loading" role="status">{staff ? 'Loading the registration…' : 'Loading your registration…'}</p>}
      </div>
    </>
  }

  const { d, steps, payment, paymentDone, submitted, records } = derived
  const isDone = (id: SectionId) => (id === 'payment' ? paymentDone : id === 'review' ? submitted : steps.has(id))
  const doneCount = required.filter((s) => isDone(s.id)).length
  const allRequiredDone = doneCount === required.length
  const statusOf = (s: Section): StepStatus => {
    // People, and Rooms and welfare (built from People), open once the proof of payment is uploaded.
    if ((s.id === 'people' || s.id === 'welfare') && !paymentDone) return 'locked'
    if (isDone(s.id)) return 'done'
    if (s.id === 'start') return 'info'
    if (s.id === 'review') return allRequiredDone ? 'todo' : 'waiting'
    if (s.afterSubmission) return submitted ? 'todo' : 'after'
    return 'todo'
  }
  const section = sections.find((s) => s.id === activeId)!
  const status = statusOf(section)
  const locked = status === 'locked'
  const firstOpenStep = main.find((s) => s.required && !isDone(s.id) && statusOf(s) !== 'locked') ?? main.find((s) => s.id === 'review')
  const stepNumber = (s: Section) => numbered.indexOf(s) + 1
  const stepsDone = numbered.filter((s) => isDone(s.id)).length
  const nextOf = (id: SectionId) => main[main.findIndex((s) => s.id === id) + 1]?.id

  /* unsaved changes ------------------------------------------------ */
  const trackChange = (event: ChangeEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target instanceof HTMLInputElement && target.type === 'file') return
    const key = target.closest<HTMLElement>('[data-dirty-key]')?.dataset.dirtyKey
    if (key) setDirty((now) => (now[key] ? now : { ...now, [key]: true }))
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
    setHome(false); setActiveId(id); setNavOpen(false); setRecordOpen(false)
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
    const next = nextOf(id)
    if (next) go(next)
    const finished = sections.find((s) => s.id === id)
    if (finished?.required) setInfoNote({ tone: 'ok', text: `“${finished.title}” is saved.` })
  }
  /** Moves on from a step that is not finished; it stays on the to-do list, and the next step says so. */
  const moveOn = (text: string) => {
    const next = nextOf(activeId)
    if (next) { go(next); setInfoNote({ tone: 'warn', text }) }
  }

  /* records ------------------------------------------------------- */
  const sectionRecords = records[activeId] ?? []
  const currentRecord = sectionRecords.find((r) => r.id === selected[activeId]) ?? sectionRecords[0]
  // Opening another record (or a new person) replaces the editor, so unsaved changes in it are asked about first.
  const chooseRecord = (id: string) => guard(() => {
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
        setSavedNote(body.travelPoint && body.flightServiceNumber && body.localDate && body.localTime ? 'Saved.' : 'Saved. Finish this trip once flights are booked.')
      } else if (activeId === 'people') {
        const member = data.members.find((m) => m.id === currentRecord.id)
        const role = member?.role ?? 'contestant'
        const payload = personPayload(form, role, data.teams)
        if (!payload.displayName) { setFieldErrors({ 'Display name': 'Enter a name so we can save this person.' }); focusFirstError(panelRef.current); return }
        let id = currentRecord.id
        if (currentRecord.id === NEW_PERSON) {
          id = (await api<{ member: Member }>(`/api/registration/delegations/${d.id}/members`, { method: 'POST', body: payload })).member.id
          setDraftOpen(false)
          setSelected((s) => ({ ...s, people: id }))
        } else {
          await api(`/api/registration/members/${id}`, { method: 'PATCH', body: payload })
        }
        const fresh = await load()
        const saved = fresh.members.find((m) => m.id === id)
        const missing = saved ? personGaps(saved, fresh.attachments) : []
        setFieldErrors({})
        clean('record')
        setSavedNote(missing.length ? `Saved. Still needed before you submit: ${missing.map((label) => label.toLowerCase()).join(', ')}.` : 'Saved.')
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
    setDraftTrip(direction)
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
    if (activeId === 'travel') {
      if (!stay.arrival || !stay.departure || stayProblem) {
        setSectionError('Add your arrival and departure dates first. Flights can wait.')
        document.getElementById('stay-arrival')?.focus()
        return
      }
      run(() => finishStep('travel', { declaredArrivalDate: stay.arrival, declaredDepartureDate: stay.departure, stayWindowNote: outsideWindow > 0 ? stayNote || null : null }))
      return
    }
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
  const uploadProof = (file: File) => run(async () => {
    const form = new FormData()
    form.append('proof', file)
    await api(`/api/registration/delegations/${d.id}/payment-proof`, { method: 'POST', form })
    await load()
    setFieldErrors({})
    setSavedNote('Proof uploaded.')
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
    if (paymentDone) { go('teams'); return }
    run(async () => {
      if ((!payment || dirty.invoice) && !(await saveInvoice())) return
      moveOn('Payment stays on your list until you upload the bank’s proof of transfer. Come back to it after you transfer.')
    })
  }

  const saveWelfare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get(welfareNoteLabel) ?? '').trim()
    run(() => finishStep('welfare', { welfareNote: note || null }))
  }

  /* travel stay dates --------------------------------------------- */
  const nights = stay.arrival && stay.departure ? daysBetween(stay.arrival, stay.departure) : null
  const stayProblem = nights !== null && nights < 0 ? 'Departure must be on or after the arrival date.' : null
  const outsideWindow = stay.arrival && stay.departure && !stayProblem
    ? Math.max(0, daysBetween(stay.arrival, programmeWindow.first)) + Math.max(0, daysBetween(programmeWindow.last, stay.departure))
    : 0
  // Stay dates, and the note about extra nights when it is left, save on their own; the card says when they have.
  const saveStay = (body: Record<string, unknown>) => {
    setStayState('saving')
    patchDelegation(body).then(load).then(() => setStayState('saved')).catch((e) => { setStayState('idle'); setSectionError(messageOf(e)) })
  }
  const changeStay = (next: { arrival: string; departure: string }) => {
    setStay(next); setSectionError(null)
    const bad = next.arrival && next.departure && next.departure < next.arrival
    if (!bad) saveStay({ declaredArrivalDate: next.arrival || null, declaredDepartureDate: next.departure || null })
  }
  const saveStayNote = () => {
    if (!dirty['stay-note']) return
    clean('stay-note')
    saveStay({ stayWindowNote: stayNote.trim() || null })
  }

  /** A Copy button for something typed into online banking: the payment reference, account number, SWIFT code. */
  const copyButton = (what: string, text: string) => (
    <button type="button" className="reg-copy" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied((c) => (c === what ? '' : c)), 1800) } catch { /* clipboard blocked: the text stays visible to copy by hand */ }
    }}><Copy size={14} aria-hidden="true" />{copied === what ? 'Copied' : 'Copy'}<span className="reg-visually-hidden"> {what}</span></button>
  )

  /* still to do before submitting, by step -------------------------- */
  const todo: { step: SectionId; items: string[] }[] = []
  const needs = (step: SectionId, item?: string) => {
    const group = todo.find((t) => t.step === step) ?? (todo.push({ step, items: [] }), todo[todo.length - 1])
    if (item) group.items.push(item)
  }
  required.forEach((s) => { if (!isDone(s.id)) needs(s.id, s.id === 'payment' ? 'Upload the bank’s proof of transfer' : undefined) })
  if (!d.declaredArrivalDate || !d.declaredDepartureDate) needs('travel', 'Add your stay dates')
  for (const id of ['teams', 'people'] as const) {
    (records[id] ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).forEach((r) => needs(id, `${r.label}: ${r.issue?.toLowerCase()}`))
  }
  // People must match what the fees were worked out from.
  const namedObservers = data.members.filter((m) => m.role === 'observer').length
  if (namedObservers !== d.numberOfObservers) needs(namedObservers > d.numberOfObservers ? 'setup' : 'people', `Observers: ${d.numberOfObservers} in Team and observers, ${namedObservers} in People`)
  const stillToDoText: Partial<Record<SectionId, string>> = { setup: 'Save this step', welfare: 'Check the summary and confirm it', teams: 'Not finished yet', people: 'Not finished yet', travel: 'Not finished yet' }
  todo.forEach((t) => { if (!t.items.length) t.items.push(stillToDoText[t.step] ?? 'Not finished yet') })
  todo.sort((a, b) => main.findIndex((s) => s.id === a.step) - main.findIndex((s) => s.id === b.step))
  const outstanding = todo
  const submit = () => {
    if (outstanding.length) { setSectionError('Finish the items listed above before submitting.'); return }
    run(async () => { await api(`/api/registration/delegations/${d.id}/submit`, { method: 'POST' }); await load() })
  }

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

  const proofAttachment = payment?.proofAttachmentId ? data.attachments.find((a) => a.id === payment.proofAttachmentId) : undefined
  // A proof can be replaced until Finance has approved it (a wrong file, or a better scan).
  const canUpload = Boolean(payment && ['awaiting_proof', 'rejected', 'awaiting_review'].includes(payment.status))
  const receipt = payment?.status === 'approved' && payment.receiptNumber ? payment : undefined
  // One PDF per invoice: a split has one for each payer, numbered IOL2027/23-1, -2 and so on.
  const invoiceFiles = !payment ? [] : payment.invoiceSplits?.length
    ? payment.invoiceSplits.map((s, i) => ({ href: `/api/registration/delegations/${d.id}/invoice?part=${i + 1}`, number: `${payment.invoiceNumber}-${i + 1}`, payer: s.recipientName, amount: Number(s.amount) }))
    : [{ href: `/api/registration/delegations/${d.id}/invoice`, number: payment.invoiceNumber ?? '', payer: payment.invoiceRecipientName ?? d.countryTerritory, amount: Number(payment.amountDue) }]
  const proofChip = payment?.status === 'approved' ? <Chip tone="ok">Approved</Chip>
    : payment?.status === 'awaiting_review' ? <Chip tone="later">With Finance</Chip>
    : payment?.status === 'rejected' ? <Chip tone="attention">Returned</Chip>
    : <Chip tone="later">Not uploaded yet</Chip>
  const singleRoomsChosen = [...d.singleRooms.teamLeaders, ...d.singleRooms.observers].filter(Boolean).length
  const unsavedNames: Record<string, string> = {
    setup: 'Team and observers', invoice: 'the invoice details', welfare: 'the note for the welfare team', 'stay-note': 'the note about extra nights',
    record: currentRecord?.id === NEW_PERSON ? 'the new person' : currentRecord?.label ?? 'this record',
  }
  const consentMember = activeId === 'people' ? data.members.find((m) => m.id === currentRecord?.id && m.needsGuardianConsent) : undefined
  const consent = consentMember ? consentFor(consentMember, data.attachments) : undefined

  /* overview --------------------------------------------------------- */
  const paymentStatus = payment?.status
  const peopleCount = data.members.filter((m) => m.role !== 'team_leader').length
  const peopleToFinish = (records.people ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).length
  const flightsIn = data.travelRecords.filter((t) => t.flightServiceNumber && t.localDate).length
  const trackDetail: Record<SectionId, string> = {
    start: '',
    setup: steps.has('setup')
      ? `${d.numberOfTeams} ${d.numberOfTeams === 1 ? 'team' : 'teams'}, ${d.numberOfObservers} ${d.numberOfObservers === 1 ? 'observer' : 'observers'}, ${singleRoomsChosen || 'no'} single ${singleRoomsChosen === 1 ? 'room' : 'rooms'}.`
      : 'How many teams and observers, and who would like a single room. This sets your fees.',
    payment: paymentStatus === 'approved' ? 'Approved by Finance. The e-receipt is in this step.'
      : paymentStatus === 'awaiting_review' ? 'Proof uploaded. Finance is matching it against the bank statement.'
      : paymentStatus === 'rejected' ? 'Finance returned the proof. Upload a new one.'
      : payment ? 'Invoice details saved. Transfer, then upload the bank’s proof.' : 'Invoice details, the bank transfer, then the proof of transfer.',
    teams: steps.has('teams') ? data.teams.map((t) => `${t.name}: ${t.contestLanguage ?? 'no language yet'}`).join(' · ') : 'Choose each team’s contest language.',
    people: !paymentDone ? 'Opens once the proof of payment is uploaded.'
      : `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} entered${peopleToFinish ? `, ${peopleToFinish} still to finish` : ''}.`,
    welfare: !paymentDone ? 'Opens with People, once the proof of payment is uploaded.' : steps.has('welfare') ? 'Summary checked.' : 'Check the summary built from everyone’s details, and add any room requests.',
    travel: d.declaredArrivalDate && d.declaredDepartureDate
      ? `Staying ${formatDate(d.declaredArrivalDate)} to ${formatDate(d.declaredDepartureDate)}. ${flightsIn} of 2 flights added.`
      : 'Stay dates now; flights once they are booked.',
    review: submitted ? `Submitted${d.submittedAt ? ` on ${new Date(d.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}.` : allRequiredDone ? 'Everything is in. Ready to submit.' : 'Opens once the steps above are done.',
    badges: '',
  }
  type TrackState = StepStatus | 'next'
  type TrackStep = { key: string; title: string; detail: string; state: TrackState; label: string; to?: SectionId }
  const trackOf = (s: Section): TrackStep => {
    const st = statusOf(s)
    const state: TrackState = !submitted && st !== 'done' && st !== 'locked' && s.id === firstOpenStep?.id ? 'next' : st === 'info' ? 'todo' : st
    return { key: s.id, title: s.title, detail: trackDetail[s.id], state, label: state === 'next' ? 'Next' : statusLabel[st], to: s.id }
  }
  const phases: { title: string; steps: TrackStep[] }[] = [
    { title: 'Your account', steps: [
      { key: 'code', title: 'Invitation code', detail: `Linked this account to ${d.countryTerritory}.`, state: 'done', label: 'Done' },
      { key: 'account', title: 'Team Leader account', detail: `${d.teamLeaderEmail}, email checked.`, state: 'done', label: 'Done' },
    ] },
    { title: 'Registration', steps: numbered.map(trackOf) },
    { title: 'Before the Olympiad', steps: [
      { key: 'letters', title: 'Invitation letters', detail: paymentStatus === 'approved' ? 'Your payment is confirmed, so letters for visa applications follow by email.' : 'One for each person, sent once the payment is confirmed.', state: 'after', label: 'Later' },
      { key: 'badges', title: 'QR badges', detail: 'Emailed to you as PDFs once the payment is confirmed and everyone’s arrival and departure are in.', state: 'after', label: 'Later', to: 'badges' },
      { key: 'arrival', title: 'Arrival in Bangkok', detail: 'From 21 July 2027. Badges are scanned at the arrival desk.', state: 'after', label: 'Later' },
    ] },
  ]

  const nextStep: { tone: 'go' | 'warn' | 'done'; kicker: string; title: string; body: ReactNode; to: SectionId; cta: string } =
    submitted ? { tone: 'done', kicker: 'Registration submitted', title: 'Submitted. Thank you.', to: 'review', cta: 'See your registration',
      body: 'Finance checks the payment next. People and travel can still be updated until the change deadline.' }
    : paymentStatus === 'rejected' ? { tone: 'warn', kicker: 'Action needed', title: 'Upload a new proof of payment', to: 'payment', cta: 'Go to Payment',
      body: <>Finance could not match your proof of transfer.{payment?.reviewNote ? <> Their note: “{payment.reviewNote}”</> : null}</> }
    : allRequiredDone ? { tone: 'go', kicker: 'Ready', title: 'Everything is in. Submit your registration.', to: 'review', cta: 'Review and submit',
      body: 'Check it once more, then submit. You can still update people and travel afterwards.' }
    : { tone: 'go', kicker: doneCount ? 'Pick up where you left off' : 'Where to start', title: `Next: ${firstOpenStep?.title ?? 'Review'}`, to: firstOpenStep?.id ?? 'review', cta: `Continue to ${firstOpenStep?.title ?? 'Review'}`,
      body: <>{firstOpenStep ? trackDetail[firstOpenStep.id] : ''}{paymentStatus === 'awaiting_review' && <> Finance is checking your proof of payment; carry on meanwhile.</>}</> }

  // Registration steps keep the numbers the step rail gives them.
  const trackMark = (step: TrackStep) => step.state === 'done' ? <Check size={15} strokeWidth={3} />
    : step.state === 'locked' ? <Lock size={14} strokeWidth={2.4} />
    : step.state === 'after' ? <Clock size={14} /> : stepNumber(sections.find((s) => s.id === step.to)!)

  const overview = (
    <section className="reg-home" aria-labelledby="reg-home-title">
      <div className={`reg-home-next is-${nextStep.tone}`}>
        <div>
          <p className="reg-home-kicker">{nextStep.kicker}</p>
          <h2 id="reg-home-title" ref={titleRef} tabIndex={-1}>{nextStep.title}</h2>
          <p>{nextStep.body}</p>
        </div>
        <button type="button" className="reg-btn reg-btn-primary" onClick={() => open(nextStep.to)}>{nextStep.cta} <ArrowRight size={18} aria-hidden="true" /></button>
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
                    </div>
                  </li>
                ))}
              </ol>
            </div>
        ))}
      </div>

      <div className="reg-home-foot">
        <dl>
          <div><dt>Early bird rate</dt><dd>Invoice details saved by 12 March 2027</dd></div>
          <div><dt>Registration closes</dt><dd>30 April 2027</dd></div>
          <div><dt>The Olympiad</dt><dd>21–28 July 2027, Bangkok</dd></div>
        </dl>
        <p>Questions about your registration? <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a></p>
      </div>
    </section>
  )

  const goHome = () => guard(() => { setHome(true); setNavOpen(false); setRecordOpen(false); setSectionError(null); setSavedNote(''); setInfoNote(null) })
  const answer = () => {
    const question = ask
    askRef.current?.close()
    question?.onGo()
  }
  const primaryLeader = data.members.find((m) => m.role === 'team_leader')
  // Who is not on any arrival or departure yet: their badges wait for it.
  const offTrips = (direction: 'arrival' | 'departure') => data.members
    .filter((m) => !data.travelRecords.some((t) => t.direction === direction && t.memberIds.includes(m.id)))
    .map((m) => m.badgeName || m.displayName)

  const recordsCard = section.records && !locked && (
    <div className={`reg-card reg-records${recordOpen ? ' is-open' : ''}`}>
      <div className="reg-record-list">
        <div className="reg-record-list-head">
          <h3>{activeId === 'travel' ? 'Flights' : `${sectionRecords.filter((r) => r.id !== NEW_PERSON).length} ${section.records.plural}`}</h3>
          {activeId === 'people' && !draftOpen && <button type="button" className="reg-btn-link" onClick={addPerson}><UserPlus size={16} aria-hidden="true" />Add person</button>}
        </div>
        {activeId === 'travel' && <p className="reg-hint">Add these once flights are booked. If people travel on different flights, add a trip for each.</p>}
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
            {(['arrival', 'departure'] as const).filter((dir) => data.travelRecords.some((t) => t.direction === dir)).map((dir) => (
              <button key={dir} type="button" className="reg-btn-link" onClick={() => addTrip(dir)}><Plus size={16} aria-hidden="true" />Add another {dir}</button>
            ))}
          </div>
        )}
        {activeId === 'travel' && data.travelRecords.length > 0 && data.members.length > 0 && (['arrival', 'departure'] as const).map((dir) => {
          const left = offTrips(dir)
          return left.length ? <p key={dir} className="reg-hint reg-off-trip">Not on {dir === 'arrival' ? 'an arrival' : 'a departure'} yet: {left.join(', ')}.</p> : null
        })}
      </div>

      {currentRecord && (
        <form className="reg-record-editor" onSubmit={saveRecord} noValidate key={currentRecord.id} data-dirty-key="record">
          <button type="button" className="reg-btn-link reg-back-to-list" onClick={() => guard(() => { setRecordOpen(false); clean('record') }, ['record'])}><ArrowLeft size={16} aria-hidden="true" />All {section.records.plural}</button>
          <div className="reg-editor-head">
            <h3>{currentRecord.label}</h3>
            {recordChip(currentRecord)}
          </div>
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
            {activeId === 'people' && currentRecord.id !== NEW_PERSON && currentRecord.id !== primaryLeader?.id && (
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
    <PageHead eyebrow={eyebrow} title={d.countryTerritory} session={session}
      intro={`${d.primaryTeamLeaderName} · Team Leader${staff ? ` · ${d.teamLeaderEmail}` : ''}`}
      aside={
        <div className="reg-head-progress">
          <p><strong>{submitted ? 'Submitted' : `${stepsDone} of ${numbered.length}`}</strong>{submitted ? ' · people and travel can still change' : ' steps done'}</p>
          <div className="reg-meter" role="progressbar" aria-label="Registration progress" aria-valuemin={0} aria-valuemax={numbered.length} aria-valuenow={stepsDone}>
            <span style={{ transform: `scaleX(${stepsDone / numbered.length})` }} />
          </div>
          {!home && !submitted && firstOpenStep && firstOpenStep.id !== activeId && (
            <button type="button" className="reg-btn reg-btn-quiet" onClick={() => open(firstOpenStep.id)}>
              Next: {firstOpenStep.title} <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      }>
      <ul className="reg-ws-summary" aria-label="Delegation summary">
        <li>{d.numberOfTeams} {d.numberOfTeams === 1 ? 'team' : 'teams'} · up to {d.numberOfTeams * 4} contestants</li>
        <li>{d.numberOfObservers} {d.numberOfObservers === 1 ? 'observer' : 'observers'}</li>
        <li>{submitted ? 'Registration submitted' : paymentLabel[payment?.status ?? 'none']}</li>
      </ul>
    </PageHead>
    <div className="reg-shell wrap reg-workspace">
      {staff && (
        <div className="reg-staff-bar">
          <button type="button" className="reg-btn-link" onClick={() => guard(staff.onBack)}><ArrowLeft size={16} aria-hidden="true" />Back to the back office</button>
          <p><Info size={16} aria-hidden="true" />You are working on this registration as {staff.roleLabel}. Changes are saved straight away and recorded under your name.</p>
        </div>
      )}
      {home && overview}

      {!home && <div className="reg-ws-body">
        <nav className={`reg-rail${navOpen ? ' is-open' : ''}`} aria-label="Registration steps">
          <button type="button" className="reg-rail-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
            <span>{section.afterSubmission ? 'After you submit' : section.id === 'start' ? 'Start here' : `Step ${stepNumber(section)} of ${numbered.length}`}</span>
            <strong>{section.title}</strong>
          </button>
          <button type="button" className="reg-rail-item reg-rail-home" onClick={goHome}>
            <span className="reg-mark is-home" aria-hidden="true"><LayoutGrid size={14} /></span>
            <span className="reg-rail-text"><span>Overview</span><small>Where everything stands</small></span>
          </button>
          <ol>
            {main.map((s) => {
              const st = statusOf(s)
              return (
                <li key={s.id}>
                  <button type="button" className={`reg-rail-item is-${st}${s.id === activeId ? ' is-current' : ''}`} aria-current={s.id === activeId ? 'step' : undefined} onClick={() => open(s.id)}>
                    <StatusMark status={st} number={stepNumber(s)} />
                    <span className="reg-rail-text"><span>{s.title}</span><small>{statusLabel[st]}</small></span>
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
            <Card id="start-steps" title="How registration works" intro="Seven steps. Everything you save is kept, so you can stop at any point and come back later, on any device.">
              <p className="reg-hint reg-card-lead">As Team Leader you are the organisers’ contact for your whole delegation, so please pass on to your team and observers what you read here.</p>
              <ol className="reg-journey">
                <li><strong>Team and observers.</strong> How many are coming, and who would like a single room. This sets your fees.</li>
                <li><strong>Payment.</strong> Your invoice details, the bank transfer, then the bank’s proof of transfer.</li>
                <li><strong>Teams.</strong> Each team’s contest language.</li>
                <li><strong>People.</strong> Opens after payment. Fill it in stages if you need to.</li>
                <li><strong>Rooms and welfare.</strong> Check the summary built from your people, and add any requests.</li>
                <li><strong>Travel.</strong> Stay dates now; flights once they are booked.</li>
                <li><strong>Review and submit.</strong> You can still update people and travel afterwards.</li>
              </ol>
            </Card>
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              {steps.has('start')
                ? <button type="button" className="reg-btn reg-btn-primary" onClick={() => go(firstOpenStep?.id ?? 'review')}>Continue to {firstOpenStep?.title ?? 'Review and submit'} <ArrowRight size={18} aria-hidden="true" /></button>
                : <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={() => run(() => finishStep('start'))}>Start with team and observers <ArrowRight size={18} aria-hidden="true" /></button>}
            </div>
          </>}

          {activeId === 'setup' && <TeamSetup key={`${d.numberOfTeams}-${d.numberOfObservers}`} data={data} paymentDone={paymentDone} busy={busy} error={sectionError} dirty={Boolean(dirty.setup)} onSave={saveSetup} />}

          {activeId === 'welfare' && !locked && (
            <form onSubmit={saveWelfare} noValidate data-dirty-key="welfare">
              <div className="reg-cards">
                <Card id="welfare-summary" title="Summary from People" intro="Built from everyone’s records. To change something, edit that person in People.">
                  <Facts items={welfareFacts(data)} />
                </Card>
                <Card id="welfare-requests" title="Requests" intro="For example: a contestant who should share with a particular teammate, or would rather not share with someone they do not know, needs a room of their own, or has access needs. Seen only by the organising team.">
                  <div className="reg-grid">
                    <FieldControl idPrefix="welfare" field={{ label: welfareNoteLabel, value: d.welfareNote ?? '', kind: 'textarea', optional: true }} />
                  </div>
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
                  {!payment && data.fees.tier === 'early_bird' && (
                    <p className="reg-hint reg-card-foot">The rate is fixed when you save the invoice details: save them by {new Date(`${data.fees.dueDate}T12:00:00+07:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to keep the early bird rate.</p>
                  )}
                </Card>

                <Card id="pay-invoice" number={1} done={Boolean(payment) && !dirty.invoice} title="Invoice details" intro="Who the invoice is made out to. Invoices cannot be split after you transfer."
                  status={dirty.invoice ? <Chip tone="attention">Unsaved changes</Chip> : payment ? <Chip tone="ok">Saved</Chip> : <Chip tone="later">Not saved yet</Chip>}>
                  {paymentDone && <p className="reg-hint reg-card-lead">Locked while Finance checks your payment. To change them, email the organisers.</p>}
                  <InvoiceDetails key={payment?.id ?? 'new'} data={data} payment={payment} disabled={paymentDone} errors={fieldErrors} />
                  {!paymentDone && (
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

                <Card id="pay-proof" number={4} done={paymentDone} title="Upload the proof of transfer" intro="People opens straight after." status={proofChip}>
                  {payment?.status === 'rejected' && (
                    <p className="reg-aside reg-aside-warn reg-card-lead"><CircleAlert size={18} aria-hidden="true" /><span><strong>Finance could not match your proof.</strong> {payment.reviewNote} Please upload a new one.</span></p>
                  )}
                  <div className={`reg-field reg-field-wide${fieldErrors.proof ? ' has-error' : ''}`}>
                    <span className="reg-label-text" id="proof-label">Proof of transfer</span>
                    <p className="reg-hint" id="proof-hint">{canUpload || paymentDone
                      ? `The bank’s confirmation or a screenshot of the completed transfer. PDF, JPG or PNG, up to 10 MB.${invoiceFiles.length > 1 ? ' Paid in separate transfers? Put every confirmation in one PDF.' : ''}`
                      : 'Save the invoice details first, then upload the proof after you transfer.'}</p>
                    {fieldErrors.proof && <p className="reg-error" id="proof-error"><CircleAlert size={16} aria-hidden="true" />{fieldErrors.proof}</p>}
                    <label className={`reg-dropzone${paymentDone ? ' is-filled' : ''}${fieldErrors.proof ? ' has-error' : ''}${!canUpload && !paymentDone ? ' is-disabled' : ''}`}>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={!canUpload || busy} aria-labelledby="proof-label" aria-describedby={`proof-hint${fieldErrors.proof ? ' proof-error' : ''}`}
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadProof(file); e.target.value = '' }} />
                      {paymentDone
                        ? <><Check size={22} strokeWidth={2.6} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : proofAttachment?.originalFilename ?? 'Proof uploaded'}</strong>{payment?.status === 'approved' ? 'Approved by Finance.' : 'Uploaded. Wrong file? Choose another to replace it until Finance has checked it.'}</span></>
                        : <><Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : 'Choose a file'}</strong>{canUpload ? <span className="reg-drag-hint">or drag it here</span> : 'Available once the invoice details are saved'}</span></>}
                    </label>
                  </div>
                  {receipt
                    ? <p className="reg-aside reg-aside-ok"><Check size={18} strokeWidth={3} aria-hidden="true" />
                      <span>Payment approved. <button type="button" className="reg-inline-btn" onClick={() => openReceipt({
                        organisation: receipt.invoiceRecipientName ?? d.countryTerritory, country: d.countryTerritory, recipientAddress: receipt.invoiceRecipientAddress,
                        reference: receipt.paymentReference, receiptNumber: receipt.receiptNumber!, amountPaid: Number(receipt.amountDue), currency: receipt.currency,
                        tierLabel: receipt.feeTier === 'early_bird' ? 'Early bird' : 'Normal', approvedAt: receipt.reviewedAt,
                      })}><Download size={14} aria-hidden="true" />Download the e-receipt</button></span>
                    </p>
                    : <p className="reg-hint reg-card-foot">Finance checks each proof against the bank statement. Once they approve it, your e-receipt will appear here.</p>}
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
            <Card id="travel-stay" title="Stay dates" intro={`The programme runs from ${formatDate(programmeWindow.first)} to ${formatDate(programmeWindow.last)} 2027. These set the hotel nights we reserve.`}
              status={stayState === 'saving' ? <Chip tone="later">Saving…</Chip> : stayState === 'saved' ? <Chip tone="ok">Saved</Chip> : <Chip tone="later">Saved as you choose</Chip>}>
              <div className="reg-grid">
                <div className="reg-field">
                  <label htmlFor="stay-arrival">Arrival date</label>
                  <p className="reg-hint" id="stay-arrival-hint">Your first night at the official hotel.</p>
                  <input id="stay-arrival" type="date" className="reg-control" value={stay.arrival} onChange={(e) => changeStay({ ...stay, arrival: e.target.value })} aria-describedby="stay-arrival-hint" />
                </div>
                <div className={`reg-field${stayProblem ? ' has-error' : ''}`}>
                  <label htmlFor="stay-departure">Departure date</label>
                  <p className="reg-hint" id="stay-departure-hint">The day you leave the hotel.</p>
                  {stayProblem && <p className="reg-error" id="stay-departure-error"><CircleAlert size={16} aria-hidden="true" />{stayProblem}</p>}
                  <input id="stay-departure" type="date" className="reg-control" value={stay.departure} min={stay.arrival || undefined} onChange={(e) => changeStay({ ...stay, departure: e.target.value })} aria-describedby={`stay-departure-hint${stayProblem ? ' stay-departure-error' : ''}`} aria-invalid={stayProblem ? true : undefined} />
                </div>
              </div>
              <p className="reg-nights" role="status">
                {nights !== null && !stayProblem && <><strong>{nights} {nights === 1 ? 'night' : 'nights'}</strong> at the official hotel{outsideWindow > 0 ? `, ${outsideWindow} outside the programme dates.` : '.'}</>}
              </p>
              {outsideWindow > 0 && (
                <div className="reg-field reg-field-wide reg-stay-why" data-dirty-key="stay-note">
                  <label htmlFor="stay-why">Why you need the extra nights <span className="reg-optional">(optional)</span></label>
                  <p className="reg-hint" id="stay-why-hint">So the organisers can check hotel availability and any extra cost. Saved when you leave the box.</p>
                  <textarea id="stay-why" className="reg-control" rows={3} value={stayNote} onChange={(e) => setStayNote(e.target.value)} onBlur={saveStayNote} aria-describedby="stay-why-hint" />
                </div>
              )}
            </Card>
          )}

          {recordsCard}

          {section.records && !locked && (
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={finishRecords}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          )}

          {activeId === 'review' && <>
            {submitted ? (
              <Card id="review-done" title="Registration submitted" status={<Chip tone="ok">Submitted</Chip>}
                intro={<>A confirmation has been sent to {d.teamLeaderEmail}. Finance will check your payment next. You can still update people and travel until the change deadline.</>} />
            ) : outstanding.length > 0 ? (
              <Card id="review-left" title="Still to do" intro="By step. Each step’s name opens it." status={<Chip tone="attention">{outstanding.length} {outstanding.length === 1 ? 'step' : 'steps'}</Chip>}>
                <ul className="reg-todo">
                  {outstanding.map((group) => (
                    <li key={group.step}>
                      <button type="button" className="reg-inline-btn" onClick={() => open(group.step)}>{sections.find((s) => s.id === group.step)!.title}</button>
                      <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card id="review-ready" title="Ready to submit" intro="Every step is done. Submit when you have checked it once more." status={<Chip tone="ok">Ready</Chip>} />
            )}
            <Card id="review-status" title="Where things stand">
              <Facts items={[
                { label: 'Registration', value: submitted ? `Submitted${d.submittedAt ? ` on ${new Date(d.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}` : 'Draft, not submitted yet' },
                { label: 'Payment', value: paymentLabel[payment?.status ?? 'none'].replace(/^Payment: (.)/, (_, c: string) => c.toUpperCase()) },
                { label: 'Changes after submitting', value: 'People and travel can still change', help: 'Until a deadline the organisers will announce.' },
                { label: 'Travel', value: d.declaredArrivalDate && d.declaredDepartureDate ? 'Stay dates added; flights can follow' : 'Stay dates still needed' },
              ]} />
            </Card>
            <Card id="review-after" title="After you submit">
              <Facts items={section.facts ?? []} />
            </Card>
            {!submitted && (
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="button" className="reg-btn reg-btn-primary" disabled={busy || outstanding.length > 0} aria-describedby={outstanding.length ? 'review-left-title' : undefined} onClick={submit}>{busy ? 'Submitting…' : 'Submit registration'}</button>
                {outstanding.length > 0 && <span className="reg-muted reg-actions-note">Finish the items under “Still to do” first.</span>}
              </div>
            )}
          </>}

          {activeId === 'badges' && (
            <Card id="badges-about" title="Your QR badges" intro="Emailed to you as PDFs, one for each person, so you can check every name. The organisers print the badges for you.">
              <Facts items={section.facts ?? []} />
            </Card>
          )}
        </section>
      </div>}
    </div>

    {/* The safe answer comes first and has the focus; Escape gives it too. */}
    <dialog ref={askRef} className="reg-dialog" aria-labelledby="ask-title" aria-describedby="ask-text" onClose={() => setAsk(null)}>
      <h2 id="ask-title">{ask?.title}</h2>
      <p id="ask-text">{ask?.text}</p>
      <div className="reg-dialog-actions">
        <button type="button" className="reg-btn reg-btn-primary" autoFocus onClick={() => askRef.current?.close()}>{ask?.stay}</button>
        <button type="button" className="reg-btn reg-btn-secondary" onClick={answer}>{ask?.go}</button>
      </div>
    </dialog>
  </>
}
