// Converts API data into the portal's records and fields, and form data back into API payloads.
import type { Attachment, DelegationData, GuardianConsentPolicy, Member, Team, TravelRecord } from './api'
import type { Field, PortalRecord } from './portalData'

const shirtHelp = 'Chest: XS 80 cm · S 85 · M 90 · L 95 · XL 100 · 2XL 106 · 3XL 112'

const roleToLabel = { contestant: 'Contestant', observer: 'Observer', team_leader: 'Team Leader' } as const
const labelToRole: Record<string, Member['role']> = { Contestant: 'contestant', Observer: 'observer', 'Team Leader': 'team_leader' }

type MemberFieldDef = Field & { key: keyof Member; roles?: Member['role'][] }

/** Every person field, which member column it maps to, and which roles see it. */
const memberFieldDefs: MemberFieldDef[] = [
  { key: 'role', label: 'Role', value: '', kind: 'select', roles: ['contestant', 'observer', 'team_leader'] },
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
  { key: 'examLanguage', label: 'Individual contest language', value: '', kind: 'select', other: true, roles: ['contestant'], help: 'The language of their individual contest paper.' },
  { key: 'genderForRoomAllocation', label: 'Gender for room allocation', value: '', kind: 'select', help: 'Used only for rooming and safeguarding.' },
  { key: 'tshirtSize', label: 'T-shirt size', value: '', kind: 'select', help: shirtHelp },
  { key: 'poloSize', label: 'Polo shirt size', value: '', kind: 'select', help: shirtHelp },
  // Required, so a blank is never mistaken for "nothing to tell": "None" is an answer.
  { key: 'foodAllergyNotes', label: 'Food and allergy notes', value: '', kind: 'textarea', help: 'Diet, allergies and how serious they are. Write “None” if there is nothing.' },
  { key: 'medicalAccessibilityNotes', label: 'Medical or accessibility notes', value: '', kind: 'textarea', help: 'Conditions, medicines or access needs the organisers should know about. Write “None” if there is nothing.' },
  { key: 'emergencyContact', label: 'Emergency contact', value: '', help: 'Name and phone number of someone we can reach during the event.' },
]

/**
 * Who this person is among the delegation's Team Leaders. The account's own Team Leader (primary) keeps that role;
 * with two teams, one more person may be the second team's Team Leader (canLead).
 */
export type LeaderSlots = { primary?: boolean; canLead?: boolean }

/** A Team Leader may lead both teams, so their team assignment is optional. */
function memberDefs(role: Member['role'], slots: LeaderSlots = {}) {
  return memberFieldDefs
    .filter((def) => (!def.roles || def.roles.includes(role)) && !(def.key === 'role' && slots.primary))
    .map((def) => (def.key === 'teamId' && role === 'team_leader' ? { ...def, optional: true, help: 'Leave it empty if you lead both teams.' } : def))
}

export function personFields(member: Partial<Member> & { role: Member['role'] }, teams: Team[], slots: LeaderSlots = {}): Field[] {
  return memberDefs(member.role, slots).map((def) => {
    let value = String(member[def.key] ?? '')
    if (def.key === 'role') value = roleToLabel[member.role]
    if (def.key === 'teamId') value = teams.find((t) => t.id === member.teamId)?.name ?? ''
    const roles = ['Contestant', 'Observer', ...(slots.canLead || member.role === 'team_leader' ? ['Team Leader'] : [])]
    const options = def.key === 'teamId' ? [...teams.map((t) => t.name), 'Not assigned'] : def.key === 'role' ? roles : def.options
    const help = def.key === 'role' && roles.includes('Team Leader') ? 'With two teams, the second team may have its own Team Leader, included in its fee.' : def.help
    const { key: _key, roles: _roles, ...field } = def
    return { ...field, value, options, help }
  })
}

/** Required fields that are still empty. */
export function missingPersonFields(member: Partial<Member> & { role: Member['role'] }) {
  return memberDefs(member.role, { primary: true }).filter((def) => !def.optional && !String(member[def.key] ?? '').trim())
}

/** The signed guardian consent form for this person, if one was uploaded. */
export const consentFor = (member: Member, attachments: Attachment[]) => attachments.find((a) => a.kind === 'guardian_consent' && a.memberId === member.id)

/** Everything still needed for this person: empty details, plus the consent form when the policy asks for one. */
export function personGaps(member: Member, attachments: Attachment[]) {
  const gaps = missingPersonFields(member).map((f) => f.label)
  if (member.needsGuardianConsent && !consentFor(member, attachments)) gaps.push('Guardian consent form')
  return gaps
}

export function personRecord(member: Member, teams: Team[], attachments: Attachment[], slots: LeaderSlots = {}): PortalRecord {
  const missing = personGaps(member, attachments)
  const team = teams.find((t) => t.id === member.teamId)
  // Team Leaders' and observers' single rooms are chosen in Team and observers and copied here in order (the server's
  // syncSingleRooms), so the record shows the answer instead of asking again.
  const room = member.role === 'contestant' ? undefined
    : [{ label: 'Single room', value: member.roomTypePreference === 'single' ? 'Yes' : member.roomTypePreference === 'shared' ? 'No, shares a twin room' : 'Not chosen yet', help: 'Chosen in Team and observers. Change it there.' }]
  return {
    id: member.id,
    label: member.displayName,
    meta: `${roleToLabel[member.role]}${team && member.role !== 'observer' ? ` · ${team.name}` : ''}`,
    status: missing.length ? 'attention' : 'complete',
    issue: missing.length ? (missing.length === 1 ? `${missing[0]} missing` : `${missing.length} details missing`) : undefined,
    missing,
    facts: room,
    fields: personFields(member, teams, slots),
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
  // The Team Leader assigned to this team in People, or the one who leads both (no team assigned).
  const leaders = data.members.filter((m) => m.role === 'team_leader')
  const leader = leaders.find((m) => m.teamId === team.id) ?? leaders.find((m) => !m.teamId)
  return {
    id: team.id,
    label: team.name,
    meta: `${contestants.length} ${contestants.length === 1 ? 'contestant' : 'contestants'}`,
    status: team.contestLanguage ? 'complete' : 'attention',
    issue: team.contestLanguage ? undefined : 'Contest language missing',
    facts: [
      { label: 'Team code', value: team.code },
      { label: 'Team Leader', value: leader?.displayName ?? 'Not assigned yet', help: leader ? undefined : 'Assign one in People.' },
      { label: 'Contestants', value: contestants.join(', ') || 'None assigned yet', help: contestants.length ? undefined : 'Assign contestants to this team in People.' },
    ],
    fields: [
      { label: 'Team name', value: team.name },
      { label: 'Team contest language', value: team.contestLanguage ?? '', kind: 'select', other: true, help: 'One language for the whole team’s paper.' },
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

/** One arrival or departure. `number` tells several trips in the same direction apart (Arrival 1, Arrival 2). */
export function tripRecord(direction: 'arrival' | 'departure', trip: TravelRecord | undefined, members: Member[], number?: number): PortalRecord {
  const pointLabel = direction === 'arrival' ? 'Arrival point' : 'Departure point'
  const people = members.map((m) => m.displayName)
  const chosen = (trip?.memberIds ?? []).map((id) => members.find((m) => m.id === id)?.displayName).filter(Boolean)
  const complete = Boolean(trip?.travelPoint && trip.flightServiceNumber && trip.localDate && trip.localTime)
  return {
    id: trip?.id ?? `new-${direction}`,
    label: `${direction === 'arrival' ? 'Arrival' : 'Departure'}${number ? ` ${number}` : ''}`,
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
      { label: 'People on this trip', value: chosen.join(', '), kind: 'checkboxes', options: people, help: 'Everyone on this flight. Anyone on a different flight goes on a trip of their own.' },
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

// "Name: note" for every note worth reading, so the Team Leader can check whose it is.
const notesOf = (members: Member[], key: 'foodAllergyNotes' | 'medicalAccessibilityNotes') => members
  .filter((m) => m[key] && !/^(none|no|n\/a|-|no restrictions|no special requirements)\.?$/i.test(m[key]!.trim()))
  .map((m) => `${m.badgeName || m.displayName}: ${m[key]!.trim()}`)

export function welfareFacts({ members, guardianConsent, attachments, feeRules }: DelegationData) {
  const contestants = members.filter((m) => m.role === 'contestant')
  const male = contestants.filter((m) => m.genderForRoomAllocation === 'Male').length
  const female = contestants.filter((m) => m.genderForRoomAllocation === 'Female').length
  const others = contestants.length - male - female
  const singles = members.filter((m) => m.role !== 'contestant' && m.roomTypePreference === 'single').map((m) => m.displayName)
  const diets = notesOf(members, 'foodAllergyNotes')
  const medical = notesOf(members, 'medicalAccessibilityNotes')
  return [
    { label: 'Contestants’ rooms', value: `${male} male, ${female} female${others ? `, ${others} other or not given` : ''}`, help: 'Contestants share twin rooms with someone of the same gender, from their own country where possible.' },
    { label: 'Single rooms', value: singles.join(', ') || 'None', help: `For Team Leaders and observers, USD ${feeRules.singleRoomFee.toLocaleString('en-US')} each. Chosen in Team and observers.` },
    { label: 'Food', value: diets.length ? diets.join(' · ') : 'Nothing reported', help: 'From each person’s food and allergy notes.' },
    { label: 'Medical and accessibility', value: medical.length ? medical.join(' · ') : 'Nothing reported', help: 'From each person’s medical or accessibility notes.' },
    guardianConsentFact(members, guardianConsent, attachments),
    { label: 'Who can see this', value: 'The organising team only', help: 'Handled under Thailand’s Personal Data Protection Act (PDPA); every download is logged.' },
    { label: 'How long it is kept', value: 'Deleted after the event', help: 'The exact date will be announced.' },
  ]
}
