// Registration fees. Finance owns these numbers; change them here, never in page code.
// The portal reads the calculated amounts from the API.
export const feeConfig = {
  currency: 'USD',
  // Early bird until the end of this date (Bangkok time), then normal.
  earlyBirdEnds: '2027-03-12',
  teamFee: { early_bird: 1000, normal: 1000 },
  roomsPerTeam: 2,
  roomRate: 220,
  observerFee: null, // not set by Finance yet
}

export function feeTier(on = new Date()) {
  const cutoff = new Date(`${feeConfig.earlyBirdEnds}T23:59:59+07:00`)
  return on <= cutoff ? 'early_bird' : 'normal'
}

/** Fee lines and total for a delegation, from its team and observer counts. */
export function calculateFees({ numberOfTeams = 1, numberOfObservers = 0 }, on = new Date()) {
  const tier = feeTier(on)
  const teams = Number(numberOfTeams) || 0
  const observers = Number(numberOfObservers) || 0
  const lines = [
    { key: 'teams', label: 'Team registration', detail: `${teams} ${teams === 1 ? 'team' : 'teams'} × ${feeConfig.currency} ${feeConfig.teamFee[tier].toLocaleString('en-US')}`, amount: teams * feeConfig.teamFee[tier] },
    { key: 'rooms', label: 'Accommodation', detail: `${teams} ${teams === 1 ? 'team' : 'teams'} × ${feeConfig.roomsPerTeam} rooms × ${feeConfig.currency} ${feeConfig.roomRate}`, amount: teams * feeConfig.roomsPerTeam * feeConfig.roomRate },
    { key: 'observers', label: 'Observers', detail: observers ? `${observers} ${observers === 1 ? 'observer' : 'observers'}, rate to be confirmed` : 'None declared', amount: observers && feeConfig.observerFee !== null ? observers * feeConfig.observerFee : null },
  ]
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  return { tier, tierLabel: tier === 'early_bird' ? 'Early bird' : 'Normal', currency: feeConfig.currency, lines, total, observersPending: observers > 0 && feeConfig.observerFee === null }
}
