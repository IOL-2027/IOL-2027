// Thin client for the registration API. The site and API share an origin (Vite proxy locally,
// Firebase Hosting rewrite in the cloud), so the session cookie travels automatically.

export type Role =
  | 'team_leader' | 'participant' | 'registration_admin' | 'finance_admin' | 'checkin_staff'
  | 'welfare_staff' | 'content_editor' | 'results_staff' | 'viewer' | 'super_admin'

export type User = {
  id: string
  email: string
  fullName: string
  role: Role
  memberId: string | null
  emailVerified: boolean
  delegationId?: string | null
  country?: string | null
}

export type FeeLine = { key: string; label: string; detail: string; amount: number | null }
/** dueDate is when an invoice at this tier must be paid: the last early-bird day, or the last day of registration. */
export type Fees = { tier: string; tierLabel: string; currency: string; lines: FeeLine[]; total: number; observersPending: boolean; dueDate: string }

export type Team = { id: string; name: string; code: string; contestLanguage: string | null; status: string }
export type Member = {
  id: string; role: 'contestant' | 'team_leader' | 'observer'; teamId: string | null
  observerCategory: string | null; displayName: string; badgeName: string | null; officialName: string | null
  passportName?: string | null; passportNumber?: string | null; passportNationality: string | null; dateOfBirth?: string | null
  genderForRoomAllocation: string | null; examLanguage: string | null; tshirtSize: string | null; poloSize: string | null
  foodAllergyNotes?: string | null; medicalAccessibilityNotes?: string | null; emergencyContact?: string | null
  roomTypePreference: string | null; email: string | null
  /** Set by the server from the guardian consent policy and the date of birth. */
  needsGuardianConsent?: boolean
}
export type TravelRecord = {
  id: string; direction: 'arrival' | 'departure'; travelPoint: string | null; flightServiceNumber: string | null
  localDate: string | null; localTime: string | null; terminal: string | null; memberIds: string[]
}
export type Payment = {
  id: string; status: 'awaiting_proof' | 'awaiting_review' | 'approved' | 'rejected' | 'refunded'
  paymentReference: string; amountDue: string; invoiceCount: number; invoiceSplitNote: string | null
  invoiceRecipientName: string | null; invoiceRecipientAddress: string | null; invoiceRecipientTin: string | null; invoiceNumber: string | null
  reviewNote: string | null; proofAttachmentId: string | null; feeTier: string; currency: string
  receiptNumber: string | null; reviewedAt: string | null
}
export type Delegation = {
  id: string; countryTerritory: string; accreditedOrganisation: string | null; primaryTeamLeaderName: string
  teamLeaderEmail: string; numberOfTeams: number; numberOfObservers: number; registrationStatus: string
  paymentStatus: string; declaredArrivalDate: string | null; declaredDepartureDate: string | null
  stayWindowNote: string | null; welfareNote: string | null; contestantRoomType: string | null; completedSteps: string[]; submittedAt: string | null
}
export type Attachment = { id: string; memberId: string | null; kind: string; originalFilename: string; mimeType: string; createdAt: string }
export type GuardianConsentPolicy = { required: boolean; ageThreshold: number; referenceDate: string }
export type FeeSettings = {
  currency: string; earlyBirdEnds: string; registrationEnds: string; teamFee: { early_bird: number; normal: number }
  roomsPerTeam: number; roomRate: number; observerFee: number | null
}
/** The account invoices ask for. Null until Finance enters it in the back office. */
export type BankDetails = { beneficiaryName: string; beneficiaryAddress: string; bankName: string; bankAddress: string; accountNumber: string; swiftCode: string }
export type InvoiceSettings = { issuerName: string; issuerTin: string; issuerAddress: string; bank: BankDetails | null }
export type DelegationData = {
  delegation: Delegation; fees: Fees; teams: Team[]; members: Member[]; travelRecords: TravelRecord[]
  payments: Payment[]; attachments: Attachment[]; guardianConsent: GuardianConsentPolicy; bank: BankDetails | null
}

export class ApiError extends Error {
  /** `data` is the whole error body, for answers that carry more than a message (e.g. a used invitation code). */
  constructor(message: string, readonly status: number, readonly missing?: string[], readonly data?: Record<string, unknown>) {
    super(message)
  }
}

type Options = { method?: string; body?: unknown; form?: FormData }

export async function api<T>(path: string, { method = 'GET', body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-IOL-Request': '1' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(path, { method, headers, credentials: 'same-origin', body: form ?? (body === undefined ? undefined : JSON.stringify(body)) })
  } catch {
    throw new ApiError('Could not reach the registration server. Check your connection and try again.', 0)
  }
  if (response.status === 204) return undefined as T
  const type = response.headers.get('content-type') ?? ''
  // The public site has no API behind it: Firebase answers /api with the HTML app shell.
  if (!type.includes('application/json')) throw new ApiError('The registration server is not available here.', 503)
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error ?? 'Something went wrong.', response.status, data.missing, data)
  return data as T
}

export const roleLabel: Record<Role, string> = {
  team_leader: 'Team Leader', participant: 'Participant', registration_admin: 'Registration admin',
  finance_admin: 'Finance admin', checkin_staff: 'Check-in staff', welfare_staff: 'Welfare staff',
  content_editor: 'Content editor', results_staff: 'Results staff', viewer: 'Viewer', super_admin: 'Super admin',
}
