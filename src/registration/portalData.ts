// Demo data for the Team Leader portal prototype.
// Phase B replaces this module with data loaded from the registration API; the portal
// component only depends on the shapes exported here.

export type FieldKind = 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkboxes' | 'upload'

export type Field = {
  label: string
  value: string
  help?: string
  kind?: FieldKind
  options?: string[]
  optional?: boolean
}

/** Something the system already knows. Shown as text, never as an input. */
export type Fact = { label: string; value: string; help?: string }

export type RecordStatus = 'complete' | 'attention' | 'later'

export type PortalRecord = {
  id: string
  label: string
  meta: string
  status: RecordStatus
  /** Why the record needs attention, in plain words. */
  issue?: string
  fields: Field[]
  facts?: Fact[]
}

export type SectionId = 'start' | 'setup' | 'payment' | 'teams' | 'people' | 'welfare' | 'travel' | 'review' | 'badges'

export type Section = {
  id: SectionId
  title: string
  intro: string
  /** Counts towards "steps done" and must be finished before submission. */
  required: boolean
  /** Sections used only after the registration is submitted. */
  afterSubmission?: boolean
  facts?: Fact[]
  fields?: Field[]
  records?: { noun: string; plural: string; items: PortalRecord[] }
}

export const delegation = {
  country: 'Thailand',
  organisation: 'National Linguistics Olympiad Thailand',
  inviteCode: 'IOL2027-THA-7F3K',
  leaderName: 'Dr. Ananya Somchai',
  leaderEmail: 'leader@national-olympiad.org',
}

/** Fee inputs. Amounts are computed from these, never typed as strings. */
export const fees = {
  tier: 'Early bird',
  currency: 'USD',
  teams: 2,
  teamFee: 1000,
  roomsPerTeam: 2,
  roomRate: 220,
  observers: 0,
  observerFee: null as number | null,
  reference: 'THA-IOL2027-001',
}

export const feeLines = [
  { label: 'Team registration', detail: `${fees.teams} teams × ${fees.currency} ${fees.teamFee.toLocaleString('en-US')}`, amount: fees.teams * fees.teamFee },
  { label: 'Accommodation', detail: `${fees.teams} teams × ${fees.roomsPerTeam} rooms × ${fees.currency} ${fees.roomRate}`, amount: fees.teams * fees.roomsPerTeam * fees.roomRate },
  { label: 'Observers', detail: fees.observers ? `${fees.observers} observers, rate to be confirmed` : 'None declared', amount: null as number | null },
]
export const feeTotal = feeLines.reduce((sum, line) => sum + (line.amount ?? 0), 0)

export const programmeWindow = { first: '2027-07-21', last: '2027-07-28' }

export const selectOptions: Record<string, string[]> = {
  'Number of teams': ['1', '2'],
  Role: ['Contestant', 'Team Leader', 'Deputy', 'Observer'],
  'Team assignment': ['Thailand A', 'Thailand B', 'Not assigned'],
  'Team contest language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'Gender for room allocation': ['Female', 'Male', 'Non-binary', 'Prefer to discuss with the organisers'],
  'Exam language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'T-shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Polo shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Room type preference': ['Twin room', 'Single if available', 'No preference'],
  'Observer category': ['Regular observer', 'Guest observer', 'Observer pending approval'],
  'Arrival point': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)', 'Bangkok railway station', 'Other'],
  'Departure point': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)', 'Bangkok railway station', 'Other'],
  'Airport terminal': ['Main terminal', 'Domestic terminal', 'International terminal', 'Not sure'],
  'People on this trip': ['Narin Chaiwat', 'Mali Phan', 'Kiet Rattanakul', 'Arun Songsiri', 'Dr. Ananya Somchai', 'Prof. Preecha K.'],
}

/** People fields are shown in these groups, in this order. Unlisted fields go last. */
export const personFieldGroups: { legend: string; note?: string; labels: string[] }[] = [
  { legend: 'Role and names', labels: ['Role', 'Team assignment', 'Observer category', 'Display name', 'Badge name', 'Official name', 'Email'] },
  { legend: 'Passport', note: 'Only used to match travel and hotel records.', labels: ['Passport name', 'Passport number', 'Passport nationality', 'Date of birth'] },
  { legend: 'Contest and stay', labels: ['Exam language', 'Gender for room allocation', 'Room type preference', 'T-shirt size', 'Polo shirt size'] },
  { legend: 'Welfare and safety', note: 'Seen only by the welfare, food and check-in teams.', labels: ['Food and allergy notes', 'Medical or accessibility notes', 'Emergency contact'] },
]

const shirtHelp = 'Chest: XS 80 cm · S 85 · M 90 · L 95 · XL 100 · 2XL 106 · 3XL 112'

type Person = {
  id: string; name: string; role: string; team: string; badge: string; passportName: string; passport: string
  dob: string; gender: string; shirt: string; food: string; medical: string; emergency: string
  observerCategory?: string; email?: string; room?: string
}

const people: Person[] = [
  { id: 'narin', name: 'Narin Chaiwat', role: 'Contestant', team: 'Thailand A', badge: 'Narin', passportName: 'CHAIWAT NARIN', passport: 'AA1234567', dob: '2009-02-12', gender: 'Male', shirt: 'M', food: 'No shellfish', medical: 'No special requirements', emergency: 'Somchai Chaiwat, +66 82 111 2233' },
  { id: 'mali', name: 'Mali Phan', role: 'Contestant', team: 'Thailand A', badge: 'Mali', passportName: 'PHAN MALI', passport: 'AA7654321', dob: '', gender: 'Female', shirt: 'S', food: 'Vegetarian', medical: 'No special requirements', emergency: 'Nok Phan, +66 82 222 3344' },
  { id: 'kiet', name: 'Kiet Rattanakul', role: 'Contestant', team: 'Thailand A', badge: 'Kiet', passportName: 'RATTANAKUL KIET', passport: 'AA2468101', dob: '2009-06-03', gender: 'Male', shirt: 'M', food: 'No pork', medical: 'Carries an inhaler', emergency: 'Arun Rattanakul, +66 82 333 4455' },
  { id: 'arun', name: 'Arun Songsiri', role: 'Contestant', team: 'Thailand A', badge: 'Arun', passportName: 'SONGSIRI ARUN', passport: 'AA3579246', dob: '2008-11-18', gender: 'Male', shirt: 'L', food: 'No restrictions', medical: 'No special requirements', emergency: 'Malee Songsiri, +66 82 444 5566' },
  { id: 'preecha', name: 'Prof. Preecha K.', role: 'Observer', team: '', badge: 'Prof. Preecha', passportName: 'KITTISAK PREECHA', passport: 'AB7659001', dob: '1975-04-09', gender: 'Male', shirt: 'L', food: 'No pork', medical: 'No special requirements', emergency: 'Maneerat K., +66 81 888 7766', observerCategory: 'Regular observer', email: 'preecha@national-olympiad.org', room: 'Single if available' },
]

function personFields(p: Person): Field[] {
  const isObserver = p.role === 'Observer'
  return [
    { label: 'Role', value: p.role, kind: 'select' },
    ...(isObserver
      ? [{ label: 'Observer category', value: p.observerCategory ?? '', kind: 'select' as const, help: 'Used by Finance to apply the observer rate.' },
        { label: 'Email', value: p.email ?? '', kind: 'email' as const, help: 'Receives their own invitation letter and badge notices.' }]
      : [{ label: 'Team assignment', value: p.team, kind: 'select' as const }]),
    { label: 'Display name', value: p.name, help: 'Shown on programme lists.' },
    { label: 'Badge name', value: p.badge, help: 'Printed large on the lanyard badge. Usually a first or preferred name.' },
    { label: 'Official name', value: p.name, help: 'As it should appear on certificates.' },
    { label: 'Passport name', value: p.passportName, help: 'Exactly as printed in the passport.' },
    { label: 'Passport number', value: p.passport },
    { label: 'Passport nationality', value: 'Thai' },
    { label: 'Date of birth', value: p.dob, kind: 'date', help: isObserver ? undefined : 'Confirms contestant eligibility and whether a guardian consent is needed.' },
    ...(isObserver ? [] : [{ label: 'Exam language', value: 'English', kind: 'select' as const, help: 'Language of the individual contest paper.' }]),
    { label: 'Gender for room allocation', value: p.gender, kind: 'select', help: 'Used only for rooming and safeguarding.' },
    ...(isObserver ? [{ label: 'Room type preference', value: p.room ?? '', kind: 'select' as const, help: 'A single room may carry a supplement.' }] : []),
    { label: 'T-shirt size', value: p.shirt, kind: 'select', help: shirtHelp },
    { label: 'Polo shirt size', value: p.shirt, kind: 'select', help: shirtHelp },
    { label: 'Food and allergy notes', value: p.food, kind: 'textarea', optional: true },
    { label: 'Medical or accessibility notes', value: p.medical, kind: 'textarea', optional: true },
    { label: 'Emergency contact', value: p.emergency, help: 'Name and phone number of someone we can reach during the event.' },
  ]
}

export const peopleRecords: PortalRecord[] = people.map((p) => ({
  id: p.id,
  label: p.name,
  meta: p.role === 'Observer' ? 'Observer' : `Contestant · ${p.team}`,
  status: p.dob ? 'complete' : 'attention',
  issue: p.dob ? undefined : 'Date of birth missing',
  fields: personFields(p),
}))

function welfareFacts(): Fact[] {
  const contestants = people.filter((p) => p.role === 'Contestant')
  const male = contestants.filter((p) => p.gender === 'Male').length
  const female = contestants.filter((p) => p.gender === 'Female').length
  const singles = people.filter((p) => p.room === 'Single if available').map((p) => p.name)
  const diets = people.map((p) => p.food).filter((f) => f && !/no restrictions/i.test(f))
  const medical = people.map((p) => p.medical).filter((m) => m && !/no special requirements/i.test(m))
  return [
    { label: 'Rooming', value: `${male} male and ${female} female contestants`, help: 'Contestants share same-gender rooms. Team Leaders and observers get single rooms.' },
    { label: 'Single-room requests', value: singles.join(', ') || 'None' },
    { label: 'Food', value: diets.length ? diets.join(' · ') : 'No restrictions reported', help: 'Taken from each person’s food and allergy notes.' },
    { label: 'Medical and accessibility', value: medical.length ? medical.join(' · ') : 'Nothing reported' },
    { label: 'Guardian consent', value: 'Policy awaiting organiser decision', help: 'No upload is needed until the organisers confirm the policy.' },
    { label: 'Who can see this', value: 'Welfare, food and check-in staff only', help: 'Access is limited by role under Thailand’s PDPA.' },
  ]
}

export const sections: Section[] = [
  {
    id: 'start', title: 'Before you begin', required: false,
    intro: 'Registration happens in stages. You only need the team count to start; names and travel can come later.',
  },
  {
    id: 'setup', title: 'Team and observers', required: true,
    intro: 'These two numbers set your fees. Names are not needed yet.',
    facts: [
      { label: 'Team Leader', value: `${delegation.leaderName} · ${delegation.leaderEmail}`, help: 'From your verified account.' },
      { label: 'Country', value: `${delegation.country} · set by your invitation code` },
      { label: 'Rooms', value: 'Assigned by the organisers', help: 'Team Leaders and observers get single rooms; contestants share same-gender rooms.' },
    ],
    fields: [
      { label: 'Number of teams', value: '2', kind: 'select', help: 'Up to two teams per country or territory.' },
      { label: 'Number of observers', value: '0', kind: 'number', help: 'Observer fees are added once the organisers confirm the rate.' },
    ],
  },
  {
    id: 'payment', title: 'Payment', required: true,
    intro: 'Check the amount, tell us how to invoice you, transfer, then upload the bank’s proof of transfer.',
    fields: [
      { label: 'Invoice recipient name', value: delegation.organisation, help: 'The organisation named on the invoice.' },
      { label: 'Invoice recipient address', value: '', kind: 'textarea', optional: true, help: 'Only if your institution needs a postal address on the invoice.' },
      { label: 'Number of invoices', value: '1', kind: 'number', help: 'Invoices cannot be split after the transfer.' },
      { label: 'How to split the invoices', value: '', kind: 'textarea', optional: true, help: 'Only for more than one invoice. Example: “National Olympiad Foundation, USD 1,200; University Fund, USD 1,680”.' },
    ],
  },
  {
    id: 'teams', title: 'Teams', required: true,
    intro: 'Each team needs a contest working language. Contestants are assigned on each person’s record.',
    records: {
      noun: 'team', plural: 'teams', items: [
        { id: 'tha-a', label: 'Thailand A', meta: '4 contestants', status: 'complete',
          facts: [{ label: 'Team code', value: 'THA-A' }, { label: 'Contestants', value: 'Narin, Mali, Kiet, Arun' }],
          fields: [{ label: 'Team name', value: 'Thailand A' }, { label: 'Team contest language', value: 'English', kind: 'select', help: 'One language per team. Changes close before the contest.' }] },
        { id: 'tha-b', label: 'Thailand B', meta: '4 contestants', status: 'attention', issue: 'Working language missing',
          facts: [{ label: 'Team code', value: 'THA-B' }, { label: 'Contestants', value: 'Pim, Tawan, Mira, Chanon' }],
          fields: [{ label: 'Team name', value: 'Thailand B' }, { label: 'Team contest language', value: '', kind: 'select', help: 'One language per team. Changes close before the contest.' }] },
      ],
    },
  },
  {
    id: 'people', title: 'People', required: true,
    intro: 'Contestants and observers. Opens once proof of payment is uploaded, and can be completed in stages.',
    records: { noun: 'person', plural: 'people', items: peopleRecords },
  },
  {
    id: 'welfare', title: 'Rooms and welfare', required: true,
    intro: 'A summary built from each person’s record. Check it reads correctly; edit the person if it does not.',
    facts: welfareFacts(),
    fields: [{ label: 'Anything else the welfare team should know', value: '', kind: 'textarea', optional: true }],
  },
  {
    id: 'travel', title: 'Travel', required: true,
    intro: 'Your stay dates set the hotel nights we reserve, so they are needed now. Flights can wait until they are booked.',
    records: {
      noun: 'trip', plural: 'trips', items: [
        { id: 'arrival', label: 'Arrival', meta: 'Add after booking', status: 'later',
          facts: [{ label: 'Meeting point', value: 'Sent after you submit flights' }, { label: 'Pickup group', value: 'Assigned by the transport team' }],
          fields: [
            { label: 'Arrival point', value: '', kind: 'select' },
            { label: 'Flight or service number', value: '' },
            { label: 'Date', value: '', kind: 'date', help: 'Bangkok local date.' },
            { label: 'Time', value: '', kind: 'time', help: 'Bangkok local time.' },
            { label: 'Airport terminal', value: '', kind: 'select', optional: true },
            { label: 'People on this trip', value: '', kind: 'checkboxes' },
          ] },
        { id: 'departure', label: 'Departure', meta: 'Add after booking', status: 'later',
          facts: [{ label: 'Hotel pickup time', value: 'Sent after departure planning' }, { label: 'Bus group', value: 'Assigned by the transport team' }],
          fields: [
            { label: 'Departure point', value: '', kind: 'select' },
            { label: 'Flight or service number', value: '' },
            { label: 'Date', value: '', kind: 'date', help: 'Bangkok local date.' },
            { label: 'Time', value: '', kind: 'time', help: 'Bangkok local time.' },
            { label: 'People on this trip', value: '', kind: 'checkboxes' },
          ] },
      ],
    },
  },
  {
    id: 'review', title: 'Review and submit', required: false,
    intro: 'Submit once every step is done. You can still update travel and people afterwards until the change deadline.',
    facts: [
      { label: 'Invitation letters', value: 'Sent after payment is confirmed', help: 'Each person’s letter supports their visa application.' },
      { label: 'E-receipt', value: 'Emailed after Finance approves the payment' },
      { label: 'QR badges', value: 'Issued once names are final' },
    ],
  },
  {
    id: 'badges', title: 'Badges and check-in', required: false, afterSubmission: true,
    intro: 'Every registered person gets their own QR badge. Staff scan it on arrival and at event checkpoints.',
    facts: [
      { label: 'What the QR holds', value: 'A random badge reference only', help: 'No name, passport or other personal data is encoded.' },
      { label: 'When badges are issued', value: 'After names are final' },
      { label: 'Ready now', value: '4 of 5 badge names' },
    ],
  },
]
