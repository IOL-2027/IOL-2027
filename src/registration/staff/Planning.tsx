// Back-office pages from the IOL Board's feedback (16 Nov 2026): registrations still incomplete, transport planning
// from everyone's flights, and the dates and notices the portal shows (deadlines, hotel nights, pickup, dress code).
import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { api, type EventInfo } from '../api'
import { Alert } from '../ui'
import { Done, FilterField, Note, Panel, Problem, TableWrap, day, errorText, useLoad, when } from './common'

const kindLabel: Record<string, string> = { country: 'Country', jury: 'Jury', volunteer: 'Volunteer' }

type Incomplete = {
  id: string; countryTerritory: string; kind: string; name: string; email: string; paymentStatus: string; updatedAt: string; createdAt: string
  missing: string[]; lastReminder: { purpose: string; sentAt: string } | null
}

/** Registrations not submitted yet, with what each still needs and the last reminder sent. */
export function IncompletePanel({ onOpen }: { onOpen?: (id: string) => void }) {
  const { data, error } = useLoad<{ registrations: Incomplete[] }>('/api/admin/incomplete')
  const [show, setShow] = useState<'all' | 'country' | 'jury' | 'volunteer'>('all')
  const rows = (data?.registrations ?? []).filter((r) => show === 'all' || r.kind === show)
  return (
    <Panel id="incomplete" title="Incomplete registrations" intro="Every registration not submitted yet, and what it still needs. Reminders go out by themselves in the week before each deadline; this list is for following up by hand.">
      <div className="reg-filter-bar">
        <div className="reg-filter" role="group" aria-label="Show">
          {([['all', 'All'], ['country', 'Countries'], ['jury', 'Jury'], ['volunteer', 'Volunteers']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} className={show === value ? 'active' : undefined} onClick={() => setShow(value)}>{label}</button>
          ))}
        </div>
      </div>
      <Problem message={error} />
      {data && (rows.length === 0 ? <Note>Nothing incomplete here.</Note> : (
        <TableWrap label="Incomplete registrations">
          <thead><tr><th scope="col">Registration</th><th scope="col">Still needed</th><th scope="col">Last change</th><th scope="col">Last reminder</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                {onOpen ? <button type="button" className="reg-btn-link" onClick={() => onOpen(r.id)}>{r.countryTerritory}</button> : r.countryTerritory}
                <small>{kindLabel[r.kind] ?? r.kind}{r.name ? ` · ${r.name}` : ''} · {r.email}</small>
              </th>
              <td>{r.missing.length ? <ul className="reg-cell-list">{r.missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}{r.missing.length > 6 && <li>and {r.missing.length - 6} more</li>}</ul> : 'Ready to submit'}</td>
              <td>{when(r.updatedAt)}<small>Started {day(r.createdAt)}</small></td>
              <td>{r.lastReminder ? <>{r.lastReminder.purpose.replace('reminder_', '').replace(/_/g, ' ')}<small>{when(r.lastReminder.sentAt)}</small></> : <span className="reg-muted">None yet</span>}</td>
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
    </Panel>
  )
}

type Trip = {
  id: string; direction: string; transport: 'organisers' | 'own'; travelPoint: string | null; flightServiceNumber: string | null; localDate: string | null; localTime: string | null
  locPickupTime: string | null; locTransportGroup: string | null; locMeetingPointNote: string | null; delegationId: string; countryTerritory: string; people: string[]; pickupEmailedAt: string | null
}

/**
 * Transport planning: every arrival (or departure) by day and time, with how many people, so the transport team can
 * group them into buses and set each pickup time. "Email pickup details" sends each delegation its own plan.
 */
export function TransportPanel({ canEdit }: { canEdit: boolean }) {
  const [direction, setDirection] = useState<'arrival' | 'departure'>('arrival')
  const { data, error, reload } = useLoad<{ trips: Trip[] }>(`/api/admin/transport?direction=${direction}`)
  const [done, setDone] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [own, setOwn] = useState(false)
  const trips = (data?.trips ?? []).filter((t) => own || t.transport !== 'own')
  const days = [...new Set(trips.map((t) => t.localDate ?? ''))]
  const save = async (trip: Trip, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setActionError(''); setDone('')
    try {
      await api(`/api/admin/travel/${trip.id}`, { method: 'PATCH', body: { pickupTime: String(form.get('time') ?? ''), transportGroup: String(form.get('group') ?? ''), meetingPoint: String(form.get('meeting') ?? '') } })
      setDone(`${trip.countryTerritory}, ${trip.flightServiceNumber ?? 'trip'}: saved.`)
      reload()
    } catch (e) { setActionError(errorText(e)) }
  }
  const sendAll = async () => {
    // It goes straight to national representatives, so it asks first (review of 27 Nov 2026).
    const waiting = new Set((data?.trips ?? []).filter((t) => t.transport !== 'own' && (t.locPickupTime || t.locTransportGroup) && !t.pickupEmailedAt).map((t) => t.delegationId)).size
    if (!window.confirm(`Email pickup details now?${waiting ? ` ${waiting} ${waiting === 1 ? 'registration has' : 'registrations have'} ${direction === 'arrival' ? 'arrival' : 'departure'} pickups not emailed yet.` : ''} Every registration whose pickup plan changed since its last email gets one, straight away.`)) return
    setBusy(true); setActionError(''); setDone('')
    try {
      const result = await api<{ sent: number }>('/api/admin/transport/send', { method: 'POST' })
      setDone(result.sent ? `Pickup details emailed to ${result.sent} ${result.sent === 1 ? 'registration' : 'registrations'}.` : 'Nothing new to send: every registration already has its latest pickup details.')
      reload()
    } catch (e) { setActionError(errorText(e)) } finally { setBusy(false) }
  }
  const people = trips.reduce((n, t) => n + t.people.length, 0)
  // Each bus with its headcount, for checking capacity and printing a list per bus (review of 27 Nov 2026).
  const buses = [...(data?.trips ?? []).filter((t) => t.transport !== 'own' && t.locTransportGroup?.trim()).reduce((map, t) => {
    const key = `${t.localDate ?? ''}|${t.locTransportGroup!.trim()}`
    const bus = map.get(key) ?? { date: t.localDate, name: t.locTransportGroup!.trim(), times: new Set<string>(), trips: [] as Trip[] }
    if (t.locPickupTime) bus.times.add(t.locPickupTime.slice(0, 5))
    bus.trips.push(t)
    return map.set(key, bus)
  }, new Map<string, { date: string | null; name: string; times: Set<string>; trips: Trip[] }>()).values()]
    .sort((a, b) => `${a.date}${[...a.times].sort()[0] ?? ''}${a.name}`.localeCompare(`${b.date}${[...b.times].sort()[0] ?? ''}${b.name}`))
  // Everyone making their own way, listed apart so the transport team knows who is not on a bus (meeting of 24 Nov 2026).
  const ownWay = own ? [] : (data?.trips ?? []).filter((t) => t.transport === 'own')
  const ownPeople = ownWay.reduce((n, t) => n + t.people.length, 0)
  return (
    <Panel id="transport" title="Transport" intro="Everyone’s flights, by day and time, for planning airport pickups and drop-offs (Suvarnabhumi and Don Mueang only). Set each trip’s pickup time and bus, then email everyone their pickup details."
      actions={canEdit ? <button type="button" className="reg-btn reg-btn-primary" disabled={busy} onClick={sendAll}><Send size={16} aria-hidden="true" />{busy ? 'Sending…' : 'Email pickup details'}</button> : undefined}>
      <div className="reg-filter-bar">
        <div className="reg-filter" role="group" aria-label="Direction">
          {([['arrival', 'Arrivals'], ['departure', 'Departures']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={direction === value} className={direction === value ? 'active' : undefined} onClick={() => setDirection(value)}>{label}</button>
          ))}
        </div>
        <FilterField id="transport-own" label="Own way">
          <label className="reg-check"><input id="transport-own" type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /><span>Also show people making their own way</span></label>
        </FilterField>
      </div>
      <Problem message={error || actionError} />
      <Done message={done} />
      {data && (trips.length === 0 ? <Note>No {direction === 'arrival' ? 'arrivals' : 'departures'} entered yet.</Note> : <>
        <p className="reg-hint">{trips.length} {trips.length === 1 ? 'trip' : 'trips'}, {people} {people === 1 ? 'person' : 'people'}.</p>
        {days.map((d) => (
          <div key={d}>
            <h3 className="reg-staff-subhead">{d ? day(d) : 'Date not entered yet'}</h3>
            <TableWrap label={`${direction === 'arrival' ? 'Arrivals' : 'Departures'} on ${d ? day(d) : 'an unknown date'}`}>
              <thead><tr><th scope="col">Time</th><th scope="col">Flight</th><th scope="col">Registration</th><th scope="col">People</th><th scope="col">Pickup time, bus and meeting point</th></tr></thead>
              <tbody>{trips.filter((t) => (t.localDate ?? '') === d).map((t) => (
                <tr key={t.id}>
                  <td>{t.localTime?.slice(0, 5) ?? '—'}</td>
                  <th scope="row">{t.transport === 'own' ? 'Own way' : t.flightServiceNumber ?? '—'}<small>{t.travelPoint ?? ''}</small></th>
                  <td>{t.countryTerritory}{t.pickupEmailedAt && <small>Emailed {when(t.pickupEmailedAt)}</small>}</td>
                  <td>{t.people.length}<small>{t.people.join(', ')}</small></td>
                  <td>{t.transport === 'own' ? <span className="reg-muted">Making their own way</span> : canEdit ? (
                    <form className="reg-inline-form" onSubmit={(e) => save(t, e)}>
                      <label className="reg-visually-hidden" htmlFor={`tp-time-${t.id}`}>Pickup time</label>
                      <input id={`tp-time-${t.id}`} name="time" type="time" className="reg-control reg-control-compact" defaultValue={t.locPickupTime?.slice(0, 5) ?? ''} />
                      <label className="reg-visually-hidden" htmlFor={`tp-group-${t.id}`}>Bus</label>
                      <input id={`tp-group-${t.id}`} name="group" className="reg-control reg-control-compact" placeholder="Bus" defaultValue={t.locTransportGroup ?? ''} />
                      <label className="reg-visually-hidden" htmlFor={`tp-meet-${t.id}`}>Meeting point</label>
                      <input id={`tp-meet-${t.id}`} name="meeting" className="reg-control reg-control-compact" placeholder="Meeting point" defaultValue={t.locMeetingPointNote ?? ''} />
                      <button type="submit" className="reg-btn-link">Save</button>
                    </form>
                  ) : <>{t.locPickupTime?.slice(0, 5) ?? 'No time yet'}{t.locTransportGroup ? ` · bus ${t.locTransportGroup}` : ''}<small>{t.locMeetingPointNote}</small></>}</td>
                </tr>
              ))}</tbody>
            </TableWrap>
          </div>
        ))}
      </>)}
      {data && buses.length > 0 && (
        <div className="reg-bus-list">
          <h3 className="reg-staff-subhead">By bus ({buses.length} {buses.length === 1 ? 'bus' : 'buses'})</h3>
          <p className="reg-hint">From the bus names set above. <button type="button" className="reg-inline-btn" onClick={() => window.print()}>Print this page</button> for a list per bus.</p>
          <TableWrap label={`${direction === 'arrival' ? 'Arrival' : 'Departure'} buses`}>
            <thead><tr><th scope="col">Bus</th><th scope="col">Day and pickup</th><th scope="col">People</th><th scope="col">Who</th></tr></thead>
            <tbody>{buses.map((b) => {
              const count = b.trips.reduce((n, t) => n + t.people.length, 0)
              return (
                <tr key={`${b.date}-${b.name}`}>
                  <th scope="row">Bus {b.name}</th>
                  <td>{b.date ? day(b.date) : '—'}<small>{b.times.size ? [...b.times].sort().join(', ') : 'No pickup time yet'}</small></td>
                  <td><strong>{count}</strong></td>
                  <td>{b.trips.map((t) => <small key={t.id}>{t.countryTerritory}{t.flightServiceNumber ? ` (${t.flightServiceNumber})` : ''}: {t.people.join(', ')}</small>)}</td>
                </tr>
              )
            })}</tbody>
          </TableWrap>
        </div>
      )}
      {data && ownWay.length > 0 && (
        <div>
          <h3 className="reg-staff-subhead">Making their own way ({ownPeople} {ownPeople === 1 ? 'person' : 'people'})</h3>
          <p className="reg-hint">Not on any bus. They are told in their badge email that they make their own way {direction === 'arrival' ? 'to the hotel' : 'to the airport'}.</p>
          <TableWrap label={`People making their own way, ${direction === 'arrival' ? 'arriving' : 'leaving'}`}>
            <thead><tr><th scope="col">Date</th><th scope="col">Registration</th><th scope="col">People</th></tr></thead>
            <tbody>{ownWay.map((t) => (
              <tr key={t.id}><td>{t.localDate ? day(t.localDate) : '—'}{t.localTime && <small>{t.localTime.slice(0, 5)}</small>}</td><th scope="row">{t.countryTerritory}</th><td>{t.people.length}<small>{t.people.join(', ')}</small></td></tr>
            ))}</tbody>
          </TableWrap>
        </div>
      )}
    </Panel>
  )
}

/** The dates and notices the portal shows: deadlines, the hotel nights provided, pickup times and the dress code. */
export function EventSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { data, error, reload } = useLoad<{ event: EventInfo }>('/api/admin/settings')
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState('')
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '')
    setSaveError(''); setDone('')
    try {
      await api('/api/admin/settings/event', { method: 'PUT', body: {
        languageLock: value('languageLock'), peopleDeadline: value('peopleDeadline'), travelDeadline: value('travelDeadline'),
        hotelFirstNight: value('hotelFirstNight'), hotelLastNight: value('hotelLastNight'), pickup: value('pickup'), dressCode: value('dressCode'),
      } })
      setDone('Saved. The portal shows the new dates and wording straight away.')
      reload()
    } catch (e) { setSaveError(errorText(e)) }
  }
  const ev = data?.event
  const dateField = (name: keyof EventInfo, label: string, hint: string) => (
    <div className="reg-field">
      <label htmlFor={`ev-${name}`}>{label}</label>
      <p className="reg-hint" id={`ev-${name}-hint`}>{hint}</p>
      <input id={`ev-${name}`} name={name} type="date" className="reg-control" defaultValue={String(ev?.[name] ?? '')} disabled={!canEdit} aria-describedby={`ev-${name}-hint`} />
    </div>
  )
  return (
    <Panel id="event" title="Dates and notices" intro="Shown beside the steps of every registration. Contest languages lock 10 weeks before the Olympiad; the other dates and the pickup times are placeholders until the organisers confirm them.">
      <Problem message={error} />
      {ev && (
        <form onSubmit={save} noValidate key={JSON.stringify(ev)}>
          <div className="reg-grid">
            {dateField('languageLock', 'Contest languages lock after', 'Team and individual contest languages can change until the end of this day.')}
            {dateField('peopleDeadline', 'People details due', 'Shown beside People; a reminder goes a week before.')}
            {dateField('travelDeadline', 'Flights can change until', 'After this day only the organisers can change a flight.')}
            {dateField('hotelFirstNight', 'First hotel night provided', 'The organisers provide rooms from this night…')}
            {dateField('hotelLastNight', 'Last hotel night provided', '…to this night. Other nights are the participants’ own.')}
          </div>
          <div className="reg-field reg-field-wide">
            <label htmlFor="ev-pickup">Airport pickup and drop-off times</label>
            <p className="reg-hint" id="ev-pickup-hint">Shown on Travel after “We will provide pickup and drop-off at Suvarnabhumi (BKK) and Don Mueang (DMK) airports only.”</p>
            <textarea id="ev-pickup" name="pickup" className="reg-control" rows={3} defaultValue={ev.pickup} disabled={!canEdit} aria-describedby="ev-pickup-hint" />
          </div>
          <div className="reg-field reg-field-wide">
            <label htmlFor="ev-dress">Royal reception: dress code and protocol</label>
            <p className="reg-hint" id="ev-dress-hint">Shown on Submit, where everyone ticks that they have read it.</p>
            <textarea id="ev-dress" name="dressCode" className="reg-control" rows={5} defaultValue={ev.dressCode} disabled={!canEdit} aria-describedby="ev-dress-hint" />
          </div>
          {canEdit && <>
            <Alert>{saveError}</Alert>
            <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary">Save dates and notices</button></div>
          </>}
          <Done message={done} />
        </form>
      )}
    </Panel>
  )
}
