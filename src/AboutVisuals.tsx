import { mapFrame, olympiads, type Olympiad } from './aboutData'

// Map position as a percentage of the dot map (same projection as world-dots.svg).
const project = ({ lat, lon }: Olympiad) => ({
  left: ((lon - mapFrame.lonMin) * mapFrame.scale / mapFrame.width) * 100,
  top: ((mapFrame.latMax - lat) * mapFrame.scale / mapFrame.height) * 100,
})

// One marker per host country, placed at its first host city.
const hostCountries = [...olympiads.reduce((byCountry, o) => byCountry.set(o.country, [...(byCountry.get(o.country) ?? []), o]), new Map<string, Olympiad[]>())]
  .map(([country, list]) => ({ country, list, ...project(list[0]) }))

const mapLabels: Record<string, { text: string; side: 'left' | 'right' | 'below' }> = {
  Bulgaria: { text: 'Borovets 2003 · the first IOL', side: 'below' },
  'United States': { text: 'Pittsburgh 2011', side: 'left' },
  Brazil: { text: 'Brasília 2024', side: 'right' },
  Thailand: { text: 'Bangkok 2027', side: 'right' },
}

/** Dot map of every host city. The list under it carries the same facts for keyboard and screen-reader users. */
export function HostMap() {
  return <div className="host-map" aria-hidden="true">
    <img src="/assets/about/world-dots.svg" alt="" />
    {hostCountries.map(({ country, list, left, top }) => {
      const label = mapLabels[country]
      return <span key={country} className={`host-marker${country === 'Thailand' ? ' host-marker-next' : ''}`} style={{ left: `${left}%`, top: `${top}%` }}>
        <span className="host-marker-tip"><strong>{country}</strong>{list.map((o) => <span key={o.year}>{o.city} · {o.year}</span>)}</span>
        {label && <span className={`host-marker-label host-marker-label-${label.side}`}>{label.text}</span>}
      </span>
    })}
  </div>
}

const chartMax = 300
const chartTicks = [0, 100, 200, 300]
const labelledYears = new Set([2003, 2010, 2015, 2020, 2026])
const byYear = new Map(olympiads.map((o) => [o.year, o]))

/** Contestants per olympiad, 2003–2026, one column per year (2020 is an empty slot). */
export function GrowthChart() {
  const years = Array.from({ length: 2026 - 2003 + 1 }, (_, i) => 2003 + i)
  return <div className="growth-plot" role="img" aria-label="Contestants per olympiad grew from 33 in 2003 to 255 in 2026. There was no olympiad in 2020.">
    <div className="growth-grid" aria-hidden="true">{chartTicks.map((tick) => <span key={tick} data-tick={tick} style={{ bottom: `${tick / chartMax * 100}%` }} />)}</div>
    <div className="growth-bars" aria-hidden="true">
      {years.map((year) => {
        const o = byYear.get(year)
        const height = o?.contestants ? o.contestants / chartMax * 100 : 0
        return <div key={year} className="growth-col">
          {o?.contestants ? <>
            <span className="growth-bar" style={{ height: `${height}%` }} />
            {(year === 2003 || year === 2026) && <span className="growth-value" style={{ bottom: `${height}%` }}>{o.contestants}</span>}
            <span className="growth-tip" style={{ bottom: `calc(${height}% + 12px)` }}><strong>{year} · {o.city}</strong>{o.contestants} contestants · {o.teams} teams · {o.countries} countries</span>
          </> : <span className="growth-gap" />}
          {labelledYears.has(year) && <span className="growth-year">{year}</span>}
        </div>
      })}
    </div>
  </div>
}

const medalKinds = [
  { key: 'gold', letter: 'G', count: 1, label: 'gold' },
  { key: 'silver', letter: 'S', count: 2, label: 'silver' },
  { key: 'bronze', letter: 'B', count: 3, label: 'bronze' },
  { key: 'mention', letter: 'H', count: 6, label: 'honourable mentions' },
  { key: 'certificate', letter: '', count: 12, label: 'certificates of participation' },
]

/** Roughly how 24 contestants share the awards: medals in a 1:2:3 ratio for a quarter, mentions for the rest of the top half. */
export function MedalDots() {
  return <div className="medal-figure">
    <div className="medal-dots" role="img" aria-label="Out of every 24 contestants, roughly 1 wins gold, 2 silver, 3 bronze and 6 an honourable mention. The other 12 receive a certificate of participation.">
      {medalKinds.flatMap((kind) => Array.from({ length: kind.count }, (_, i) => <span key={`${kind.key}-${i}`} className={`medal-dot medal-${kind.key}`} aria-hidden="true">{kind.letter}</span>))}
    </div>
    <ul className="medal-legend">{medalKinds.map((kind) => <li key={kind.key}><span className={`medal-dot medal-${kind.key}`} aria-hidden="true">{kind.letter}</span><span><strong>{kind.count}</strong> {kind.label}</span></li>)}</ul>
  </div>
}

export function ThaiFlag({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 9 6" role="img" aria-label="Flag of Thailand"><rect width="9" height="6" fill="#a51931" /><rect y="1" width="9" height="4" fill="#f4f5f8" /><rect y="2" width="9" height="2" fill="#2d2a4a" /></svg>
}
