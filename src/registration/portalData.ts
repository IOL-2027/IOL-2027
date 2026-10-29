// Static content for the Team Leader portal: section copy, select options and field shapes.
// Live data (people, teams, fees, payments) comes from the registration API; see live.ts.

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
  records?: { noun: string; plural: string }
}

export const programmeWindow = { first: '2027-07-21', last: '2027-07-28' }

export const selectOptions: Record<string, string[]> = {
  'Number of teams': ['1', '2'],
  'Team contest language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'Gender for room allocation': ['Female', 'Male', 'Non-binary', 'Prefer to discuss with the organisers'],
  'Exam language': ['English', 'French', 'German', 'Russian', 'Spanish', 'Arabic', 'Chinese', 'Other'],
  'T-shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Polo shirt size': ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Room type preference': ['Twin/shared room (ห้องคู่)', 'Single room (ห้องเดี่ยว)', 'No preference'],
  'Single room': ['No, share a room', 'Yes, a single room'],
  'T-shirt style': ['Unisex (standard)', 'Ladies fit'],
  'Observer category': ['Regular observer', 'Guest observer', 'Observer pending approval'],
  'Arrival point': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)', 'Bangkok railway station', 'Other'],
  'Departure point': ['Suvarnabhumi Airport (BKK)', 'Don Mueang Airport (DMK)', 'Bangkok railway station', 'Other'],
  'Airport terminal': ['Main terminal', 'Domestic terminal', 'International terminal', 'Not sure'],
}

/** People fields are shown in these groups, in this order. Unlisted fields go last. */
export const personFieldGroups: { legend: string; note?: string; labels: string[] }[] = [
  { legend: 'Role and names', labels: ['Role', 'Team assignment', 'Observer category', 'Display name', 'Badge name', 'Official name', 'Email'] },
  { legend: 'Passport', note: 'Only used to match travel and hotel records.', labels: ['Passport name', 'Passport number', 'Passport nationality', 'Date of birth'] },
  { legend: 'Contest and stay', labels: ['Exam language', 'Gender for room allocation', 'Single room', 'T-shirt size', 'Polo shirt size', 'T-shirt style'] },
  { legend: 'Welfare and safety', note: 'Seen only by the welfare, food and check-in teams.', labels: ['Food and allergy notes', 'Medical or accessibility notes', 'Emergency contact'] },
]

export const sections: Section[] = [
  { id: 'start', title: 'Before you begin', required: false, intro: 'Registration happens in stages. You only need the team count to start; names and travel can come later.' },
  { id: 'setup', title: 'Team and observers', required: true, intro: 'These two numbers set your fees. Names are not needed yet.' },
  { id: 'payment', title: 'Payment', required: true, intro: 'Check the amount, tell us how to invoice you, transfer, then upload the bank’s proof of transfer.' },
  { id: 'teams', title: 'Teams', required: true, intro: 'Each team needs a contest working language. Contestants are assigned on each person’s record.', records: { noun: 'team', plural: 'teams' } },
  { id: 'people', title: 'People', required: true, intro: 'Contestants and observers. Opens once proof of payment is uploaded, and can be completed in stages.', records: { noun: 'person', plural: 'people' } },
  { id: 'welfare', title: 'Rooms and welfare', required: true, intro: 'A summary built from each person’s record. Check it reads correctly; edit the person if it does not.' },
  { id: 'travel', title: 'Travel', required: true, intro: 'Your stay dates set the hotel nights we reserve, so they are needed now. Flights can wait until they are booked. Once everyone’s arrival and departure are in and the payment is confirmed, we email you everyone’s badges.', records: { noun: 'trip', plural: 'trips' } },
  {
    id: 'review', title: 'Review and submit', required: false,
    intro: 'Submit once every step is done. You can still update travel and people afterwards until the change deadline.',
    facts: [
      { label: 'Invitation letters', value: 'Sent after payment is confirmed', help: 'Each person’s letter supports their visa application.' },
      { label: 'Invoice', value: 'Emailed to you as a PDF when you submit' },
      { label: 'E-receipt', value: 'In the Payment step once Finance approves the payment', help: 'The payment confirmation email links to it.' },
      { label: 'QR badges', value: 'Emailed to you as PDFs once payment is confirmed and everyone’s travel is in' },
      { label: 'Arrival check-in', value: 'Recorded at the venue during event week' },
    ],
  },
  {
    id: 'badges', title: 'Badges and check-in', required: false, afterSubmission: true,
    intro: 'Every registered person gets their own QR badge. Staff scan it on arrival and at event checkpoints.',
    facts: [
      { label: 'What the QR holds', value: 'A random badge reference only', help: 'No name, passport or other personal data is encoded.' },
      { label: 'When badges are issued', value: 'When everything is in', help: 'Registration submitted, payment confirmed and every person’s arrival and departure added. The Team Leader gets an email with each person’s badge as a PDF, exactly as it will be printed, and a new set the next morning whenever a name, team or QR changes.' },
      { label: 'Where it is scanned', value: 'Arrival desk and event checkpoints', help: 'Each scan records the checkpoint, time and result.' },
    ],
  },
]
