// Static content for the national representative portal: section copy, select options and field shapes.
// Live data (people, teams, fees, payments) comes from the registration API; see live.ts.

export type FieldKind = 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkboxes' | 'radio' | 'upload'

export type Field = {
  label: string
  value: string
  help?: string
  kind?: FieldKind
  options?: string[]
  optional?: boolean
  /** A select whose "Other" asks which, in words (languages beyond the list). */
  other?: boolean
  /** Shown but not changed: a field locked by a deadline. */
  disabled?: boolean
  /** Earliest and latest dates a date field takes. */
  min?: string
  max?: string
  /** Checkbox options that cannot be ticked here, with why (someone already on another flight). */
  unavailable?: Record<string, string>
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
  /** Every detail still needed, for the editor's "Still needed" line. */
  missing?: string[]
  fields: Field[]
  facts?: Fact[]
}

export type SectionId = 'start' | 'setup' | 'payment' | 'teams' | 'people' | 'welfare' | 'travel' | 'submit' | 'badges'

export type Section = {
  id: SectionId
  title: string
  intro: string
  /** Must be finished before submission. */
  required: boolean
  /** Sections used only after the registration is submitted. */
  afterSubmission?: boolean
  facts?: Fact[]
  records?: { noun: string; plural: string }
}

export const programmeWindow = { first: '2027-07-21', last: '2027-07-28' }

export const selectOptions: Record<string, string[]> = {
  'Number of teams': ['1', '2'],
  'Team contest language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'Gender for room allocation': ['Female', 'Male', 'Non-binary', 'Prefer to discuss with the organisers'],
  'Individual contest language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'T-shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Polo shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Single room': ['No, share a room', 'Yes, a single room'],
  'T-shirt style': ['Unisex (standard)', 'Ladies fit'],
  'Observer category': ['Regular observer', 'Guest observer', 'Observer pending approval'],
  // Airport pickup and drop-off are from these two airports only (IOL Board, 16 Nov 2026).
  'Arrival airport': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)'],
  'Departure airport': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)'],
}

/** People fields are shown in these groups, in this order. Unlisted fields go last. */
export const personFieldGroups: { legend: string; note?: string; labels: string[] }[] = [
  { legend: 'Role and names', labels: ['Role', 'Team assignment', 'Observer category', 'Display name', 'Badge name', 'Official name', 'Email'] },
  { legend: 'Passport', note: 'Only used to match travel and hotel records.', labels: ['Passport name', 'Passport number', 'Passport nationality', 'Date of birth'] },
  { legend: 'Contest and stay', labels: ['Individual contest language', 'Gender for room allocation', 'T-shirt size', 'Polo shirt size', 'T-shirt style'] },
  { legend: 'Food', note: 'Seen only by the organising team and the caterers.', labels: ['Food', 'Food details'] },
  { legend: 'Welfare and safety', note: 'Seen only by the organising team, to keep everyone safe.', labels: ['Medical or accessibility notes', 'Emergency contact'] },
  { legend: 'Photos and videos', labels: ['Photos and videos'] },
]

export const sections: Section[] = [
  { id: 'start', title: 'Before you begin', required: false, intro: 'Registration happens in stages. To start you only need to know how many are coming; names and travel can follow.' },
  { id: 'setup', title: 'Team and observers', required: true, intro: 'Who registers your country and who leads each team, how many teams are coming, whether each brings an observer, and who would like a single room. This sets your fees; the other names come later, in People.' },
  { id: 'payment', title: 'Payment', required: true, intro: 'Four parts, in this order. Your invoice details are kept once saved, so you can transfer later and come back to upload the proof.' },
  { id: 'teams', title: 'Teams', required: true, intro: 'Each team needs its team contest language. Contestants are put in a team on their own record in People.', records: { noun: 'team', plural: 'teams' } },
  { id: 'people', title: 'People', required: true, intro: 'Everyone coming with your delegation. Each person is saved on their own, so you can fill this in stages. Opens once the proof of payment is uploaded.', records: { noun: 'person', plural: 'people' } },
  { id: 'welfare', title: 'Rooms and welfare', required: true, intro: 'Check what the welfare team will see about your delegation, and tell them about any room requests.' },
  { id: 'travel', title: 'Travel', required: true, intro: 'Each person’s arrival and departure, added once flights are booked. Once everyone’s are in and the payment is confirmed, we email you everyone’s badges.', records: { noun: 'trip', plural: 'trips' } },
  { id: 'submit', title: 'Submit', required: false, intro: 'Where every step stands, and anything still missing. Once steps 1 to 6 are done, you submit your registration here.' },
  {
    id: 'badges', title: 'Badges and check-in', required: false, afterSubmission: true,
    intro: 'Every registered person gets their own QR badge. Staff scan it on arrival and at event checkpoints.',
    facts: [
      { label: 'What the QR holds', value: 'A random badge reference only', help: 'No name, passport or other personal data is encoded.' },
      { label: 'When badges are issued', value: 'When everything is in', help: 'Registration submitted, payment confirmed and every person’s arrival and departure added. The national representative gets an email with each person’s badge as a PDF, exactly as it will be printed, and a new set the next morning whenever a name, team or QR changes.' },
      { label: 'Where it is scanned', value: 'Arrival desk and event checkpoints', help: 'Each scan records the checkpoint, time and result.' },
    ],
  },
]
