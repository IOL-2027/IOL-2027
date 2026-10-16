// Thin API client for the IOL 2027 registration backend.
// Set VITE_MOCK_API=true in .env to enable in-memory mock (no backend needed).

export type Invite = {
  id: string
  code: string
  countryTerritory: string
  accreditedOrganisation: string | null
  contactEmail: string | null
  maxTeams: number
  status: string
}

export type Account = {
  id: string
  email: string
  fullName: string
  emailVerifiedAt: string | null
}

export type Delegation = {
  id: string
  accountId: string
  countryTerritory: string
  accreditedOrganisation: string | null
  primaryTeamLeaderName: string
  teamLeaderEmail: string
  mobileWhatsapp: string | null
  numberOfTeams: number
  numberOfContestants: number
  numberOfObservers: number
  adultRoomPreference: string
  registrationStatus: string
  paymentStatus: string
  travelStatus: string
  declaredArrivalDate: string | null
  declaredDepartureDate: string | null
  stayWindowNote: string | null
  submittedAt: string | null
}

export type Member = {
  id: string
  delegationId: string
  teamId: string | null
  role: string
  observerCategory: string | null
  displayName: string
  badgeName: string | null
  officialName: string
  passportName: string | null
  passportNumber: string | null
  passportNationality: string | null
  dateOfBirth: string | null
  genderForRoomAllocation: string | null
  examLanguage: string | null
  tshirtSize: string | null
  tshirtStyle: string | null
  wantsUmbrella: boolean | null
  roomTypePreference: string | null
  foodAllergyNotes: string | null
  medicalAccessibilityNotes: string | null
  emergencyContact: string | null
  email: string | null
  mobileWhatsapp: string | null
}

export type Team = {
  id: string
  delegationId: string
  name: string
  code: string
  contestLanguage: string | null
  status: string
}

export type Payment = {
  id: string
  delegationId: string
  feeTier: string
  currency: string
  amountDue: string
  paymentReference: string
  status: string
  invoiceCount: number
}

export type Attachment = {
  id: string
  delegationId: string
  kind: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

export type DelegationFull = {
  delegation: Delegation
  teams: Team[]
  members: Member[]
  travelRecords: unknown[]
  payments: Payment[]
  attachments: Attachment[]
  badges: unknown[]
  checkIns: unknown[]
}

// ─── Real HTTP client ─────────────────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isFormData = body instanceof FormData
  const res = await fetch(`/api${path}`, {
    method,
    headers: isFormData ? undefined : body ? { 'Content-Type': 'application/json' } : undefined,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed')
  return data as T
}

// ─── Mock implementation ──────────────────────────────────────────────────────

const MOCK = import.meta.env.VITE_MOCK_API === 'true'

const mockStore: {
  invite: Invite | null
  account: Account | null
  delegation: Delegation | null
  teams: Team[]
  members: Member[]
  payments: Payment[]
  attachments: Attachment[]
} = { invite: null, account: null, delegation: null, teams: [], members: [], payments: [], attachments: [] }

function mu() { return crypto.randomUUID() }
function wait() { return new Promise(r => setTimeout(r, 300 + Math.random() * 200)) }
function fullDel(): DelegationFull {
  return { delegation: mockStore.delegation!, teams: mockStore.teams, members: mockStore.members, travelRecords: [], payments: mockStore.payments, attachments: mockStore.attachments, badges: [], checkIns: [] }
}

const KNOWN_CODES: Record<string, Invite> = {
  'IOL2027-THA-7F3K': { id: mu(), code: 'IOL2027-THA-7F3K', countryTerritory: 'Thailand', accreditedOrganisation: 'National Linguistics Olympiad', contactEmail: 'registration@national-olympiad.org', maxTeams: 2, status: 'active' },
  'IOL2027-SGP-9X2M': { id: mu(), code: 'IOL2027-SGP-9X2M', countryTerritory: 'Singapore', accreditedOrganisation: 'Singapore Linguistics Society', contactEmail: null, maxTeams: 1, status: 'active' },
}

const mockApi = {
  verifyInvite: async (code: string) => {
    await wait()
    const inv = KNOWN_CODES[code.trim().toUpperCase()]
    if (!inv) throw new Error('Invitation code not found or already used.')
    mockStore.invite = inv
    return { invite: inv }
  },

  createAccount: async (body: { inviteCode: string; email: string; fullName: string; password?: string; mobileWhatsapp?: string; numberOfTeams?: number; numberOfContestants?: number; numberOfObservers?: number; adultRoomPreference?: string }) => {
    await wait()
    const inv = mockStore.invite
    if (!inv) throw new Error('Invite not verified.')
    const nTeams = body.numberOfTeams ?? 1
    const acc: Account = { id: mu(), email: body.email, fullName: body.fullName, emailVerifiedAt: null }
    const delId = mu()
    const teams: Team[] = Array.from({ length: nTeams }, (_, i) => ({
      id: mu(), delegationId: delId,
      name: `${inv.countryTerritory}${nTeams > 1 ? ' ' + String.fromCharCode(65 + i) : ''}`,
      code: `${inv.countryTerritory.slice(0, 3).toUpperCase()}${nTeams > 1 ? '-' + String.fromCharCode(65 + i) : ''}`,
      contestLanguage: null, status: 'draft',
    }))
    const del: Delegation = {
      id: delId, accountId: acc.id, countryTerritory: inv.countryTerritory,
      accreditedOrganisation: inv.accreditedOrganisation,
      primaryTeamLeaderName: body.fullName, teamLeaderEmail: body.email,
      mobileWhatsapp: body.mobileWhatsapp ?? null,
      numberOfTeams: nTeams, numberOfContestants: body.numberOfContestants ?? nTeams * 4,
      numberOfObservers: body.numberOfObservers ?? 0,
      adultRoomPreference: body.adultRoomPreference ?? 'no_preference',
      registrationStatus: 'draft', paymentStatus: 'awaiting_proof', travelStatus: 'fill_later',
      declaredArrivalDate: null, declaredDepartureDate: null, stayWindowNote: null, submittedAt: null,
    }
    mockStore.account = acc; mockStore.delegation = del; mockStore.teams = teams
    return { account: acc, delegation: del }
  },

  requestVerification: async (_accountId: string) => {
    await wait()
    return { ok: true, developmentCode: '202700' }
  },

  verifyEmail: async (_accountId: string, code: string) => {
    await wait()
    if (code !== '202700' && code.length !== 6) throw new Error('Invalid verification code.')
    if (mockStore.account) mockStore.account.emailVerifiedAt = new Date().toISOString()
    return { account: mockStore.account! }
  },

  getDelegation: async (_delegationId: string) => {
    await wait()
    if (!mockStore.delegation) throw new Error('Delegation not found.')
    return fullDel()
  },

  patchDelegation: async (_delegationId: string, body: Partial<Delegation>) => {
    await wait()
    if (!mockStore.delegation) throw new Error('Delegation not found.')
    Object.assign(mockStore.delegation, body)
    if (body.numberOfTeams !== undefined) {
      const inv = mockStore.invite!
      const nTeams = body.numberOfTeams
      const delId = mockStore.delegation.id
      mockStore.teams = Array.from({ length: nTeams }, (_, i) => ({
        id: mockStore.teams[i]?.id ?? mu(), delegationId: delId,
        name: `${inv.countryTerritory}${nTeams > 1 ? ' ' + String.fromCharCode(65 + i) : ''}`,
        code: `${inv.countryTerritory.slice(0, 3).toUpperCase()}${nTeams > 1 ? '-' + String.fromCharCode(65 + i) : ''}`,
        contestLanguage: mockStore.teams[i]?.contestLanguage ?? null,
        status: mockStore.teams[i]?.status ?? 'draft',
      }))
    }
    return { delegation: mockStore.delegation }
  },

  createMember: async (delegationId: string, body: Omit<Member, 'id' | 'delegationId' | 'observerCategory' | 'badgeName' | 'passportName' | 'passportNumber' | 'passportNationality' | 'dateOfBirth' | 'genderForRoomAllocation' | 'examLanguage' | 'tshirtSize' | 'foodAllergyNotes' | 'medicalAccessibilityNotes' | 'emergencyContact' | 'email' | 'mobileWhatsapp'> & Partial<Member>) => {
    await wait()
    const member: Member = {
      id: mu(), delegationId,
      teamId: body.teamId ?? null, role: body.role ?? 'contestant',
      observerCategory: null, displayName: body.displayName ?? '',
      badgeName: body.badgeName ?? null, officialName: body.officialName ?? '',
      passportName: body.passportName ?? null, passportNumber: body.passportNumber ?? null,
      passportNationality: body.passportNationality ?? null,
      dateOfBirth: body.dateOfBirth ?? null, genderForRoomAllocation: body.genderForRoomAllocation ?? null,
      examLanguage: body.examLanguage ?? null, tshirtSize: body.tshirtSize ?? null,
      tshirtStyle: body.tshirtStyle ?? null, wantsUmbrella: body.wantsUmbrella ?? null,
      roomTypePreference: body.roomTypePreference ?? null,
      foodAllergyNotes: body.foodAllergyNotes ?? null,
      medicalAccessibilityNotes: body.medicalAccessibilityNotes ?? null,
      emergencyContact: body.emergencyContact ?? null,
      email: body.email ?? null, mobileWhatsapp: null,
    }
    mockStore.members.push(member)
    return { member }
  },

  patchMember: async (memberId: string, body: Partial<Member>) => {
    await wait()
    const idx = mockStore.members.findIndex(m => m.id === memberId)
    if (idx === -1) throw new Error('Member not found.')
    Object.assign(mockStore.members[idx], body)
    return { member: mockStore.members[idx] }
  },

  deleteMember: async (memberId: string) => {
    await wait()
    mockStore.members = mockStore.members.filter(m => m.id !== memberId)
  },

  uploadPaymentProof: async (delegationId: string, file: File, meta: { amountDue?: number; invoiceCount?: number; paymentReference?: string }) => {
    await wait()
    const att: Attachment = { id: mu(), delegationId, kind: 'payment_proof', originalFilename: file.name, mimeType: file.type, sizeBytes: file.size }
    const payment: Payment = { id: mu(), delegationId, feeTier: 'early_bird', currency: 'USD', amountDue: String(meta.amountDue ?? 0), paymentReference: meta.paymentReference ?? 'MOCK-REF-001', status: 'awaiting_review', invoiceCount: meta.invoiceCount ?? 1 }
    mockStore.attachments.push(att); mockStore.payments.push(payment)
    if (mockStore.delegation) mockStore.delegation.paymentStatus = 'awaiting_review'
    return { payment, attachment: att }
  },

  submitDelegation: async (delegationId: string, _accountId: string) => {
    await wait()
    if (!mockStore.delegation) throw new Error('Delegation not found.')
    mockStore.delegation.registrationStatus = 'submitted'
    mockStore.delegation.submittedAt = new Date().toISOString()
    return { delegation: mockStore.delegation }
  },
}

// ─── Exported API (switches between real and mock) ────────────────────────────

export const api = {
  verifyInvite: (code: string) =>
    MOCK ? mockApi.verifyInvite(code) : request<{ invite: Invite }>('POST', '/registration/invite/verify', { code }),

  createAccount: (body: {
    inviteCode: string; email: string; fullName: string; password?: string
    mobileWhatsapp?: string; numberOfTeams?: number; numberOfContestants?: number
    numberOfObservers?: number; adultRoomPreference?: string
  }) =>
    MOCK ? mockApi.createAccount(body) : request<{ account: Account; delegation: Delegation }>('POST', '/registration/team-leader-account', body),

  requestVerification: (accountId: string) =>
    MOCK ? mockApi.requestVerification(accountId) : request<{ ok: boolean; developmentCode?: string; emailProviderConfigured?: boolean }>('POST', `/registration/accounts/${accountId}/request-email-verification`),

  verifyEmail: (accountId: string, code: string) =>
    MOCK ? mockApi.verifyEmail(accountId, code) : request<{ account: Account }>('POST', `/registration/accounts/${accountId}/verify-email`, { code }),

  getDelegation: (delegationId: string) =>
    MOCK ? mockApi.getDelegation(delegationId) : request<DelegationFull>('GET', `/registration/delegations/${delegationId}`),

  patchDelegation: (delegationId: string, body: Partial<Delegation>) =>
    MOCK ? mockApi.patchDelegation(delegationId, body) : request<{ delegation: Delegation }>('PATCH', `/registration/delegations/${delegationId}`, body),

  createMember: (delegationId: string, body: Partial<Member> & { role: string; displayName: string; officialName: string }) =>
    MOCK ? mockApi.createMember(delegationId, body) : request<{ member: Member }>('POST', `/registration/delegations/${delegationId}/members`, body),

  patchMember: (memberId: string, body: Partial<Omit<Member, 'id' | 'delegationId'>>) =>
    MOCK ? mockApi.patchMember(memberId, body) : request<{ member: Member }>('PATCH', `/registration/members/${memberId}`, body),

  deleteMember: (memberId: string) =>
    MOCK ? mockApi.deleteMember(memberId) : request<void>('DELETE', `/registration/members/${memberId}`),

  uploadPaymentProof: (delegationId: string, file: File, meta: { amountDue?: number; invoiceCount?: number; paymentReference?: string }) => {
    if (MOCK) return mockApi.uploadPaymentProof(delegationId, file, meta)
    const fd = new FormData()
    fd.append('proof', file)
    if (meta.amountDue !== undefined) fd.append('amountDue', String(meta.amountDue))
    if (meta.invoiceCount !== undefined) fd.append('invoiceCount', String(meta.invoiceCount))
    if (meta.paymentReference) fd.append('paymentReference', meta.paymentReference)
    return request<{ payment: Payment; attachment: Attachment }>('POST', `/registration/delegations/${delegationId}/payment-proof`, fd)
  },

  submitDelegation: (delegationId: string, accountId: string) =>
    MOCK ? mockApi.submitDelegation(delegationId, accountId) : request<{ delegation: Delegation }>('POST', `/registration/delegations/${delegationId}/submit`, { accountId }),
}
