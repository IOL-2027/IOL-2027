// Thin API client for the IOL 2027 registration backend.

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

export const api = {
  verifyInvite: (code: string) =>
    request<{ invite: Invite }>('POST', '/registration/invite/verify', { code }),

  createAccount: (body: {
    inviteCode: string
    email: string
    fullName: string
    password?: string
    mobileWhatsapp?: string
    numberOfTeams?: number
    numberOfContestants?: number
    numberOfObservers?: number
    adultRoomPreference?: string
  }) =>
    request<{ account: Account; delegation: Delegation }>('POST', '/registration/team-leader-account', body),

  requestVerification: (accountId: string) =>
    request<{ ok: boolean; developmentCode?: string; emailProviderConfigured?: boolean }>(
      'POST',
      `/registration/accounts/${accountId}/request-email-verification`,
    ),

  verifyEmail: (accountId: string, code: string) =>
    request<{ account: Account }>('POST', `/registration/accounts/${accountId}/verify-email`, { code }),

  getDelegation: (delegationId: string) =>
    request<DelegationFull>('GET', `/registration/delegations/${delegationId}`),

  patchDelegation: (
    delegationId: string,
    body: Partial<{
      mobileWhatsapp: string
      numberOfTeams: number
      numberOfContestants: number
      numberOfObservers: number
      adultRoomPreference: string
      declaredArrivalDate: string
      declaredDepartureDate: string
      stayWindowNote: string
    }>,
  ) => request<{ delegation: Delegation }>('PATCH', `/registration/delegations/${delegationId}`, body),

  createMember: (
    delegationId: string,
    body: {
      role: string
      displayName: string
      officialName: string
      badgeName?: string
      teamId?: string
      dateOfBirth?: string
      genderForRoomAllocation?: string
      examLanguage?: string
      tshirtSize?: string
      passportName?: string
      passportNumber?: string
      passportNationality?: string
      foodAllergyNotes?: string
      medicalAccessibilityNotes?: string
      emergencyContact?: string
      email?: string
    },
  ) => request<{ member: Member }>('POST', `/registration/delegations/${delegationId}/members`, body),

  patchMember: (memberId: string, body: Partial<Omit<Member, 'id' | 'delegationId'>>) =>
    request<{ member: Member }>('PATCH', `/registration/members/${memberId}`, body),

  deleteMember: (memberId: string) => request<void>('DELETE', `/registration/members/${memberId}`),

  uploadPaymentProof: (
    delegationId: string,
    file: File,
    meta: { amountDue?: number; invoiceCount?: number; paymentReference?: string },
  ) => {
    const fd = new FormData()
    fd.append('proof', file)
    if (meta.amountDue !== undefined) fd.append('amountDue', String(meta.amountDue))
    if (meta.invoiceCount !== undefined) fd.append('invoiceCount', String(meta.invoiceCount))
    if (meta.paymentReference) fd.append('paymentReference', meta.paymentReference)
    return request<{ payment: Payment; attachment: Attachment }>(
      'POST',
      `/registration/delegations/${delegationId}/payment-proof`,
      fd,
    )
  },

  submitDelegation: (delegationId: string, accountId: string) =>
    request<{ delegation: Delegation }>('POST', `/registration/delegations/${delegationId}/submit`, { accountId }),
}
