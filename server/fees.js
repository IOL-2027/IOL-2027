// Registration fees and other organiser-owned settings. Finance edits the fee values in the back office
// (stored in the settings table); the defaults below apply until they do. The portal reads calculated
// amounts from the API, never from page code.

export const defaultSettings = {
  fees: {
    currency: 'USD',
    // Early bird until the end of this date (Bangkok time), then normal. An early-bird invoice is due on this
    // date; a normal one on the last day of registration.
    earlyBirdEnds: '2027-03-12',
    registrationEnds: '2027-04-30',
    teamFee: { early_bird: 1000, normal: 1000 },
    roomsPerTeam: 2,
    roomRate: 220,
    observerFee: null, // not set by Finance yet
  },
  // Off until the organisers confirm the policy. When on, contestants under the age threshold on the
  // reference date need a signed consent form before their Team Leader can submit.
  guardianConsent: { required: false, ageThreshold: 18, referenceDate: '2027-07-21' },
  // Who the invoice is from, as on Finance's invoice template. The bank account is entered by Finance in the
  // back office rather than kept here, since this repository is public; until then invoices say it is to come.
  invoice: {
    issuerName: 'POSN Foundation',
    issuerTin: '0993000136021',
    issuerAddress: 'Faculty of Science, Chulalongkorn University, Phaya Thai Rd., Wang Mai, Pathumwan, Bangkok 10330 THAILAND',
    bank: null, // { beneficiaryName, beneficiaryAddress, bankName, bankAddress, accountNumber, swiftCode }
  },
}

export async function loadSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM settings')
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return {
    fees: { ...defaultSettings.fees, ...stored.fees, teamFee: { ...defaultSettings.fees.teamFee, ...stored.fees?.teamFee } },
    guardianConsent: { ...defaultSettings.guardianConsent, ...stored.guardianConsent },
    invoice: { ...defaultSettings.invoice, ...stored.invoice },
  }
}

const money = (value, name) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100000) throw new Error(`${name} must be an amount from 0 to 100,000.`)
  return number
}

/** Checks a fee form from the back office and returns clean values. Throws with a readable message. */
export function cleanFees(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.earlyBirdEnds ?? ''))) throw new Error('Early bird end date must be a date.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.registrationEnds ?? ''))) throw new Error('Registration end date must be a date.')
  if (input.registrationEnds < input.earlyBirdEnds) throw new Error('Registration must end on or after the last early-bird day.')
  const rooms = Number(input.roomsPerTeam)
  if (!Number.isInteger(rooms) || rooms < 0 || rooms > 6) throw new Error('Rooms per team must be a whole number from 0 to 6.')
  return {
    currency: 'USD',
    earlyBirdEnds: input.earlyBirdEnds,
    registrationEnds: input.registrationEnds,
    teamFee: { early_bird: money(input.teamFee?.early_bird, 'Early bird team fee'), normal: money(input.teamFee?.normal, 'Normal team fee') },
    roomsPerTeam: rooms,
    roomRate: money(input.roomRate, 'Room rate'),
    observerFee: input.observerFee === null || input.observerFee === '' || input.observerFee === undefined ? null : money(input.observerFee, 'Observer fee'),
  }
}

const text = (value, name, { required = false, max = 300 } = {}) => {
  const clean = String(value ?? '').trim()
  if (required && !clean) throw new Error(`${name} is required.`)
  if (clean.length > max) throw new Error(`${name} must be at most ${max} characters.`)
  return clean
}

/** Checks the invoice issuer and bank form. The bank block is all-or-nothing: empty means "not confirmed yet". */
export function cleanInvoice(input) {
  const bankInput = input.bank ?? {}
  const anyBank = ['beneficiaryName', 'beneficiaryAddress', 'bankName', 'bankAddress', 'accountNumber', 'swiftCode'].some((key) => String(bankInput[key] ?? '').trim())
  let bank = null
  if (anyBank) {
    const swiftCode = text(bankInput.swiftCode, 'SWIFT code', { required: true, max: 11 }).toUpperCase().replace(/\s+/g, '')
    if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swiftCode)) throw new Error('SWIFT code must be 8 or 11 letters and digits.')
    const accountNumber = text(bankInput.accountNumber, 'Account number', { required: true, max: 40 })
    if (!/^[0-9][0-9 -]*[0-9]$/.test(accountNumber)) throw new Error('Account number may only contain digits, spaces and dashes.')
    bank = {
      beneficiaryName: text(bankInput.beneficiaryName, 'Beneficiary name', { required: true }),
      beneficiaryAddress: text(bankInput.beneficiaryAddress, 'Beneficiary address'),
      bankName: text(bankInput.bankName, 'Bank name', { required: true }),
      bankAddress: text(bankInput.bankAddress, 'Bank address'),
      accountNumber,
      swiftCode,
    }
  }
  return {
    issuerName: text(input.issuerName, 'Invoice issuer', { required: true }),
    issuerTin: text(input.issuerTin, 'Issuer tax identification number', { max: 40 }),
    issuerAddress: text(input.issuerAddress, 'Issuer address', { required: true }),
    bank,
  }
}

export function cleanGuardianConsent(input) {
  const age = Number(input.ageThreshold)
  if (!Number.isInteger(age) || age < 1 || age > 21) throw new Error('Age threshold must be a whole number from 1 to 21.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.referenceDate ?? ''))) throw new Error('Reference date must be a date.')
  return { required: Boolean(input.required), ageThreshold: age, referenceDate: input.referenceDate }
}

export function feeTier(fees, on = new Date()) {
  const cutoff = new Date(`${fees.earlyBirdEnds}T23:59:59+07:00`)
  return on <= cutoff ? 'early_bird' : 'normal'
}

/**
 * Fee lines and total for a delegation, from its team and observer counts. `tier` defaults to the rate on
 * the given day; an invoice already issued passes its own tier so its amounts and due date stay put.
 */
export function calculateFees(fees, { numberOfTeams = 1, numberOfObservers = 0 }, on = new Date(), tier = feeTier(fees, on)) {
  const teams = Number(numberOfTeams) || 0
  const observers = Number(numberOfObservers) || 0
  const amount = (n) => `${fees.currency} ${n.toLocaleString('en-US')}`
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const observerRate = fees.observerFee
  const lines = [
    // quantity and unit let the invoice word each item ("2 teams (2 × 1000.00 USD)").
    { key: 'teams', label: 'Team registration', detail: `${plural(teams, 'team', 'teams')} × ${amount(fees.teamFee[tier])}`, amount: teams * fees.teamFee[tier], quantity: teams, unit: fees.teamFee[tier] },
    { key: 'rooms', label: 'Accommodation', detail: `${plural(teams, 'team', 'teams')} × ${fees.roomsPerTeam} rooms × ${amount(fees.roomRate)}`, amount: teams * fees.roomsPerTeam * fees.roomRate, quantity: teams * fees.roomsPerTeam, unit: fees.roomRate },
    {
      key: 'observers', label: 'Observers', quantity: observers, unit: observerRate,
      detail: !observers ? 'None declared' : observerRate === null ? `${plural(observers, 'observer', 'observers')}, rate to be confirmed` : `${plural(observers, 'observer', 'observers')} × ${amount(observerRate)}`,
      amount: observers && observerRate !== null ? observers * observerRate : null,
    },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  const dueDate = tier === 'early_bird' ? fees.earlyBirdEnds : fees.registrationEnds
  return { tier, tierLabel: tier === 'early_bird' ? 'Early bird' : 'Normal', currency: fees.currency, lines, total, observersPending: observers > 0 && observerRate === null, dueDate }
}

/** Whole years of age on a given date. */
export function ageOn(dateOfBirth, onDate) {
  if (!dateOfBirth) return null
  const [by, bm, bd] = String(dateOfBirth).slice(0, 10).split('-').map(Number)
  const [oy, om, od] = String(onDate).slice(0, 10).split('-').map(Number)
  return oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0)
}

/** True when this member needs a guardian consent form under the current policy. */
export function needsGuardianConsent(member, policy) {
  if (!policy.required || member.role !== 'contestant') return false
  const age = ageOn(member.date_of_birth ?? member.dateOfBirth, policy.referenceDate)
  return age !== null && age < policy.ageThreshold
}
