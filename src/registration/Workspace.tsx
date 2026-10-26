// The Team Leader's registration workspace: an overview of the whole track for anyone coming back, then a step
// rail on the left and one step at a time on the right.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock, Copy, Download, Info, LayoutGrid, Lock, Upload, UserPlus } from 'lucide-react'
import { api, ApiError, type DelegationData, type Member } from './api'
import { personFieldGroups, programmeWindow, sections, type Field, type PortalRecord, type Section, type SectionId } from './portalData'
import { consentFor, personFields, personGaps, personPayload, personRecord, teamRecord, tripPayload, tripRecord, welfareFacts } from './live'
import { openInvoice, openReceipt } from './invoice'
import { Alert, Facts, FieldControl, PageHead, daysBetween, focusFirstError, formatDate, messageOf } from './ui'

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
  return <span className={`reg-mark is-${status}`} aria-hidden="true">{number}</span>
}

function recordChip(record: PortalRecord) {
  if (record.status === 'complete') return <span className="reg-chip is-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Complete</span>
  if (record.status === 'later') return <span className="reg-chip is-later"><Clock size={13} aria-hidden="true" />{record.issue ?? 'Later'}</span>
  return <span className="reg-chip is-attention"><CircleAlert size={13} aria-hidden="true" />{record.issue ?? 'Needs attention'}</span>
}

const NEW_PERSON = 'new-person'
const main = sections.filter((s) => !s.afterSubmission)
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
  const [infoNote, setInfoNote] = useState('')
  const [stay, setStay] = useState({ arrival: '', departure: '' })
  const [stayNote, setStayNote] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const invoiceRef = useRef<HTMLFormElement>(null)
  const firstRender = useRef(true)

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
    const records: Partial<Record<SectionId, PortalRecord[]>> = {
      teams: data.teams.map((t) => teamRecord(t, data)),
      people: [
        ...data.members.map((m) => personRecord(m, data.teams, data.attachments)),
        ...(draftOpen ? [{ id: NEW_PERSON, label: 'New person', meta: 'Not saved yet', status: 'attention' as const, issue: 'Not saved yet', fields: personFields(draftMember, data.teams) }] : []),
      ],
      travel: (['arrival', 'departure'] as const).map((dir) => tripRecord(dir, data.travelRecords.find((t) => t.direction === dir), data.members)),
    }
    return { d, steps, payment, paymentDone, submitted, records }
  }, [data, draftOpen])

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
    if (s.id === 'people' && !paymentDone) return 'locked'
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
  const stepNumber = (s: Section) => main.indexOf(s) + 1
  const nextOf = (id: SectionId) => main[main.findIndex((s) => s.id === id) + 1]?.id

  const open = (id: SectionId) => {
    navigated.current = true
    setHome(false); setActiveId(id); setNavOpen(false); setRecordOpen(false)
    setFieldErrors({}); setSectionError(null); setSavedNote('')
  }

  /** Runs a server action, reloads, and turns failures into a visible message. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setSectionError(null); setInfoNote('')
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
    const next = nextOf(id)
    if (next) open(next)
    if (sections.find((s) => s.id === id)?.required) {
      setInfoNote('Section saved. Please email your team leader to distribute any information from this section.')
    }
  }

  /* records ------------------------------------------------------- */
  const sectionRecords = records[activeId] ?? []
  const currentRecord = sectionRecords.find((r) => r.id === selected[activeId]) ?? sectionRecords[0]
  const chooseRecord = (id: string) => {
    setSelected((s) => ({ ...s, [activeId]: id }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote('')
  }

  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentRecord) return
    const form = new FormData(event.currentTarget)
    run(async () => {
      if (activeId === 'teams') {
        await api(`/api/registration/teams/${currentRecord.id}`, { method: 'PATCH', body: { name: String(form.get('Team name') ?? '').trim() || currentRecord.label, contestLanguage: String(form.get('Team contest language') ?? '') || null } })
        await load()
        setSavedNote('Saved.')
      } else if (activeId === 'travel') {
        const direction = currentRecord.id.endsWith('arrival') || currentRecord.label === 'Arrival' ? 'arrival' : 'departure'
        const body = tripPayload(form, direction, data.members)
        if (currentRecord.id.startsWith('new-')) await api(`/api/registration/delegations/${d.id}/travel`, { method: 'POST', body })
        else await api(`/api/registration/travel/${currentRecord.id}`, { method: 'PATCH', body })
        const fresh = await load()
        const saved = fresh.travelRecords.find((t) => t.direction === direction)
        if (saved) setSelected((s) => ({ ...s, travel: saved.id }))
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
        setSavedNote(missing.length ? `Saved. Still needed before you submit: ${missing.map((label) => label.toLowerCase()).join(', ')}.` : 'Saved.')
      }
    })
  }

  const addPerson = () => {
    setDraftOpen(true)
    setSelected((s) => ({ ...s, people: NEW_PERSON }))
    setRecordOpen(true); setFieldErrors({}); setSavedNote('')
  }

  const finishRecords = () => {
    if (activeId === 'travel') {
      if (!stay.arrival || !stay.departure || stayProblem) {
        setSectionError('Add your arrival and departure dates first. Flights can wait.')
        document.getElementById('stay-arrival')?.focus()
        return
      }
      run(() => finishStep('travel', { declaredArrivalDate: stay.arrival, declaredDepartureDate: stay.departure, stayWindowNote: outsideWindow > 0 ? stayNote || null : null }))
      return
    }
    const pending = sectionRecords.filter((r) => r.status === 'attention')
    if (pending.length) {
      setSectionError(<>Finish {pending.length === 1 ? 'this' : `these ${pending.length}`} first: {pending.map((r, i) => (
        <span key={r.id}>{i > 0 && ', '}<button type="button" className="reg-inline-btn" onClick={() => chooseRecord(r.id)}>{r.label}</button> ({r.issue?.toLowerCase()})</span>
      ))}.</>)
      return
    }
    run(() => finishStep(activeId))
  }

  /* setup, payment, welfare --------------------------------------- */
  const saveSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const teams = Number(form.get('Number of teams'))
    const observers = Number(form.get('Number of observers'))
    const roomType = String(form.get('Room type preference') ?? '') || null
    const errors: Record<string, string> = {}
    if (![1, 2].includes(teams)) errors['Number of teams'] = 'Choose one or two teams.'
    if (!Number.isInteger(observers) || observers < 0 || observers > 20) errors['Number of observers'] = 'Enter a whole number from 0 to 20.'
    setFieldErrors(errors)
    if (Object.keys(errors).length) { focusFirstError(panelRef.current); return }
    run(() => finishStep('setup', { numberOfTeams: teams, numberOfObservers: observers, contestantRoomType: roomType }))
  }

  const invoiceBody = () => {
    const form = new FormData(invoiceRef.current!)
    return {
      recipientName: String(form.get('Invoice recipient name') ?? '').trim(),
      recipientAddress: String(form.get('Invoice recipient address') ?? '').trim(),
      invoiceCount: Number(form.get('Number of invoices') || 1),
      splitNote: String(form.get('How to split the invoices') ?? '').trim(),
    }
  }
  const saveInvoice = async () => {
    const body = invoiceBody()
    if (!body.recipientName) { setFieldErrors({ 'Invoice recipient name': 'Enter the organisation named on the invoice.' }); focusFirstError(panelRef.current); return false }
    if (!Number.isInteger(body.invoiceCount) || body.invoiceCount < 1 || body.invoiceCount > 10) { setFieldErrors({ 'Number of invoices': 'Enter a number from 1 to 10.' }); focusFirstError(panelRef.current); return false }
    setFieldErrors({})
    await api(`/api/registration/delegations/${d.id}/invoice`, { method: 'PUT', body })
    await load()
    return true
  }
  const uploadProof = (file: File) => run(async () => {
    const form = new FormData()
    form.append('proof', file)
    await api(`/api/registration/delegations/${d.id}/payment-proof`, { method: 'POST', form })
    await load()
    setFieldErrors({})
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
    if (paymentDone) { open('teams'); return }
    run(async () => {
      if (!(await saveInvoice())) return
      setFieldErrors({ proof: 'Upload the bank’s proof of transfer to finish this step. Your invoice details are saved.' })
      focusFirstError(panelRef.current)
    })
  }

  const saveWelfare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get('Anything else the welfare team should know') ?? '').trim()
    run(() => finishStep('welfare', { welfareNote: note || null }))
  }

  /* travel stay dates --------------------------------------------- */
  const nights = stay.arrival && stay.departure ? daysBetween(stay.arrival, stay.departure) : null
  const stayProblem = nights !== null && nights < 0 ? 'Departure must be on or after the arrival date.' : null
  const outsideWindow = stay.arrival && stay.departure && !stayProblem
    ? Math.max(0, daysBetween(stay.arrival, programmeWindow.first)) + Math.max(0, daysBetween(programmeWindow.last, stay.departure))
    : 0
  const changeStay = (next: { arrival: string; departure: string }) => {
    setStay(next); setSectionError(null)
    const bad = next.arrival && next.departure && next.departure < next.arrival
    if (!bad) patchDelegation({ declaredArrivalDate: next.arrival || null, declaredDepartureDate: next.departure || null }).then(load).catch((e) => setSectionError(messageOf(e)))
  }

  const copyReference = async () => {
    if (!payment) return
    try { await navigator.clipboard.writeText(payment.paymentReference); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked: the reference stays visible to copy by hand */ }
  }

  /* outstanding items for review ---------------------------------- */
  const outstanding: { text: string; to: SectionId }[] = []
  required.forEach((s) => { if (!isDone(s.id)) outstanding.push({ text: s.id === 'payment' ? 'Upload proof of payment' : `Finish “${s.title}”`, to: s.id }) })
  if (!d.declaredArrivalDate || !d.declaredDepartureDate) outstanding.push({ text: 'Add your stay dates', to: 'travel' })
  for (const id of ['teams', 'people'] as const) {
    (records[id] ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).forEach((r) => outstanding.push({ text: `${r.label}: ${r.issue?.toLowerCase()}`, to: id }))
  }
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
  const canUpload = Boolean(payment && ['awaiting_proof', 'rejected'].includes(payment.status))
  const money = (n: number) => `${data.fees.currency} ${n.toLocaleString('en-US')}`
  const receipt = payment?.status === 'approved' && payment.receiptNumber ? payment : undefined
  const consentMember = activeId === 'people' ? data.members.find((m) => m.id === currentRecord?.id && m.needsGuardianConsent) : undefined
  const consent = consentMember ? consentFor(consentMember, data.attachments) : undefined

  /* overview --------------------------------------------------------- */
  const paymentStatus = payment?.status
  const peopleCount = data.members.filter((m) => m.role !== 'team_leader').length
  const peopleToFinish = (records.people ?? []).filter((r) => r.status === 'attention' && r.id !== NEW_PERSON).length
  const flightsIn = data.travelRecords.filter((t) => t.flightServiceNumber && t.localDate).length
  const trackDetail: Record<SectionId, string> = {
    start: '',
    setup: steps.has('setup') ? `${d.numberOfTeams} ${d.numberOfTeams === 1 ? 'team' : 'teams'}, ${d.numberOfObservers} ${d.numberOfObservers === 1 ? 'observer' : 'observers'}.` : 'How many teams and observers. These two numbers set your fees.',
    payment: paymentStatus === 'approved' ? 'Approved by Finance. The e-receipt is in this step.'
      : paymentStatus === 'awaiting_review' ? 'Proof uploaded. Finance is matching it against the bank statement.'
      : paymentStatus === 'rejected' ? 'Finance returned the proof. Upload a new one.'
      : payment ? 'Invoice details saved. Transfer, then upload the bank’s proof.' : 'Invoice details, the bank transfer, then the proof of transfer.',
    teams: steps.has('teams') ? data.teams.map((t) => `${t.name}: ${t.contestLanguage ?? 'no language yet'}`).join(' · ') : 'Choose each team’s contest language.',
    people: !paymentDone ? 'Opens once the proof of payment is uploaded.'
      : `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} entered${peopleToFinish ? `, ${peopleToFinish} still to finish` : ''}.`,
    welfare: steps.has('welfare') ? 'Summary checked.' : 'Check the summary built from everyone’s details.',
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
    { title: 'Registration', steps: main.filter((s) => s.id !== 'start').map(trackOf) },
    { title: 'Before the Olympiad', steps: [
      { key: 'letters', title: 'Invitation letters', detail: paymentStatus === 'approved' ? 'Your payment is confirmed, so letters for visa applications follow by email.' : 'One for each person, sent once the payment is confirmed.', state: 'after', label: 'Later' },
      { key: 'badges', title: 'QR badges', detail: 'Emailed once the payment is confirmed and everyone’s arrival and departure are in.', state: 'after', label: 'Later', to: 'badges' },
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
      body: <>{firstOpenStep?.intro}{paymentStatus === 'awaiting_review' && <> Finance is checking your proof of payment; carry on meanwhile.</>}</> }

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
          <div><dt>Early bird fee</dt><dd>Registrations submitted by 12 March 2027</dd></div>
          <div><dt>Registration closes</dt><dd>30 April 2027</dd></div>
          <div><dt>The Olympiad</dt><dd>21–28 July 2027, Bangkok</dd></div>
        </dl>
        <p>Questions about your registration? <a href="mailto:iol2027.th@gmail.com">iol2027.th@gmail.com</a></p>
      </div>
    </section>
  )

  const goHome = () => { setHome(true); setNavOpen(false); setRecordOpen(false); setSectionError(null); setSavedNote('') }

  return <>
    <PageHead eyebrow={eyebrow} title={d.countryTerritory} session={session}
      intro={`${d.primaryTeamLeaderName} · Team Leader${staff ? ` · ${d.teamLeaderEmail}` : ''}`}
      aside={
        <div className="reg-head-progress">
          <p><strong>{submitted ? 'Submitted' : `${doneCount} of ${required.length}`}</strong>{submitted ? ' · people and travel can still change' : ' steps done'}</p>
          <div className="reg-meter" role="progressbar" aria-label="Registration progress" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={doneCount}>
            <span style={{ transform: `scaleX(${doneCount / required.length})` }} />
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
          <button type="button" className="reg-btn-link" onClick={staff.onBack}><ArrowLeft size={16} aria-hidden="true" />Back to the back office</button>
          <p><Info size={16} aria-hidden="true" />You are working on this registration as {staff.roleLabel}. Changes are saved straight away and recorded under your name.</p>
        </div>
      )}
      {home && overview}

      {!home && <div className="reg-ws-body">
        <nav className={`reg-rail${navOpen ? ' is-open' : ''}`} aria-label="Registration steps">
          <button type="button" className="reg-rail-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
            <span>{section.afterSubmission ? 'After you submit' : `Step ${stepNumber(section)} of ${main.length}`}</span>
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

        <section className="reg-panel" ref={panelRef} aria-labelledby="reg-panel-title" aria-busy={busy} key={activeId}>
          <header className="reg-panel-head">
            <h3 id="reg-panel-title" ref={titleRef} tabIndex={-1}>{section.title}</h3>
            <p>{section.intro}</p>
          </header>

          {infoNote && <p className="reg-aside"><Info size={18} aria-hidden="true" />{infoNote}</p>}

          {locked && (
            <div className="reg-locked">
              <Lock size={22} aria-hidden="true" />
              <div>
                <p><strong>People opens once proof of payment is uploaded.</strong> This keeps registrations from being completed before fees are settled.</p>
                <button type="button" className="reg-btn reg-btn-primary" onClick={() => open('payment')}>Go to Payment <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </div>
          )}

          {activeId === 'start' && <>
            <ol className="reg-journey">
              <li><strong>Team and observers.</strong> Two numbers that set your fees.</li>
              <li><strong>Payment.</strong> Tell us how to invoice you, transfer, then upload proof.</li>
              <li><strong>Teams.</strong> Choose each team’s contest language.</li>
              <li><strong>People.</strong> Opens after payment. Fill it in stages if you need to.</li>
              <li><strong>Rooms and welfare.</strong> Check the summary built from your people.</li>
              <li><strong>Travel.</strong> Stay dates now; flights once they are booked.</li>
              <li><strong>Review and submit.</strong> You can still update people and travel afterwards.</li>
            </ol>
            <p className="reg-aside"><Info size={18} aria-hidden="true" />Everything you save is kept, so you can leave and come back at any time.</p>
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={() => run(() => finishStep('start'))}>Start with team and observers <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </>}

          {activeId === 'setup' && (
            <form onSubmit={saveSetup} noValidate>
              <Facts items={[
                { label: 'Team Leader', value: `${d.primaryTeamLeaderName} · ${d.teamLeaderEmail}`, help: 'From your verified account.' },
                { label: 'Country', value: `${d.countryTerritory} · set by your invitation code` },
              ]} />
              <div className="reg-grid">
                <FieldControl idPrefix="setup" error={fieldErrors['Number of teams']} field={{ label: 'Number of teams', value: String(d.numberOfTeams), kind: 'select', help: 'Up to two teams per country or territory.' }} />
                <FieldControl idPrefix="setup" error={fieldErrors['Number of observers']} field={{ label: 'Number of observers', value: String(d.numberOfObservers), kind: 'number', help: 'Observer fees are added once the organisers confirm the rate.' }} />
                <FieldControl idPrefix="setup" error={fieldErrors['Room type preference']} field={{ label: 'Room type preference', value: d.contestantRoomType ?? '', kind: 'select', help: 'Preferred room type for contestants. Team Leaders and observers always receive single rooms.', optional: true }} />
              </div>
              {paymentDone && <p className="reg-aside"><Info size={18} aria-hidden="true" />You have already paid. Changing these numbers may change your fees; Finance will contact you if it does.</p>}
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>Save and continue <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'welfare' && (
            <form onSubmit={saveWelfare} noValidate>
              <Facts items={welfareFacts(data.members, data.guardianConsent, data.attachments)} />
              <div className="reg-grid">
                <FieldControl idPrefix="welfare" field={{ label: 'Anything else the welfare team should know', value: d.welfareNote ?? '', kind: 'textarea', optional: true }} />
              </div>
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>This is correct, continue <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'payment' && (
            <form ref={invoiceRef} onSubmit={savePayment} noValidate>
              <div className="reg-pay-top">
                <section className="reg-block" aria-labelledby="pay-amount">
                  <h4 id="pay-amount">Amount to transfer</h4>
                  <table className="reg-fee-table">
                    <tbody>
                      {data.fees.lines.map((line) => (
                        <tr key={line.key}><th scope="row">{line.label}<small>{line.detail}</small></th><td>{line.amount === null ? (data.fees.observersPending ? 'Rate to be confirmed' : '—') : money(line.amount)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th scope="row">Total</th><td>{money(data.fees.total)}</td></tr></tfoot>
                  </table>
                  <dl className="reg-ref">
                    <div><dt>Fee tier</dt><dd>{data.fees.tierLabel}</dd></div>
                    <div><dt>Payment reference</dt><dd>{payment ? <>
                      <span className="reg-code">{payment.paymentReference}</span>
                      <button type="button" className="reg-copy" onClick={copyReference}><Copy size={14} aria-hidden="true" />{copied ? 'Copied' : 'Copy'}</button>
                    </> : <span className="reg-muted">Created when you save the invoice details</span>}</dd></div>
                  </dl>
                  <span className="reg-visually-hidden" role="status">{copied ? 'Payment reference copied' : ''}</span>
                </section>

                <section className="reg-block" aria-labelledby="pay-how">
                  <h4 id="pay-how">How to pay</h4>
                  <ol className="reg-how">
                    <li>Fill in and save the invoice details below. Invoices can’t be split after you transfer.</li>
                    <li>{payment
                      ? <button type="button" className="reg-inline-btn" onClick={() => openInvoice({ organisation: payment.invoiceRecipientName ?? d.countryTerritory, country: d.countryTerritory, recipientAddress: payment.invoiceRecipientAddress, reference: payment.paymentReference, fees: data.fees })}><Download size={14} aria-hidden="true" />Download the invoice</button>
                      : 'Download the invoice (available once the details are saved).'}</li>
                    <li>Transfer the <strong>full amount</strong> to สอวน (POSN) at SCB. Choose <strong>OUR</strong> for bank charges, and put the payment reference in the description.</li>
                    <li>Upload the bank’s proof of transfer. People opens straight after.</li>
                  </ol>
                  <p className="reg-aside"><Info size={18} aria-hidden="true" />Account name, number and SWIFT code appear here once Finance approves them.</p>
                </section>
              </div>

              <section className="reg-block reg-pay-rules" aria-labelledby="pay-rules">
                <h4 id="pay-rules">Payment rules</h4>
                <Facts items={[
                  { label: 'How', value: 'Bank transfer only', help: 'There is no card or online payment. Transfer outside this website, then upload the proof here.' },
                  { label: 'Amount', value: 'The full invoice amount', help: 'The organisers must receive the full amount. Partial payments are not accepted.' },
                  { label: 'Bank charges', value: 'Paid by you (OUR)', help: 'The organisers cannot cover charges that intermediary banks deduct.' },
                  { label: 'Currency conversion', value: 'Paid by you', help: 'Conversion costs and exchange-rate differences are the sender’s responsibility.' },
                ]} />
              </section>

              <fieldset className="reg-fieldset">
                <legend>Invoice details</legend>
                {paymentDone && <p className="reg-hint">Locked while Finance reviews your payment. Contact the organisers to change them.</p>}
                <div className="reg-grid">
                  <FieldControl idPrefix="payment" disabled={paymentDone} error={fieldErrors['Invoice recipient name']} field={{ label: 'Invoice recipient name', value: payment?.invoiceRecipientName ?? d.accreditedOrganisation ?? '', help: 'The organisation named on the invoice.' }} />
                  <FieldControl idPrefix="payment" disabled={paymentDone} field={{ label: 'Invoice recipient address', value: payment?.invoiceRecipientAddress ?? '', kind: 'textarea', optional: true, help: 'Only if your institution needs a postal address on the invoice.' }} />
                  <FieldControl idPrefix="payment" disabled={paymentDone} error={fieldErrors['Number of invoices']} field={{ label: 'Number of invoices', value: String(payment?.invoiceCount ?? 1), kind: 'number', help: 'Invoices cannot be split after the transfer.' }} />
                  <FieldControl idPrefix="payment" disabled={paymentDone} field={{ label: 'How to split the invoices', value: payment?.invoiceSplitNote ?? '', kind: 'textarea', optional: true, help: 'Only for more than one invoice. Example: “National Olympiad Foundation, USD 1,200; University Fund, USD 1,680”.' }} />
                </div>
                {!paymentDone && <button type="button" className="reg-btn reg-btn-secondary reg-save-invoice" disabled={busy} onClick={() => run(async () => { if (await saveInvoice()) setSavedNote('Invoice details saved.') })}>Save invoice details</button>}
                <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>
              </fieldset>

              {payment?.status === 'rejected' && (
                <p className="reg-aside reg-aside-warn"><CircleAlert size={18} aria-hidden="true" /><span><strong>Finance could not match your proof.</strong> {payment.reviewNote} Please upload a new one.</span></p>
              )}

              <div className={`reg-field reg-field-wide reg-proof${fieldErrors.proof ? ' has-error' : ''}`}>
                <span className="reg-label-text" id="proof-label">Proof of transfer</span>
                <p className="reg-hint" id="proof-hint">{canUpload || paymentDone ? 'The bank’s confirmation or a screenshot of the completed transfer. PDF, JPG or PNG, up to 10 MB.' : 'Save the invoice details first, then upload the proof after you transfer.'}</p>
                {fieldErrors.proof && <p className="reg-error" id="proof-error"><CircleAlert size={16} aria-hidden="true" />{fieldErrors.proof}</p>}
                <label className={`reg-dropzone${paymentDone ? ' is-filled' : ''}${fieldErrors.proof ? ' has-error' : ''}${!canUpload && !paymentDone ? ' is-disabled' : ''}`}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={!canUpload || busy} aria-labelledby="proof-label" aria-describedby={`proof-hint${fieldErrors.proof ? ' proof-error' : ''}`}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadProof(file); e.target.value = '' }} />
                  {paymentDone
                    ? <><Check size={22} strokeWidth={2.6} aria-hidden="true" /><span><strong>{proofAttachment?.originalFilename ?? 'Proof uploaded'}</strong>{payment?.status === 'approved' ? 'Approved by Finance.' : 'Uploaded. Finance will check it against the bank statement.'}</span></>
                    : <><Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : 'Choose a file'}</strong>{canUpload ? 'or drag it here' : 'Available once the invoice details are saved'}</span></>}
                </label>
              </div>

              <Facts compact items={[
                { label: 'Finance check', value: payment?.status === 'approved' ? 'Approved' : payment?.status === 'awaiting_review' ? 'Waiting for Finance' : payment?.status === 'rejected' ? 'Returned, upload a new proof' : 'Waiting for your proof' },
                { label: 'E-receipt', value: receipt ? `Ready: ${receipt.receiptNumber}` : 'Available here once Finance approves the payment' },
              ]} />
              {receipt && (
                <p className="reg-aside reg-aside-ok"><Check size={18} strokeWidth={3} aria-hidden="true" />
                  <span>Payment approved. <button type="button" className="reg-inline-btn" onClick={() => openReceipt({
                    organisation: receipt.invoiceRecipientName ?? d.countryTerritory, country: d.countryTerritory, recipientAddress: receipt.invoiceRecipientAddress,
                    reference: receipt.paymentReference, receiptNumber: receipt.receiptNumber!, amountPaid: Number(receipt.amountDue), currency: receipt.currency,
                    tierLabel: receipt.feeTier === 'early_bird' ? 'Early bird' : 'Normal', approvedAt: receipt.reviewedAt,
                  })}><Download size={14} aria-hidden="true" />Download the e-receipt</button></span>
                </p>
              )}

              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{paymentDone ? 'Continue' : 'Save and continue'} <ArrowRight size={18} aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {activeId === 'travel' && (
            <fieldset className="reg-fieldset reg-stay">
              <legend>Stay dates</legend>
              <p className="reg-hint">The programme runs from {formatDate(programmeWindow.first)} to {formatDate(programmeWindow.last)} 2027. Dates are saved as you choose them.</p>
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
                <div className="reg-field reg-field-wide">
                  <label htmlFor="stay-why">Why you need the extra nights <span className="reg-optional">(optional)</span></label>
                  <p className="reg-hint" id="stay-why-hint">So the organisers can check hotel availability and any extra cost.</p>
                  <textarea id="stay-why" className="reg-control" rows={3} defaultValue={d.stayWindowNote ?? ''} onChange={(e) => setStayNote(e.target.value)} aria-describedby="stay-why-hint" />
                </div>
              )}
            </fieldset>
          )}

          {section.records && !locked && (
            <div className={`reg-records${recordOpen ? ' is-open' : ''}`}>
              <div className="reg-record-list">
                <div className="reg-record-list-head">
                  <h4>{activeId === 'travel' ? 'Flights' : `${sectionRecords.filter((r) => r.id !== NEW_PERSON).length} ${section.records.plural}`}</h4>
                  {activeId === 'people' && !draftOpen && <button type="button" className="reg-btn-link" onClick={addPerson}><UserPlus size={16} aria-hidden="true" />Add person</button>}
                </div>
                {activeId === 'travel' && <p className="reg-hint">Add these once flights are booked. You can change them until the travel deadline.</p>}
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
              </div>

              {currentRecord && (
                <form className="reg-record-editor" onSubmit={saveRecord} noValidate key={currentRecord.id}>
                  <button type="button" className="reg-btn-link reg-back-to-list" onClick={() => setRecordOpen(false)}><ArrowLeft size={16} aria-hidden="true" />All {section.records.plural}</button>
                  <div className="reg-editor-head">
                    <h4>{currentRecord.label}</h4>
                    {recordChip(currentRecord)}
                  </div>
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
                          : <><Upload size={22} aria-hidden="true" /><span><strong>{busy ? 'Uploading…' : 'Choose a file'}</strong>or drag it here</span></>}
                      </label>
                    </div>
                  )}
                  <div className="reg-editor-actions">
                    <button type="submit" className="reg-btn reg-btn-secondary" disabled={busy}>{busy ? 'Saving…' : `Save ${section.records.noun}`}</button>
                    {currentRecord.id === NEW_PERSON && <button type="button" className="reg-btn-link" onClick={() => { setDraftOpen(false); setSelected((s) => ({ ...s, people: undefined })) }}>Cancel</button>}
                    <span className="reg-saved" role="status">{savedNote && <><Check size={15} strokeWidth={3} aria-hidden="true" />{savedNote}</>}</span>
                  </div>
                </form>
              )}
            </div>
          )}

          {section.records && !locked && (
            <div className="reg-panel-actions">
              <Alert>{sectionError}</Alert>
              <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={finishRecords}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          )}

          {activeId === 'review' && (submitted ? (
            <div className="reg-submitted">
              <Check size={28} strokeWidth={2.6} aria-hidden="true" />
              <div>
                <p><strong>Registration submitted.</strong> A confirmation has been sent to {d.teamLeaderEmail}.</p>
                <p>Finance will check your payment next. You can still update people and travel until the change deadline.</p>
              </div>
            </div>
          ) : <>
            {outstanding.length > 0 ? (
              <section className="reg-block" aria-labelledby="review-left">
                <h4 id="review-left">Please complete the following first</h4>
                <ul className="reg-todo">
                  {outstanding.map((item) => <li key={item.text}><button type="button" className="reg-inline-btn" onClick={() => open(item.to)}>{item.text}</button></li>)}
                </ul>
              </section>
            ) : <p className="reg-aside reg-aside-ok"><Check size={18} strokeWidth={3} aria-hidden="true" />Everything is ready to submit.</p>}
          </>)}

          {activeId === 'review' && <>
            <h4 className="reg-subhead">Current status</h4>
            <Facts items={[
              { label: 'Registration', value: submitted ? `Submitted${d.submittedAt ? ` on ${new Date(d.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}` : 'Draft, not submitted yet' },
              { label: 'Payment', value: paymentLabel[payment?.status ?? 'none'].replace(/^Payment: (.)/, (_, c: string) => c.toUpperCase()) },
              { label: 'Changes after submitting', value: 'Allowed until the change deadline', help: 'The final lock date and the change-request channel are awaiting approval.' },
              { label: 'Travel', value: d.declaredArrivalDate && d.declaredDepartureDate ? 'Stay dates added; flights can follow' : 'Stay dates still needed' },
              { label: 'Messages from the organisers', value: 'None' },
            ]} />
            <h4 className="reg-subhead">After you submit</h4>
            <Facts items={section.facts ?? []} />
            {!submitted && (
              <div className="reg-panel-actions">
                <Alert>{sectionError}</Alert>
                <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit registration'}</button>
              </div>
            )}
          </>}

          {activeId === 'badges' && <>
            <Facts items={section.facts ?? []} />
            <p className="reg-aside"><Info size={18} aria-hidden="true" />Staff use the <a href="/check-in">badge scanner</a> during event week.</p>
          </>}
        </section>
      </div>}
    </div>
  </>
}
