// Converts API data into the portal's records and fields, and form data back into API payloads.
import type { Attachment, DelegationData, Member, MemberRole, Team, TravelRecord } from './api'
import type { Field, PortalRecord } from './portalData'
import { longDate } from './ui'

const shirtHelp = 'Chest: XS 80 cm · S 85 · M 90 · L 95 · XL 100 · 2XL 106 · 3XL 112'

export const roleToLabel: Record<MemberRole, string> = { contestant: 'Contestant', observer: 'Observer', team_leader: 'Team Leader', jury: 'Jury member', volunteer: 'Volunteer' }
const labelToRole: Record<string, MemberRole> = { Contestant: 'contestant', Observer: 'observer' }


type MemberFieldDef = Field & { key: keyof Member; roles?: MemberRole[] }

/** Every person field, which member column it maps to, and which roles see it. */
const memberFieldDefs: MemberFieldDef[] = [
  { key: 'role', label: 'Role', value: '', kind: 'select', roles: ['contestant', 'observer'] },
  { key: 'teamId', label: 'Team assignment', value: '', kind: 'select', roles: ['contestant'], help: 'Each team has four contestants.' },
  { key: 'email', label: 'Email', value: '', kind: 'email', roles: ['observer'], help: 'Receives their own invitation letter and badge notices.' },
  { key: 'displayName', label: 'Display name', value: '', help: 'May appear on the IOL website and in the official programme.' },
  { key: 'badgeName', label: 'Badge name', value: '', help: 'Printed large on the lanyard badge. Usually a first or preferred name.' },
  { key: 'officialName', label: 'Official name', value: '', help: 'As it should appear on certificates.' },
  { key: 'passportName', label: 'Passport name', value: '', help: 'Exactly as printed in the passport.' },
  { key: 'passportNumber', label: 'Passport number', value: '' },
  { key: 'passportNationality', label: 'Passport nationality', value: '' },
  { key: 'dateOfBirth', label: 'Date of birth', value: '', kind: 'date', help: 'Confirms contestant eligibility.' },
  { key: 'examLanguage', label: 'Individual contest language', value: '', kind: 'select', other: true, roles: ['contestant'] },
  { key: 'genderForRoomAllocation', label: 'Gender for room allocation', value: '', kind: 'select', help: 'Used only for rooming and safeguarding.' },
  { key: 'tshirtSize', label: 'T-shirt size', value: '', kind: 'select', help: shirtHelp },
  { key: 'poloSize', label: 'Polo shirt size', value: '', kind: 'select', help: shirtHelp },
  { key: 'diet', label: 'Food', value: '', kind: 'checkboxes', help: 'Tick everything that applies. For anything not listed, tick “Other” and say what below.' },
  { key: 'foodAllergyNotes', label: 'Food details', value: '', kind: 'textarea', optional: true, help: 'Opens when you tick “Other” or an allergy: what to avoid, and how serious it is.' },
  { key: 'medicalAccessibilityNotes', label: 'Medical or accessibility notes', value: '', kind: 'textarea', help: 'Conditions, medicines or access needs the organisers should know about. Write “None” if there is nothing.' },
  { key: 'emergencyContact', label: 'Emergency contact', value: '', help: 'Name and phone number of someone we can reach during the event.' },
]

/** Whose record this is: the account holder's own (a jury member or volunteer), or someone in the delegation. */
const isSelf = (role: MemberRole) => role === 'jury' || role === 'volunteer'
const languageHelp = (data: DelegationData, what: string) => (data.event.languagesLocked
  ? `Contest languages could be changed until ${longDate(data.event.languageLock)}. To change it now, email the organisers.`
  : `${what} You can change it until ${longDate(data.event.languageLock)}.`)

function memberDefs(role: MemberRole, data: DelegationData) {
  const country = (data.delegation.kind ?? 'country') === 'country'
  return memberFieldDefs
    // The role of a Team Leader (named in Team and observers), a jury member's or volunteer's own record, and a jury
    // member's observer is fixed; so is the observer's team, which Team and observers sets.
    .filter((def) => (!def.roles || def.roles.includes(role)) && !(def.key === 'role' && (!country || role === 'team_leader' || isSelf(role))))
    .map((def): MemberFieldDef => {
      if (def.key === 'examLanguage') return { ...def, disabled: data.event.languagesLocked, help: languageHelp(data, 'The language of their individual contest paper.') }
      if (def.key === 'diet') return { ...def, options: data.options.diets }
      if (def.key === 'dateOfBirth' && role !== 'contestant') return { ...def, help: undefined }
      return def
    })
}

export function personFields(member: Partial<Member> & { role: MemberRole }, data: DelegationData): Field[] {
  return memberDefs(member.role, data).map((def) => {
    let value = String(member[def.key] ?? '')
    if (def.key === 'role') value = roleToLabel[member.role]
    if (def.key === 'teamId') value = data.teams.find((t) => t.id === member.teamId)?.name ?? ''
    if (def.key === 'diet') value = (member.diet ?? []).join(', ')
    const options = def.key === 'teamId' ? data.teams.map((t) => t.name) : def.key === 'role' ? ['Contestant', 'Observer'] : def.options
    const { key: _key, roles: _roles, ...field } = def
    // The food details box stays greyed out until "Other" or an allergy is ticked (meeting of 24 Nov 2026), so nothing
    // stray is typed there; Workspace opens it as the boxes are ticked.
    if (def.key === 'foodAllergyNotes') return { ...field, value, options, disabled: !needsFoodDetails(member.diet ?? []) }
    return { ...field, value, options }
  })
}

/** Required details that are still empty, as the server checks them (server/lib.js missingMemberDetails). */
export function missingPersonFields(member: Partial<Member> & { role: MemberRole }, data: DelegationData) {
  const gaps = memberDefs(member.role, data)
    .filter((def) => !def.optional && def.key !== 'diet' && !String(member[def.key] ?? '').trim())
    .map((def) => def.label)
  const diet = member.diet ?? []
  if (!diet.length) gaps.push('Food')
  else if (needsFoodDetails(diet) && !String(member.foodAllergyNotes ?? '').trim()) gaps.push('Food details')
  return gaps
}

/** "Other" and the allergies need a few words in Food details. */
export const needsFoodDetails = (diet: string[]) => diet.some((d) => d === 'Other' || d.endsWith('allergy'))

/** The signed guardian consent form for this person, if one was uploaded. */
export const consentFor = (member: Member, attachments: Attachment[]) => attachments.find((a) => a.kind === 'guardian_consent' && a.memberId === member.id)
/** A jury member's or volunteer's photo. */
export const photoFor = (member: Member, attachments: Attachment[]) => attachments.find((a) => a.kind === 'photo' && a.memberId === member.id)

/** Everything still needed for this person: empty details, the consent form when the policy asks for one, a photo. */
export function personGaps(member: Member, data: DelegationData) {
  const gaps = missingPersonFields(member, data)
  if (member.needsGuardianConsent && !consentFor(member, data.attachments)) gaps.push('Guardian consent form')
  if (isSelf(member.role) && !photoFor(member, data.attachments)) gaps.push('Photo')
  return gaps
}

export function personRecord(member: Member, data: DelegationData): PortalRecord {
  const missing = personGaps(member, data)
  const team = data.teams.find((t) => t.id === member.teamId)
  // Team Leaders' and observers' single rooms are chosen in the first step and copied here (the server's
  // syncSingleRooms), so the record shows the answer instead of asking again.
  const setupStep = (data.delegation.kind ?? 'country') === 'country' ? 'Team and observers' : 'About you'
  const room = member.role === 'contestant' ? []
    : [{ label: 'Single room', value: member.roomTypePreference === 'single' ? 'Yes' : member.roomTypePreference === 'shared' ? 'No, shares a twin room' : 'Not chosen yet', help: `Chosen in ${setupStep}. Change it there.` }]
  const role = member.role === 'team_leader'
    ? [{ label: 'Role', value: `Team Leader${team ? `, ${team.name}` : ''}`, help: 'Team Leaders are named in Team and observers. Change them there.' }]
    : []
  return {
    id: member.id,
    label: member.displayName,
    meta: `${roleToLabel[member.role]}${team && member.role !== 'observer' ? ` · ${team.name}` : ''}`,
    status: missing.length ? 'attention' : 'complete',
    issue: missing.length ? (missing.length === 1 ? `${missing[0]} missing` : `${missing.length} details missing`) : undefined,
    missing,
    facts: [...role, ...room],
    fields: personFields(member, data),
  }
}

/** Reads the person form back into member columns. Empty strings clear a value. */
export function personPayload(form: FormData, role: MemberRole, data: DelegationData) {
  const payload: Record<string, string | string[] | boolean | null> = {}
  for (const def of memberDefs(role, data)) {
    if (def.disabled) continue
    if (def.key === 'diet') { payload.diet = form.getAll(def.label).map(String); continue }
    // Food details only go with "Other" or an allergy; with neither, anything left there is cleared.
    if (def.key === 'foodAllergyNotes' && !needsFoodDetails(form.getAll('Food').map(String))) { payload.foodAllergyNotes = null; continue }
    const raw = String(form.get(def.label) ?? '').trim()
    if (def.key === 'role') { if (raw) payload.role = labelToRole[raw] ?? role; continue }
    if (def.key === 'teamId') { payload.teamId = data.teams.find((t) => t.name === raw)?.id ?? null; continue }
    payload[def.key] = raw || null
  }
  return payload
}

export function teamRecord(team: Team, data: DelegationData): PortalRecord {
  const contestants = data.members.filter((m) => m.teamId === team.id && m.role === 'contestant').map((m) => m.badgeName || m.displayName)
  const leader = data.members.find((m) => m.role === 'team_leader' && m.teamId === team.id)
  return {
    id: team.id,
    label: team.name,
    meta: `${contestants.length} of 4 contestants`,
    status: team.contestLanguage ? 'complete' : 'attention',
    issue: team.contestLanguage ? undefined : 'Contest language missing',
    facts: [
      { label: 'Team code', value: team.code },
      { label: 'Team Leader', value: leader?.displayName ?? 'Not named yet', help: leader ? undefined : 'Name them in Team and observers.' },
      { label: 'Contestants', value: contestants.join(', ') || 'None assigned yet', help: contestants.length ? undefined : 'Assign contestants to this team in People.' },
    ],
    fields: [
      { label: 'Team name', value: team.name },
      { label: 'Team contest language', value: team.contestLanguage ?? '', kind: 'select', other: true, disabled: data.event.languagesLocked, help: languageHelp(data, 'One language for the whole team’s paper.') },
    ],
  }
}

/** How a trip gets to or from the hotel: the organisers' airport transfer, or the person's own way. */
export const transportLabel = (direction: 'arrival' | 'departure') => (direction === 'arrival' ? 'Getting to the hotel' : 'Getting to the airport')
export const transportChoices = {
  arrival: ['Airport pickup by the organisers', 'I will arrange my own transportation to the hotel'],
  departure: ['Drop-off at the airport by the organisers', 'I will arrange my own transportation to the airport'],
}
export const airportLabel = (direction: 'arrival' | 'departure') => (direction === 'arrival' ? 'Arrival airport' : 'Departure airport')

/** Whether a trip has what it needs: with the organisers' transfer, the airport, flight, date and time; on their own, the date and time. */
export const tripComplete = (trip?: TravelRecord) => Boolean(trip && trip.localDate && trip.localTime
  && (trip.transport === 'own' || (trip.travelPoint && trip.flightServiceNumber)))

/**
 * One arrival or departure. `number` tells several trips in the same direction apart (Arrival 1, Arrival 2), and
 * `mode` is the transport chosen in the open form, which decides whether the airport and flight are asked.
 */
export function tripRecord(direction: 'arrival' | 'departure', trip: TravelRecord | undefined, data: DelegationData, number?: number, mode?: 'organisers' | 'own'): PortalRecord {
  const { members, event, options } = data
  const transport = mode ?? trip?.transport ?? 'organisers'
  const chosen = (trip?.memberIds ?? []).map((id) => members.find((m) => m.id === id)?.displayName).filter(Boolean)
  // Each person arrives once and leaves once: anyone already on another trip this way cannot be ticked here.
  const sameWay = data.travelRecords.filter((t) => t.direction === direction && t.id !== trip?.id).sort((a, b) => `${a.localDate}${a.localTime}${a.createdAt}`.localeCompare(`${b.localDate}${b.localTime}${b.createdAt}`))
  const unavailable: Record<string, string> = {}
  for (const m of members) {
    const other = sameWay.find((t) => t.memberIds.includes(m.id))
    if (other) unavailable[m.displayName] = `On ${direction === 'arrival' ? 'another arrival' : 'another departure'}${other.flightServiceNumber ? ` (${other.flightServiceNumber})` : ''}`
  }
  const complete = tripComplete(trip)
  const changes = event.travelLocked ? `Closed on ${longDate(event.travelDeadline)}: email the organisers to change a flight` : `Open until ${longDate(event.travelDeadline)}`
  const own = transport === 'own'
  return {
    id: trip?.id ?? `new-${direction}`,
    label: `${direction === 'arrival' ? 'Arrival' : 'Departure'}${number ? ` ${number}` : ''}`,
    meta: complete ? `${trip!.transport === 'own' ? 'Own way' : trip!.flightServiceNumber} · ${trip!.localDate}` : 'Add after booking',
    status: complete ? 'complete' : 'later',
    issue: trip && !complete ? 'Incomplete' : undefined,
    facts: own ? [{ label: 'Changes', value: changes }] : direction === 'arrival'
      ? [
        { label: 'Meeting point', value: 'Sent after you submit flights' },
        { label: 'Pickup group', value: 'Assigned by the transport team' },
        { label: 'Changes', value: changes },
      ]
      : [
        { label: 'Hotel pickup time', value: 'Sent after departure planning' },
        { label: 'Bus group', value: 'Assigned by the transport team' },
        { label: 'Changes', value: changes },
      ],
    fields: [
      { label: transportLabel(direction), value: transportChoices[direction][own ? 1 : 0], kind: 'radio', options: transportChoices[direction], disabled: event.travelLocked },
      ...(own ? [] : [
        { label: airportLabel(direction), value: trip?.travelPoint && options.airports.includes(trip.travelPoint) ? trip.travelPoint : '', kind: 'select' as const, options: options.airports, disabled: event.travelLocked },
        { label: 'Flight number', value: trip?.flightServiceNumber ?? '', disabled: event.travelLocked, help: 'For example TG 661.' },
      ]),
      { label: 'Date', value: trip?.localDate ?? '', kind: 'date', min: options.travelWindow.first, max: options.travelWindow.last, disabled: event.travelLocked,
        help: own ? `The day you ${direction === 'arrival' ? 'reach the hotel' : 'leave the hotel'}.` : 'Bangkok local date.' },
      { label: 'Time', value: trip?.localTime?.slice(0, 5) ?? '', kind: 'time', disabled: event.travelLocked,
        help: own ? `About when you ${direction === 'arrival' ? 'reach the hotel' : 'leave the hotel'}, Bangkok time.` : `Bangkok local time the flight ${direction === 'arrival' ? 'lands' : 'leaves'}.` },
      { label: 'People on this trip', value: chosen.join(', '), kind: 'checkboxes', options: members.map((m) => m.displayName), unavailable, disabled: event.travelLocked,
        help: 'Everyone travelling together. Anyone on a different flight goes on a trip of their own.' },
    ],
  }
}

export function tripPayload(form: FormData, direction: 'arrival' | 'departure', members: Member[]) {
  const names = form.getAll('People on this trip').map(String)
  const own = String(form.get(transportLabel(direction)) ?? '') === transportChoices[direction][1]
  return {
    direction,
    transport: own ? 'own' : 'organisers',
    travelPoint: own ? null : String(form.get(airportLabel(direction)) ?? '') || null,
    flightServiceNumber: own ? (null as string | null) : String(form.get('Flight number') ?? '').trim() || null,
    localDate: String(form.get('Date') ?? '') || null,
    localTime: String(form.get('Time') ?? '') || null,
    peopleIds: members.filter((m) => names.includes(m.displayName)).map((m) => m.id),
  }
}

/** "Name: diet (details)" for everyone with a diet worth knowing, so the representative can check whose it is. */
const dietsOf = (members: Member[]) => members
  .filter((m) => (m.diet ?? []).some((d) => d !== 'No special diet'))
  .map((m) => `${m.badgeName || m.displayName}: ${m.diet!.join(', ')}${m.foodAllergyNotes?.trim() ? ` (${m.foodAllergyNotes.trim()})` : ''}`)
const medicalOf = (members: Member[]) => members
  .filter((m) => m.medicalAccessibilityNotes && !/^(none|no|n\/a|-|no restrictions|no special requirements)\.?$/i.test(m.medicalAccessibilityNotes.trim()))
  .map((m) => `${m.badgeName || m.displayName}: ${m.medicalAccessibilityNotes!.trim()}`)

/** One line of the review: a value, or a list when there are several (one diet per person, one trip per line). */
export type ReviewFact = { label: string; value: string | string[]; help?: string }

/** "21 July, 09:30 · TG 661 · Suvarnabhumi (BKK) · 5 people", or the people who make their own way. */
function tripLines(data: DelegationData, direction: 'arrival' | 'departure') {
  const nameOf = (id: string) => { const m = data.members.find((x) => x.id === id); return m ? m.badgeName || m.displayName : '' }
  return data.travelRecords
    .filter((t) => t.direction === direction)
    .sort((a, b) => `${a.localDate ?? '9999'}${a.localTime ?? ''}`.localeCompare(`${b.localDate ?? '9999'}${b.localTime ?? ''}`))
    .map((t) => {
      const when = t.localDate ? `${new Date(`${t.localDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${t.localTime ? `, ${t.localTime.slice(0, 5)}` : ''}` : 'Date to come'
      const how = t.transport === 'own' ? 'own way' : t.travelPoint ?? 'airport to come'
      const who = t.memberIds.map(nameOf).filter(Boolean)
      return `${when} · ${[t.flightServiceNumber, how].filter(Boolean).join(' · ')} · ${who.length ? who.join(', ') : 'nobody ticked yet'}`
    })
}

/**
 * Review and requests (meeting of 24 Nov 2026): everything the organisers will work from, built from People and
 * Travel so nobody retypes it, in groups: rooms, food and health, travel, and who sees it.
 */
export function reviewGroups(data: DelegationData): { id: string; title: string; facts: ReviewFact[] }[] {
  const { members, feeRules, event, delegation } = data
  const contestants = members.filter((m) => m.role === 'contestant')
  const male = contestants.filter((m) => m.genderForRoomAllocation === 'Male').length
  const female = contestants.filter((m) => m.genderForRoomAllocation === 'Female').length
  const others = contestants.length - male - female
  const singles = members.filter((m) => m.role !== 'contestant' && m.roomTypePreference === 'single').map((m) => m.displayName)
  const diets = dietsOf(members)
  const medical = medicalOf(members)
  const country = (delegation.kind ?? 'country') === 'country'
  const noRoom = delegation.needsAccommodation === false
  const arrivals = tripLines(data, 'arrival')
  const departures = tripLines(data, 'departure')
  const onTrip = (direction: 'arrival' | 'departure') => new Set(data.travelRecords.filter((t) => t.direction === direction).flatMap((t) => t.memberIds))
  const missingTrip = members.filter((m) => !onTrip('arrival').has(m.id) || !onTrip('departure').has(m.id)).map((m) => m.badgeName || m.displayName)
  return [
    { id: 'review-rooms', title: 'Rooms', facts: [
      { label: 'Hotel nights', value: noRoom ? 'No hotel room needed' : `${longDate(event.hotelFirstNight)} to the night of ${longDate(event.hotelLastNight)}`,
        help: noRoom ? 'You said you do not need a room. Change it in About you.' : 'Provided by the organisers. Other nights are yours to book and pay for.' },
      ...(country ? [{ label: 'Contestants’ rooms', value: `${male} male, ${female} female${others ? `, ${others} other or not given` : ''}`, help: 'Contestants share twin rooms with someone of the same gender, from their own country where possible.' }] : []),
      { label: 'Single rooms', value: singles.length ? singles : 'None', help: `USD ${feeRules.singleRoomFee.toLocaleString('en-US')} each. Chosen in ${country ? 'Team and observers' : 'About you'}.` },
    ] },
    { id: 'review-health', title: 'Food and health', facts: [
      { label: 'Food', value: diets.length ? diets : 'Nothing reported', help: `From each person’s food options in ${country ? 'People' : 'Your details'}.` },
      { label: 'Medical and accessibility', value: medical.length ? medical : 'Nothing reported', help: 'From each person’s medical or accessibility notes.' },
    ] },
    { id: 'review-travel', title: 'Travel', facts: [
      { label: 'Arrivals', value: arrivals.length ? arrivals : 'None added yet' },
      { label: 'Departures', value: departures.length ? departures : 'None added yet' },
      ...(missingTrip.length ? [{ label: 'Not on an arrival and a departure yet', value: missingTrip, help: 'Everyone needs both, those who make their own way too. Add them in Travel.' }] : []),
    ] },
    { id: 'review-privacy', title: 'Who sees this', facts: [
      { label: 'Who can see it', value: 'The organising team only', help: 'Handled under Thailand’s Personal Data Protection Act (PDPA) and the GDPR; every download is logged.' },
      { label: 'How long it is kept', value: '5 years after IOL 2027, then securely deleted', help: 'As set out on the consent forms.' },
    ] },
  ]
}
