import { Panel, Problem, human, stageLabel, useLoad } from './common'

type Count = { status: string; count: number }
type Dashboard = {
  registration: Count[]; payment: Count[]; travel: Count[]; people: Count[]; invites: Count[]; stages: Count[]; proofsWaiting: number
}

const total = (rows: Count[] = []) => rows.reduce((sum, r) => sum + r.count, 0)
const countOf = (rows: Count[] = [], status: string) => rows.find((r) => r.status === status)?.count ?? 0

export default function Overview({ onGo }: { onGo?: (section: string) => void }) {
  const { data, error } = useLoad<Dashboard>('/api/admin/dashboard')
  const group = (title: string, rows: Count[] = []) => (
    <div className="reg-stat-group">
      <h3>{title}</h3>
      <dl>{rows.length ? rows.map((r) => <div key={r.status}><dt>{human(r.status)}</dt><dd>{r.count}</dd></div>) : <div><dt>None yet</dt><dd>0</dd></div>}</dl>
    </div>
  )
  const people = total(data?.stages)
  return (
    <Panel id="overview" title="Statistics" intro="Live totals across every country.">
      <Problem message={error} />
      {data && <>
        <div className="reg-stats">
          <div><strong>{total(data.registration)}</strong><span>Countries with an account</span><small>{countOf(data.registration, 'submitted')} submitted</small></div>
          <div><strong>{people}</strong><span>People entered</span><small>{countOf(data.stages, 'paid') + countOf(data.stages, 'badge_issued') + countOf(data.stages, 'checked_in')} paid</small></div>
          <div>
            <strong>{data.proofsWaiting}</strong><span>Proofs waiting for Finance</span>
            {onGo && data.proofsWaiting > 0 && <button type="button" className="reg-inline-btn" onClick={() => onGo('payments')}>Review them</button>}
          </div>
          <div><strong>{countOf(data.invites, 'active')}</strong><span>Invitation codes not used yet</span><small>{countOf(data.invites, 'used')} used</small></div>
        </div>

        <h3 className="reg-staff-subhead">People by stage</h3>
        <div className="reg-stage-bar" role="img" aria-label={data.stages.map((s) => `${stageLabel[s.status]}: ${s.count}`).join(', ')}>
          {people > 0 && data.stages.filter((s) => s.count > 0).map((s) => (
            <span key={s.status} className={`reg-stage-${s.status}`} style={{ flexGrow: s.count }} />
          ))}
        </div>
        <ul className="reg-stage-legend">
          {data.stages.map((s) => <li key={s.status}><span className={`reg-stage-dot reg-stage-${s.status}`} aria-hidden="true" />{stageLabel[s.status]} <strong>{s.count}</strong></li>)}
        </ul>

        <div className="reg-stat-groups">{group('Registration', data.registration)}{group('Payment', data.payment)}{group('Travel', data.travel)}{group('People by role', data.people)}</div>
      </>}
    </Panel>
  )
}
