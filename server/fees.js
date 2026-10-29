// Registration fees and other organiser-owned settings. Finance edits the fee values in the back office
// (stored in the settings table); the defaults below apply until they do. The portal reads calculated
// amounts from the API, never from page code.

// What a delegation pays depends on its fee category, set on its invitation code: accredited countries and
// territories that have hosted the IOL before get 10% off the team fees, accredited ones that have not pay the
// full rate, and a country or territory that is not accredited registers one team at the second-team rate
// (IOL Host's Handbook §3.2). The early bird takes another 10% off team fees; observers and single rooms are never
// discounted.
export const feeCategories = ['previous_host', 'accredited', 'non_accredited']
export const feeCategoryLabel = { previous_host: 'Accredited, previous host', accredited: 'Accredited', non_accredited: 'Not accredited' }

// Every country or territory that has hosted the IOL (ioling.org/past_contests, October 2026), as that page names
// them; Romania hosts IOL 2026, before IOL 2027. Other spellings people use map onto these names.
const previousHosts = [
  'Bulgaria', 'Russia', 'Netherlands', 'Estonia', 'Poland', 'Sweden', 'United States of America', 'Slovenia', 'United Kingdom',
  'China', 'India', 'Ireland', 'Czechia', 'Republic of Korea', 'Latvia', 'Isle of Man', 'Brazil', 'Taiwan', 'Romania',
]
const hostSpellings = {
  'russian federation': 'russia', 'the netherlands': 'netherlands', holland: 'netherlands', usa: 'united states of america',
  us: 'united states of america', 'united states': 'united states of america', uk: 'united kingdom', 'great britain': 'united kingdom',
  'czech republic': 'czechia', 'south korea': 'republic of korea', korea: 'republic of korea', 'korea, republic of': 'republic of korea',
  'chinese taipei': 'taiwan', 'people’s republic of china': 'china', "people's republic of china": 'china',
}
const countryKey = (name) => String(name ?? '').replace(/\(test\)/i, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** The fee category a new invitation code gets: previous host if the country or territory has hosted the IOL. */
export function defaultFeeCategory(country) {
  const key = countryKey(country)
  const name = hostSpellings[key] ?? key
  return previousHosts.some((host) => host.toLowerCase() === name) ? 'previous_host' : 'accredited'
}

export const defaultSettings = {
  // POSN's signed fee table for IOL 2027 (19 August 2026). Each list is [first team, second team]; a country or
  // territory that is not accredited registers one team only.
  fees: {
    currency: 'USD',
    // Early bird until the end of this date (Bangkok time), then normal. An early-bird invoice is due on this
    // date; a normal one on the last day of registration.
    earlyBirdEnds: '2027-03-12',
    registrationEnds: '2027-04-30',
    teamFees: {
      early_bird: { previous_host: [2200, 4400], accredited: [2475, 4950], non_accredited: [4950] },
      normal: { previous_host: [2475, 4950], accredited: [2750, 5500], non_accredited: [5500] },
    },
    observerFee: 600,
    // Everyone shares a room unless they ask for a single one (Team Leaders and observers, in Team and observers).
    singleRoomFee: 400,
    // Up to this many observers per team; each team has one Team Leader, included in the team fee.
    maxObserversPerTeam: 2,
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
  // Badges changed after this day are printed at the registration desk rather than by the print shop.
  // A placeholder until the organisers plan the printing.
  badges: { printCutoff: '2027-07-01' },
  // The contacts on the back of every badge (format in badge-pdf.js parseBack). Numbers are from each place's own
  // website, October 2026; the hotel's still needs confirming with the hotel.
  badgeBack: {
    text: [
      '# IOL 2027 organisers',
      'iol2027.th@gmail.com',
      '',
      '# Chulalongkorn University | จุฬาลงกรณ์มหาวิทยาลัย',
      'Campus emergency, 24 hours: +66 2 218 0000',
      'Faculty of Arts, 254 Phayathai Road, Pathum Wan, Bangkok 10330',
      'คณะอักษรศาสตร์ 254 ถนนพญาไท เขตปทุมวัน กรุงเทพฯ 10330',
      '',
      '# Mandarin Hotel Bangkok | โรงแรมแมนดาริน สามย่าน',
      '+66 2 238 0230',
      '662 Rama IV Road, Bang Rak, Bangkok 10500',
      '662 ถนนพระรามที่ 4 เขตบางรัก กรุงเทพฯ 10500',
      '',
      '# King Chulalongkorn Memorial Hospital | โรงพยาบาลจุฬาลงกรณ์',
      '+66 2 256 4000',
      '1873 Rama IV Road, Pathum Wan, Bangkok 10330',
      '1873 ถนนพระรามที่ 4 เขตปทุมวัน กรุงเทพฯ 10330',
    ].join('\n'),
  },
}

/** Saved fees over the defaults. Fees saved before the fee table (one flat team fee and a room rate) keep only their dates. */
function mergeFees(stored) {
  const base = defaultSettings.fees
  if (!stored?.teamFees) {
    const dates = Object.fromEntries(['earlyBirdEnds', 'registrationEnds'].filter((key) => stored?.[key]).map((key) => [key, stored[key]]))
    return { ...base, ...dates }
  }
  return {
    ...base, ...stored,
    teamFees: Object.fromEntries(Object.entries(base.teamFees).map(([tier, rates]) => [tier, { ...rates, ...stored.teamFees[tier] }])),
  }
}

export async function loadSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM settings')
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return {
    fees: mergeFees(stored.fees),
    guardianConsent: { ...defaultSettings.guardianConsent, ...stored.guardianConsent },
    invoice: { ...defaultSettings.invoice, ...stored.invoice },
    badges: { ...defaultSettings.badges, ...stored.badges },
    badgeBack: { ...defaultSettings.badgeBack, ...stored.badgeBack },
  }
}

const money = (value, name) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100000) throw new Error(`${name} must be an amount from 0 to 100,000.`)
  return number
}

const tierLabels = { early_bird: 'Early bird', normal: 'Regular' }

/** Checks a fee form from the back office and returns clean values. Throws with a readable message. */
export function cleanFees(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.earlyBirdEnds ?? ''))) throw new Error('Early bird end date must be a date.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.registrationEnds ?? ''))) throw new Error('Registration end date must be a date.')
  if (input.registrationEnds < input.earlyBirdEnds) throw new Error('Registration must end on or after the last early-bird day.')
  const maxObservers = Number(input.maxObserversPerTeam)
  if (!Number.isInteger(maxObservers) || maxObservers < 0 || maxObservers > 4) throw new Error('Observers per team must be a whole number from 0 to 4.')
  const teamFees = {}
  for (const tier of ['early_bird', 'normal']) {
    teamFees[tier] = {}
    for (const category of feeCategories) {
      const teams = category === 'non_accredited' ? ['team'] : ['first team', 'second team']
      teamFees[tier][category] = teams.map((team, i) => money(input.teamFees?.[tier]?.[category]?.[i], `${tierLabels[tier]}, ${feeCategoryLabel[category].toLowerCase()}, ${team}`))
    }
  }
  return {
    currency: 'USD',
    earlyBirdEnds: input.earlyBirdEnds,
    registrationEnds: input.registrationEnds,
    teamFees,
    observerFee: input.observerFee === null || input.observerFee === '' || input.observerFee === undefined ? null : money(input.observerFee, 'Observer fee'),
    singleRoomFee: money(input.singleRoomFee, 'Single room supplement'),
    maxObserversPerTeam: maxObservers,
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

export function cleanBadgeSettings(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.printCutoff ?? ''))) throw new Error('Print cut-off must be a date.')
  return { printCutoff: input.printCutoff }
}

/** The back's text, with blank lines collapsed; whether it fits is checked against the badge (backProblem). */
export function cleanBadgeBack(input) {
  const text = String(input?.text ?? '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) throw new Error('Add the contacts for the back of the badge.')
  if (text.length > 1500) throw new Error('This is too long for the back of the badge.')
  return { text }
}

export function feeTier(fees, on = new Date()) {
  const cutoff = new Date(`${fees.earlyBirdEnds}T23:59:59+07:00`)
  return on <= cutoff ? 'early_bird' : 'normal'
}

/** How many single rooms a delegation asked for in Team and observers: { teamLeaders: [bool], observers: [bool] }. */
export const singleRoomCount = (singleRooms) => [...(singleRooms?.teamLeaders ?? []), ...(singleRooms?.observers ?? [])].filter(Boolean).length

/** The most observers a delegation may bring with this many teams. */
export const maxObservers = (fees, numberOfTeams) => fees.maxObserversPerTeam * Math.max(1, Number(numberOfTeams) || 1)

/**
 * Fee lines and total for a delegation: its fee category, teams, observers and single rooms. `tier` defaults to the
 * rate on the given day; an invoice already issued passes its own tier so its amounts and due date stay put.
 */
export function calculateFees(fees, { numberOfTeams = 1, numberOfObservers = 0, category = 'accredited', singleRooms = 0 }, on = new Date(), tier = feeTier(fees, on)) {
  const rates = fees.teamFees[tier][category] ?? fees.teamFees[tier].accredited
  const teams = Math.min(Number(numberOfTeams) || 1, rates.length)
  const observers = Number(numberOfObservers) || 0
  const singles = Number(singleRooms) || 0
  const amount = (n) => `${fees.currency} ${n.toLocaleString('en-US')}`
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const observerRate = fees.observerFee
  const rate = `${tierLabels[tier]} rate, ${(feeCategoryLabel[category] ?? feeCategoryLabel.accredited).toLowerCase()}`
  const lines = [
    // quantity and unit let the invoice word each item ("2 observers (2 × 600.00 USD)").
    ...rates.slice(0, teams).map((unit, i) => ({
      key: i === 0 ? 'team1' : 'team2', label: category === 'non_accredited' ? 'Team' : i === 0 ? 'First team' : 'Second team',
      detail: `${rate}. Four contestants and their Team Leader.`, amount: unit, quantity: 1, unit,
    })),
    {
      key: 'observers', label: 'Observers', quantity: observers, unit: observerRate,
      detail: !observers ? 'None declared' : observerRate === null ? `${plural(observers, 'observer', 'observers')}, rate to be confirmed` : `${plural(observers, 'observer', 'observers')} × ${amount(observerRate)}`,
      amount: !observers ? 0 : observerRate === null ? null : observers * observerRate,
    },
    {
      key: 'singleRooms', label: 'Single rooms', quantity: singles, unit: fees.singleRoomFee,
      detail: singles ? `${plural(singles, 'single room', 'single rooms')} × ${amount(fees.singleRoomFee)}` : 'None requested: everyone shares a room',
      amount: singles * fees.singleRoomFee,
    },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  const dueDate = tier === 'early_bird' ? fees.earlyBirdEnds : fees.registrationEnds
  return {
    tier, tierLabel: tierLabels[tier], category, categoryLabel: feeCategoryLabel[category] ?? feeCategoryLabel.accredited, currency: fees.currency,
    lines, total, observersPending: observers > 0 && observerRate === null, dueDate,
  }
}

/** A delegation's fees from its row. `tier` is the invoice's own once one exists, so its amounts stay put. */
export const delegationFees = (fees, d, tier = undefined) => calculateFees(fees, {
  numberOfTeams: d.number_of_teams, numberOfObservers: d.number_of_observers, category: d.fee_category, singleRooms: singleRoomCount(d.single_rooms),
}, new Date(), tier ?? feeTier(fees))

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
