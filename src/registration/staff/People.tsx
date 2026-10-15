import { useMemo, useState } from 'react'
import { ArrowRight, Check, CircleAlert } from 'lucide-react'
import { FilterField, Note, Panel, Problem, TableWrap, day, human, stageLabel, useLoad } from './common'

type DelegationRow = {
  id: string; countryTerritory: string; primaryTeamLeaderName: string; teamLeaderEmail: string; numberOfTeams: number; numberOfObservers: number
  registrationStatus: string; paymentStatus: string; travelStatus: string; submittedAt: string | null; people: number
}
type PersonRow = {
  id: string; delegationId: string; displayName: string; badgeName: string | null; role: string; countryTerritory: string; teamName: string | null
  stage: string; checkedInAt: string | null; registrationStatus: string
  missingDetails?: string[]; needsGuardianConsent?: boolean; hasGuardianConsent?: boolean
}
type WelfareRow = {
  id: string; displayName: string; role: string; countryTerritory: string; genderForRoomAllocation: string | null
  foodAllergyNotes: string | null; medicalAccessibilityNotes: string | null; emergencyContact: string | null; roomTypePreference: string | null
}

const roleName = (role: string) => (role === 'team_leader' ? 'Team Leader' : human(role))

export function Countries({ onOpen }: { onOpen?: (delegationId: string) => void }) {
  const { data, error } = useLoad<{ delegations: DelegationRow[] }>('/api/admin/delegations')
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const rows = (data?.delegations ?? []).filter((d) => !term || `${d.countryTerritory} ${d.primaryTeamLeaderName} ${d.teamLeaderEmail}`.toLowerCase().includes(term))
  return (
    <Panel id="countries" title="Countries" intro={onOpen ? 'Every delegation and where it is in registration. Open one to see or fix it the way its Team Leader does.' : 'Every delegation and where it is in registration.'}>
      <div className="reg-filter-bar">
        <FilterField id="country-search" label="Search">
          <input id="country-search" className="reg-control reg-control-compact" type="search" placeholder="Country or Team Leader" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FilterField>
      </div>
      <Problem message={error} />
      {data && (rows.length === 0 ? <Note>No countries match.</Note> : (
        <TableWrap label="Countries">
          <thead><tr><th scope="col">Country</th><th scope="col">Team Leader</th><th scope="col">Teams</th><th scope="col">People</th><th scope="col">Registration</th><th scope="col">Payment</th>{onOpen && <th scope="col"><span className="reg-visually-hidden">Actions</span></th>}</tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id}>
              <th scope="row">{d.countryTerritory}</th>
              <td>{d.primaryTeamLeaderName}<small>{d.teamLeaderEmail}</small></td>
              <td>{d.numberOfTeams}<small>{d.numberOfObservers} {d.numberOfObservers === 1 ? 'observer' : 'observers'}</small></td>
              <td>{d.people}</td>
              <td>{human(d.registrationStatus)}{d.submittedAt && <small>{day(d.submittedAt)}</small>}</td>
              <td>{human(d.paymentStatus)}</td>
              {onOpen && <td><button type="button" className="reg-btn-link" onClick={() => onOpen(d.id)}>Open<span className="reg-visually-hidden"> {d.countryTerritory}</span> <ArrowRight size={16} aria-hidden="true" /></button></td>}
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
    </Panel>
  )
}

export function People({ onOpen }: { onOpen?: (delegationId: string) => void }) {
  const { data, error } = useLoad<{ people: PersonRow[]; stages: string[] }>('/api/admin/people')
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [role, setRole] = useState('')
  const [stage, setStage] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const people = useMemo(() => data?.people ?? [], [data])
  const countries = useMemo(() => [...new Set(people.map((p) => p.countryTerritory))], [people])
  const showDetails = people.some((p) => p.missingDetails)
  const consentInUse = people.some((p) => p.needsGuardianConsent)
  const term = search.trim().toLowerCase()
  const isMissing = (p: PersonRow) => Boolean(p.missingDetails?.length || (p.needsGuardianConsent && !p.hasGuardianConsent))
  const rows = people.filter((p) =>
    (!term || `${p.displayName} ${p.badgeName ?? ''}`.toLowerCase().includes(term)) && (!country || p.countryTerritory === country)
    && (!role || p.role === role) && (!stage || p.stage === stage) && (!onlyMissing || isMissing(p)))
  const counts = (data?.stages ?? []).map((s) => [s, people.filter((p) => p.stage === s).length] as const)

  return (
    <Panel id="people" title="People" intro="Everyone registered by every country, and how far each person has got: registered, payment under review, paid, badge issued, checked in.">
      {data && <ul className="reg-stage-legend">
        {counts.map(([s, n]) => <li key={s}><span className={`reg-stage-dot reg-stage-${s}`} aria-hidden="true" />{stageLabel[s]} <strong>{n}</strong></li>)}
      </ul>}
      <div className="reg-filter-bar">
        <FilterField id="people-search" label="Name">
          <input id="people-search" className="reg-control reg-control-compact" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FilterField>
        <FilterField id="people-country" label="Country">
          <select id="people-country" className="reg-control reg-control-compact" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>{countries.map((c) => <option key={c}>{c}</option>)}
          </select>
        </FilterField>
        <FilterField id="people-role" label="Role">
          <select id="people-role" className="reg-control reg-control-compact" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option><option value="contestant">Contestant</option><option value="team_leader">Team Leader</option><option value="observer">Observer</option>
          </select>
        </FilterField>
        <FilterField id="people-stage" label="Stage">
          <select id="people-stage" className="reg-control reg-control-compact" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>{(data?.stages ?? []).map((s) => <option key={s} value={s}>{stageLabel[s]}</option>)}
          </select>
        </FilterField>
        {showDetails && <label className="reg-check reg-filter-check"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /><span>Only people with details missing</span></label>}
      </div>
      <Problem message={error} />
      <p className="reg-status-line reg-muted" role="status">{data ? `Showing ${rows.length} of ${people.length}` : ''}</p>
      {data && (rows.length === 0 ? <Note>Nobody matches these filters.</Note> : (
        <TableWrap label="People">
          <thead><tr>
            <th scope="col">Person</th><th scope="col">Country and team</th><th scope="col">Role</th><th scope="col">Stage</th>
            {showDetails && <th scope="col">Details</th>}
            {consentInUse && <th scope="col">Guardian consent</th>}
            {onOpen && <th scope="col"><span className="reg-visually-hidden">Actions</span></th>}
          </tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.displayName}{p.badgeName && p.badgeName !== p.displayName && <small>Badge: {p.badgeName}</small>}</th>
              <td>{p.countryTerritory}{p.teamName && <small>{p.teamName}</small>}</td>
              <td>{roleName(p.role)}</td>
              <td><span className={`reg-stage-chip reg-stage-${p.stage}`}>{stageLabel[p.stage]}</span>{p.checkedInAt && <small>{day(p.checkedInAt)}</small>}</td>
              {showDetails && <td>{p.missingDetails?.length
                ? <span className="reg-chip is-attention" title={p.missingDetails.join(', ')}><CircleAlert size={13} aria-hidden="true" />{p.missingDetails.length} missing<span className="reg-visually-hidden">: {p.missingDetails.join(', ')}</span></span>
                : <span className="reg-chip is-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Complete</span>}</td>}
              {consentInUse && <td>{p.needsGuardianConsent ? (p.hasGuardianConsent ? 'Uploaded' : <strong className="reg-attn-text">Needed</strong>) : 'Not needed'}</td>}
              {onOpen && <td><button type="button" className="reg-btn-link" onClick={() => onOpen(p.delegationId)}>Open<span className="reg-visually-hidden"> {p.countryTerritory}</span> <ArrowRight size={16} aria-hidden="true" /></button></td>}
            </tr>
          ))}</tbody>
        </TableWrap>
      ))}
    </Panel>
  )
}

export function Welfare() {
  const { data, error } = useLoad<{ people: WelfareRow[] }>('/api/admin/welfare')
  const [onlyNotes, setOnlyNotes] = useState(false)
  const quiet = (text: string | null) => !text || /^(no restrictions|no special requirements)$/i.test(text.trim())
  const rows = (data?.people ?? []).filter((p) => !onlyNotes || !quiet(p.foodAllergyNotes) || !quiet(p.medicalAccessibilityNotes))
  return (
    <Panel id="welfare" title="Welfare" intro="Food, medical and emergency information for everyone. Passport data is not shown to this role.">
      <div className="reg-filter-bar">
        <label className="reg-check reg-filter-check"><input type="checkbox" checked={onlyNotes} onChange={(e) => setOnlyNotes(e.target.checked)} /><span>Only people with food or medical notes</span></label>
      </div>
      <Problem message={error} />
      {data && <TableWrap label="Welfare">
        <thead><tr><th scope="col">Person</th><th scope="col">Country</th><th scope="col">Food</th><th scope="col">Medical / access</th><th scope="col">Emergency contact</th><th scope="col">Room</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}>
            <th scope="row">{p.displayName}<small>{roleName(p.role)}</small></th><td>{p.countryTerritory}</td>
            <td>{p.foodAllergyNotes ?? '—'}</td><td>{p.medicalAccessibilityNotes ?? '—'}</td><td>{p.emergencyContact ?? '—'}</td>
            <td>{p.genderForRoomAllocation ?? '—'}{p.roomTypePreference && <small>{p.roomTypePreference}</small>}</td>
          </tr>
        ))}</tbody>
      </TableWrap>}
    </Panel>
  )
}
