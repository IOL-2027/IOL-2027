// Converts API data into the portal's records and fields, and form data back into API payloads.
import type { Attachment, DelegationData, GuardianConsentPolicy, Member, Team, TravelRecord } from './api'
import type { Field, PortalRecord } from './portalData'

const shirtHelp = 'Chest: XS 80 cm · S 85 · M 90 · L 95 · XL 100 · 2XL 106 · 3XL 112'

const roleToLabel = { contestant: 'Contestant', observer: 'Observer', team_leader: 'Team Leader' } as const
const labelToRole: Record<string, Member['role']> = { Contestant: 'contestant', Observer: 'observer', 'Team Leader': 'team_leader' }

type MemberFieldDef = Field & { key: keyof Member; roles?: Member['role'][] }

/** Every person field, which member column it maps to, and which roles see it. */
const memberFieldDefs: MemberFieldDef[] = [
  { key: 'role', label: 'Role', value: '', kind: 'select', roles: ['contestant', 'observer'] },
  { key: 'teamId', label: 'Team assignment', value: '', kind: 'select', roles: ['contestant', 'team_leader'] },
  { key: 'observerCategory', label: 'Observer category', value: '', kind: 'select', roles: ['observer'], help: 'Used by Finance to apply the observer rate.' },
  { key: 'email', label: 'Email', value: '', kind: 'email', roles: ['observer'], help: 'Receives their own invitation letter and badge notices.' },
  { key: 'displayName', label: 'Display name', value: '', help: 'Shown on programme lists.' },
  { key: 'badgeName', label: 'Badge name', value: '', help: 'Printed large on the lanyard badge. Usually a first or preferred name.' },
  { key: 'officialName', label: 'Official name', value: '', help: 'As it should appear on certificates.' },
  { key: 'passportName', label: 'Passport name', value: '', help: 'Exactly as printed in the passport.' },
  { key: 'passportNumber', label: 'Passport number', value: '' },
  { key: 'passportNationality', label: 'Passport nationality', value: '' },
  { key: 'dateOfBirth', label: 'Date of birth', value: '', kind: 'date', help: 'Confirms contestant eligibility and whether a guardian consent is needed.' },
  { key: 'examLanguage', label: 'Exam language', value: '', kind: 'select', roles: ['contestant'], help: 'Language of the individual contest paper.' },
  { key: 'genderForRoomAllocation', label: 'Gender for room allocation', value: '', kind: 'select', help: 'Used only for rooming and safeguarding.' },
  { key: 'roomTypePreference', label: 'Room type preference', value: '', kind: 'select', roles: ['observer'], help: 'A single room may carry a supplement.' },
  { key: 'tshirtSize', label: 'T-shirt size', value: '', kind: 'select', help: shirtHelp },
  { key: 'poloSize', label: 'Polo shirt size', value: '', kind: 'select', help: shirtHelp },
  { key: 'foodAllergyNotes', label: 'Food and allergy notes', value: '', kind: 'textarea', optional: true },
  { key: 'medicalAccessibilityNotes', label: 'Medical or accessibility notes', value: '', kind: 'textarea', optional: true },
  { key: 'emergencyContact', label: 'Emergency contact', value: '', help: 'Name and phone number of someone we can reach during the event.' },
]

/** A Team Leader may lead both teams, so their team assignment is optional. */
function memberDefs(role: Member['role']) {
  return memberFieldDefs
    .filter((def) => !def.roles || def.roles.includes(role))
    .map((def) => (def.key === 'teamId' && role === 'team_leader' ? { ...def, optional: true } : def))
}

export function personFields(member: Partial<Member> & { role: Member['role'] }, teams: Team[]): Field[] {
  return memberDefs(member.role).map((def) => {
    let value = String(member[def.key] ?? '')
    if (def.key === 'role') value = roleToLabel[member.role]
    if (def.key === 'teamId') value = teams.find((t) => t.id === member.teamId)?.name ?? ''
    const options = def.key === 'teamId' ? [...teams.map((t) => t.name), 'Not assigned'] : def.key === 'role' ? ['Contestant', 'Observer'] : def.options
    const { key: _key, roles: _roles, ...field } = def
    return { ...field, value, options }
  })
}

/** Required fields that are still empty. */
export function missingPersonFields(member: Partial<Member> & { role: Member['role'] }) {
  return memberDefs(member.role).filter((def) => !def.optional && def.key !== 'role' && !String(member[def.key] ?? '').trim())
}

/** The signed guardian consent form for this person, if one was uploaded. */
export const consentFor = (member: Member, attachments: Attachment[]) => attachments.find((a) => a.kind === 'guardian_consent' && a.memberId === member.id)

/** Everything still needed for this person: empty details, plus the consent form when the policy asks for one. */
export function personGaps(member: Member, attachments: Attachment[]) {
  const gaps = missingPersonFields(member).map((f) => f.label)
  if (member.needsGuardianConsent && !consentFor(member, attachments)) gaps.push('Guardian consent form')
  return gaps
}

export function personRecord(member: Member, teams: Team[], attachments: Attachment[]): PortalRecord {
  const missing = personGaps(member, attachments)
  const team = teams.find((t) => t.id === member.teamId)
  return {
    id: member.id,
    label: member.displayName,
    meta: member.role === 'team_leader' ? 'Team Leader' : member.role === 'observer' ? 'Observer' : `Contestant${team ? ` · ${team.name}` : ''}`,
    status: missing.length ? 'attention' : 'complete',
    issue: missing.length ? (missing.length === 1 ? `${missing[0]} missing` : `${missing.length} details missing`) : undefined,
    fields: personFields(member, teams),
  }
}

/** Reads the person form back into member columns. Empty strings clear a value. */
export function personPayload(form: FormData, role: Member['role'], teams: Team[]) {
  const payload: Record<string, string | null> = {}
  for (const def of memberDefs(role)) {
    const raw = String(form.get(def.label) ?? '').trim()
    if (def.key === 'role') { if (raw) payload.role = labelToRole[raw] ?? role; continue }
    if (def.key === 'teamId') { payload.teamId = teams.find((t) => t.name === raw)?.id ?? null; continue }
    payload[def.key] = raw || null
  }
  return payload
}

export function teamRecord(team: Team, data: DelegationData): PortalRecord {
  const contestants = data.members.filter((m) => m.teamId === team.id && m.role === 'contestant').map((m) => m.badgeName || m.displayName)
  return {
    id: team.id,
    label: team.name,
    meta: `${contestants.length} ${contestants.length === 1 ? 'contestant' : 'contestants'}`,
    status: team.contestLanguage ? 'complete' : 'attention',
    issue: team.contestLanguage ? undefined : 'Working language missing',
    facts: [
      { label: 'Team code', value: team.code },
      { label: 'Team Leader', value: data.delegation.primaryTeamLeaderName, help: 'From the Team Leader account.' },
      { label: 'Contestants', value: contestants.join(', ') || 'None assigned yet' },
    ],
    fields: [
      { label: 'Team name', value: team.name },
      { label: 'Team contest language', value: team.contestLanguage ?? '', kind: 'select', help: 'One language per team. Changes close before the contest.' },
    ],
  }
}

const tripFacts = {
  arrival: [
    { label: 'Meeting point', value: 'Sent after you submit flights' },
    { label: 'Pickup group', value: 'Assigned by the transport team' },
    { label: 'Volunteer contact', value: 'Shown to you during arrival week' },
    { label: 'Changes', value: 'Open: update flight times until the travel deadline' },
  ],
  departure: [
    { label: 'Hotel pickup time', value: 'Sent after departure planning' },
    { label: 'Bus group', value: 'Assigned by the transport team' },
    { label: 'Boarding check', value: 'Recorded by staff on departure day' },
    { label: 'Changes', value: 'Open: update flight times until the travel deadline' },
  ],
}

export function tripRecord(direction: 'arrival' | 'departure', trip: TravelRecord | undefined, members: Member[]): PortalRecord {
  const pointLabel = direction === 'arrival' ? 'Arrival point' : 'Departure point'
  const people = members.map((m) => m.displayName)
  const chosen = (trip?.memberIds ?? []).map((id) => members.find((m) => m.id === id)?.displayName).filter(Boolean)
  const complete = Boolean(trip?.travelPoint && trip.flightServiceNumber && trip.localDate && trip.localTime)
  return {
    id: trip?.id ?? `new-${direction}`,
    label: direction === 'arrival' ? 'Arrival' : 'Departure',
    meta: complete ? `${trip!.flightServiceNumber} · ${trip!.localDate}` : 'Add after booking',
    status: complete ? 'complete' : 'later',
    issue: trip && !complete ? 'Incomplete' : undefined,
    facts: tripFacts[direction],
    fields: [
      { label: pointLabel, value: trip?.travelPoint ?? '', kind: 'select' },
      { label: 'Flight or service number', value: trip?.flightServiceNumber ?? '' },
      { label: 'Date', value: trip?.localDate ?? '', kind: 'date', help: 'Bangkok local date.' },
      { label: 'Time', value: trip?.localTime?.slice(0, 5) ?? '', kind: 'time', help: 'Bangkok local time.' },
      ...(direction === 'arrival' ? [{ label: 'Airport terminal', value: trip?.terminal ?? '', kind: 'select' as const, optional: true }] : []),
      { label: 'People on this trip', value: chosen.join(', '), kind: 'checkboxes', options: people },
    ],
  }
}

export function tripPayload(form: FormData, direction: 'arrival' | 'departure', members: Member[]) {
  const names = form.getAll('People on this trip').map(String)
  return {
    direction,
    travelPoint: String(form.get(direction === 'arrival' ? 'Arrival point' : 'Departure point') ?? '') || null,
    flightServiceNumber: String(form.get('Flight or service number') ?? '') || null,
    localDate: String(form.get('Date') ?? '') || null,
    localTime: String(form.get('Time') ?? '') || null,
    terminal: String(form.get('Airport terminal') ?? '') || null,
    peopleIds: members.filter((m) => names.includes(m.displayName)).map((m) => m.id),
  }
}

/** The welfare summary is built from people's records; nobody retypes it. */
function guardianConsentFact(members: Member[], policy: GuardianConsentPolicy, attachments: Attachment[]) {
  if (!policy.required) return { label: 'Guardian consent', value: 'Not required at the moment', help: 'The organisers will tell you if this changes.' }
  const minors = members.filter((m) => m.needsGuardianConsent)
  const done = minors.filter((m) => consentFor(m, attachments)).length
  return {
    label: 'Guardian consent',
    value: minors.length ? `${done} of ${minors.length} forms uploaded` : 'Nobody needs one',
    help: `Required for contestants under ${policy.ageThreshold} on ${new Date(`${policy.referenceDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Upload each form on the person’s record.`,
  }
}

export function welfareFacts(members: Member[], policy: GuardianConsentPolicy, attachments: Attachment[]) {
  const contestants = members.filter((m) => m.role === 'contestant')
  const male = contestants.filter((m) => m.genderForRoomAllocation === 'Male').length
  const female = contestants.filter((m) => m.genderForRoomAllocation === 'Female').length
  const singles = members.filter((m) => m.roomTypePreference === 'Single if available').map((m) => m.displayName)
  const diets = members.map((m) => m.foodAllergyNotes).filter((f): f is string => Boolean(f && !/no restrictions/i.test(f)))
  const medical = members.map((m) => m.medicalAccessibilityNotes).filter((m): m is string => Boolean(m && !/no special requirements/i.test(m)))
  return [
    { label: 'Rooming', value: `${male} male and ${female} female contestants`, help: 'Contestants share same-gender rooms. Team Leaders and observers get single rooms.' },
    { label: 'Single-room requests', value: singles.join(', ') || 'None', help: 'A single room may carry a supplement or need approval.' },
    { label: 'Room sharing', value: 'Same team preferred', help: 'Arranged by the accommodation team.' },
    { label: 'Food', value: diets.length ? diets.join(' · ') : 'No restrictions reported', help: 'Taken from each person’s food and allergy notes.' },
    { label: 'Medical and accessibility', value: medical.length ? medical.join(' · ') : 'Nothing reported' },
    guardianConsentFact(members, policy, attachments),
    { label: 'Who can see this', value: 'Welfare, food and check-in staff only', help: 'Access is limited by role under Thailand’s PDPA.' },
    { label: 'How long it is kept', value: 'Deleted after the event', help: 'The exact retention period is awaiting approval.' },
  ]
}
