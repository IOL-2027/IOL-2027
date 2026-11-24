// Review and requests (meetings of 24 and 25 Nov 2026): everything the organisers will work from, built from People and
// Travel so nobody retypes it, laid out to be read at a glance: a row of totals, then rooms, food and health, and
// travel as short tables. Room requests follow, on Workspace.
import { BedDouble, Check, CircleAlert, Plane, Users, Utensils } from 'lucide-react'
import type { DelegationData, Member, TravelRecord } from './api'
import { longDate } from './ui'

const nameOf = (m: Member) => m.badgeName || m.displayName
const none = (text?: string | null) => !text || /^(none|no|n\/a|-|no restrictions|no special requirements)\.?$/i.test(text.trim())
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

function TripTable({ title, trips, data }: { title: string; trips: TravelRecord[]; data: DelegationData }) {
  const sorted = [...trips].sort((a, b) => `${a.localDate ?? '9999'}${a.localTime ?? ''}`.localeCompare(`${b.localDate ?? '9999'}${b.localTime ?? ''}`))
  return (
    <div className="reg-review-trips">
      <h4>{title}</h4>
      {sorted.length ? (
        <table className="reg-review-table">
          <thead><tr><th scope="col">When</th><th scope="col">How</th><th scope="col">Who</th></tr></thead>
          <tbody>
            {sorted.map((t) => {
              const who = t.memberIds.map((id) => data.members.find((m) => m.id === id)).filter((m): m is Member => Boolean(m)).map(nameOf)
              return (
                <tr key={t.id}>
                  <td>{t.localDate ? day(t.localDate) : 'Date to come'}{t.localTime && <small>{t.localTime.slice(0, 5)}</small>}</td>
                  <td>{t.transport === 'own' ? 'Own way' : t.flightServiceNumber ?? 'Flight to come'}<small>{t.transport === 'own' ? (t.direction === 'arrival' ? 'to the hotel' : 'to the airport') : t.travelPoint ?? ''}</small></td>
                  <td>{who.length ? <>{who.length} {who.length === 1 ? 'person' : 'people'}<small>{who.join(', ')}</small></> : <span className="reg-muted">Nobody ticked yet</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <p className="reg-muted">None added yet.</p>}
    </div>
  )
}

export function ReviewSummary({ data }: { data: DelegationData }) {
  const { members, delegation, event, feeRules, travelRecords } = data
  const country = (delegation.kind ?? 'country') === 'country'
  const contestants = members.filter((m) => m.role === 'contestant')
  const male = contestants.filter((m) => m.genderForRoomAllocation === 'Male').length
  const female = contestants.filter((m) => m.genderForRoomAllocation === 'Female').length
  const otherGender = contestants.length - male - female
  const singles = members.filter((m) => m.role !== 'contestant' && m.roomTypePreference === 'single').map((m) => m.displayName)
  const noRoom = delegation.needsAccommodation === false
  const health = members.filter((m) => (m.diet ?? []).some((x) => x !== 'No special diet') || !none(m.medicalAccessibilityNotes))
  const on = (dir: 'arrival' | 'departure') => new Set(travelRecords.filter((t) => t.direction === dir).flatMap((t) => t.memberIds))
  const offTrip = members.filter((m) => !on('arrival').has(m.id) || !on('departure').has(m.id)).map(nameOf)
  const peopleStep = country ? 'People' : 'Your details'
  const roleCount = (role: Member['role'], one: string, many: string) => { const n = members.filter((m) => m.role === role).length; return n ? `${n} ${n === 1 ? one : many}` : null }

  return (
    <div className="reg-review">
      <ul className="reg-review-totals" aria-label="At a glance">
        <li><Users size={18} aria-hidden="true" /><span><strong>{members.length} {members.length === 1 ? 'person' : 'people'}</strong>{[roleCount('team_leader', 'Team Leader', 'Team Leaders'), roleCount('contestant', 'contestant', 'contestants'), roleCount('observer', 'observer', 'observers')].filter(Boolean).join(', ')}</span></li>
        <li><BedDouble size={18} aria-hidden="true" /><span><strong>{singles.length ? `${singles.length} single ${singles.length === 1 ? 'room' : 'rooms'}` : 'No single rooms'}</strong>{noRoom ? 'No hotel room needed' : 'Everyone else in twin rooms'}</span></li>
        <li><Utensils size={18} aria-hidden="true" /><span><strong>{health.length ? `${health.length} with food or health needs` : 'No food or health needs'}</strong>Seen only by the organising team</span></li>
        <li className={offTrip.length ? 'is-warn' : 'is-ok'}>{offTrip.length ? <CircleAlert size={18} aria-hidden="true" /> : <Check size={18} strokeWidth={3} aria-hidden="true" />}<span><strong>{offTrip.length ? `${offTrip.length} without both flights` : 'Everyone’s travel is in'}</strong>{offTrip.length ? 'Add them in Travel' : 'An arrival and a departure each'}</span></li>
      </ul>

      <section className="reg-review-group" aria-labelledby="review-rooms-title">
        <h3 id="review-rooms-title"><BedDouble size={18} aria-hidden="true" />Rooms</h3>
        <dl className="reg-review-rows">
          <div><dt>Hotel nights</dt><dd>{noRoom ? 'No hotel room needed' : <>From the night of {longDate(event.hotelFirstNight)} to the night of {longDate(event.hotelLastNight)}</>}
            <small>{noRoom ? 'You said you do not need a room. Change it in About you.' : 'Provided by the organisers. Other nights are yours to book and pay for.'}</small></dd></div>
          {country && <div><dt>Contestants’ rooms</dt><dd>{male} male, {female} female{otherGender ? `, ${otherGender} other or not given` : ''}
            <small>Contestants share twin rooms with someone of the same gender, from their own country where possible.</small></dd></div>}
          <div><dt>Single rooms</dt><dd>{singles.length ? singles.join(', ') : 'None'}
            <small>USD {feeRules.singleRoomFee.toLocaleString('en-US')} each. Chosen in {country ? 'Team and observers' : 'About you'}.</small></dd></div>
        </dl>
      </section>

      <section className="reg-review-group" aria-labelledby="review-health-title">
        <h3 id="review-health-title"><Utensils size={18} aria-hidden="true" />Food and health</h3>
        {health.length ? (
          <table className="reg-review-table">
            <thead><tr><th scope="col">Person</th><th scope="col">Food</th><th scope="col">Medical or accessibility</th></tr></thead>
            <tbody>
              {health.map((m) => {
                const diet = (m.diet ?? []).filter((x) => x !== 'No special diet')
                return (
                  <tr key={m.id}>
                    <th scope="row">{nameOf(m)}</th>
                    <td>{diet.length ? diet.join(', ') : <span className="reg-muted">No special diet</span>}{m.foodAllergyNotes?.trim() && diet.length > 0 && <small>{m.foodAllergyNotes.trim()}</small>}</td>
                    <td>{none(m.medicalAccessibilityNotes) ? <span className="reg-muted">None</span> : m.medicalAccessibilityNotes!.trim()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="reg-review-empty">Nobody has a special diet or a medical or accessibility note.</p>}
        <p className="reg-hint">From each person’s food options and medical or accessibility notes in {peopleStep}.</p>
      </section>

      <section className="reg-review-group" aria-labelledby="review-travel-title">
        <h3 id="review-travel-title"><Plane size={18} aria-hidden="true" />Travel</h3>
        <TripTable title="Arrivals" trips={travelRecords.filter((t) => t.direction === 'arrival')} data={data} />
        <TripTable title="Departures" trips={travelRecords.filter((t) => t.direction === 'departure')} data={data} />
        {offTrip.length > 0 && <p className="reg-aside reg-aside-warn"><CircleAlert size={18} aria-hidden="true" /><span>Not on an arrival and a departure yet: {offTrip.join(', ')}. Everyone needs both, those who make their own way too. Add them in Travel.</span></p>}
      </section>

      <p className="reg-hint reg-review-foot">Built from {peopleStep} and Travel: to change something, change it there. Seen only by the organising team, under Thailand’s Personal Data Protection Act (PDPA) and the GDPR; every download is logged. Kept for 5 years after IOL 2027, then securely deleted, as set out on the consent forms.</p>
    </div>
  )
}
