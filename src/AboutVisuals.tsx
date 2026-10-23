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
      // Countries that have hosted more than once get a bigger marker with the number of times inside.
      const times = list.length
      return <span key={country} className={`host-marker${country === 'Thailand' ? ' host-marker-next' : ''}${times > 1 ? ' host-marker-multi' : ''}`} style={{ left: `${left}%`, top: `${top}%`, ...(times > 1 ? { '--size': `${12 + 4 * times}px` } as React.CSSProperties : {}) }}>
        {times > 1 && <span className="host-marker-count">{times}</span>}
        <span className="host-marker-tip"><strong>{country}{times > 1 ? ` · hosted ${times} times` : ''}</strong>{list.map((o) => <span key={o.year}>{o.city} · {o.year}</span>)}</span>
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
