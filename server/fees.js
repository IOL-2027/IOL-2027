// Registration fees and other organiser-owned settings. Finance edits the fee values in the back office
// (stored in the settings table); the defaults below apply until they do. The portal reads calculated
// amounts from the API, never from page code.

export const defaultSettings = {
  fees: {
    currency: 'USD',
    // Early bird until the end of this date (Bangkok time), then normal.
    earlyBirdEnds: '2027-03-12',
    teamFee: { early_bird: 1000, normal: 1000 },
    roomsPerTeam: 2,
    roomRate: 220,
    observerFee: null, // not set by Finance yet
  },
  // Off until the organisers confirm the policy. When on, contestants under the age threshold on the
  // reference date need a signed consent form before their Team Leader can submit.
  guardianConsent: { required: false, ageThreshold: 18, referenceDate: '2027-07-21' },
}

export async function loadSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM settings')
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return {
    fees: { ...defaultSettings.fees, ...stored.fees, teamFee: { ...defaultSettings.fees.teamFee, ...stored.fees?.teamFee } },
    guardianConsent: { ...defaultSettings.guardianConsent, ...stored.guardianConsent },
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
  const rooms = Number(input.roomsPerTeam)
  if (!Number.isInteger(rooms) || rooms < 0 || rooms > 6) throw new Error('Rooms per team must be a whole number from 0 to 6.')
  return {
    currency: 'USD',
    earlyBirdEnds: input.earlyBirdEnds,
    teamFee: { early_bird: money(input.teamFee?.early_bird, 'Early bird team fee'), normal: money(input.teamFee?.normal, 'Normal team fee') },
    roomsPerTeam: rooms,
    roomRate: money(input.roomRate, 'Room rate'),
    observerFee: input.observerFee === null || input.observerFee === '' || input.observerFee === undefined ? null : money(input.observerFee, 'Observer fee'),
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

/** Fee lines and total for a delegation, from its team and observer counts. */
export function calculateFees(fees, { numberOfTeams = 1, numberOfObservers = 0 }, on = new Date()) {
  const tier = feeTier(fees, on)
  const teams = Number(numberOfTeams) || 0
  const observers = Number(numberOfObservers) || 0
  const amount = (n) => `${fees.currency} ${n.toLocaleString('en-US')}`
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const observerRate = fees.observerFee
  const lines = [
    { key: 'teams', label: 'Team registration', detail: `${plural(teams, 'team', 'teams')} × ${amount(fees.teamFee[tier])}`, amount: teams * fees.teamFee[tier] },
    { key: 'rooms', label: 'Accommodation', detail: `${plural(teams, 'team', 'teams')} × ${fees.roomsPerTeam} rooms × ${amount(fees.roomRate)}`, amount: teams * fees.roomsPerTeam * fees.roomRate },
    {
      key: 'observers', label: 'Observers',
      detail: !observers ? 'None declared' : observerRate === null ? `${plural(observers, 'observer', 'observers')}, rate to be confirmed` : `${plural(observers, 'observer', 'observers')} × ${amount(observerRate)}`,
      amount: observers && observerRate !== null ? observers * observerRate : null,
    },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  return { tier, tierLabel: tier === 'early_bird' ? 'Early bird' : 'Normal', currency: fees.currency, lines, total, observersPending: observers > 0 && observerRate === null }
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
