import { fmtDate, fmtNum } from './common'

export function BarChart(props: { bars: { label: string; value: number; current?: boolean }[]; unit?: string }) {
  const { bars, unit = '' } = props
  const W = 320
  const H = 140
  const top = 18
  const bottom = 18
  const max = Math.max(1, ...bars.map((b) => b.value))
  const pitch = W / bars.length
  const width = Math.min(22, pitch * 0.62)
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Столбчатая диаграмма">
        <defs>
          <linearGradient id="bar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        {bars.map((b, i) => {
          const h = (b.value / max) * (H - top - bottom)
          const x = i * pitch + (pitch - width) / 2
          const y = H - bottom - h
          const labelled = i === bars.length - 1 || b.value === max
          return (
            <g key={i}>
              <rect x={x} y={top} width={width} height={H - top - bottom} rx={5} className="bar-track" />
              {h > 0 && <rect x={x} y={y} width={width} height={Math.max(h, 3)} rx={5} fill="url(#bar-fill)" opacity={b.current ? 1 : 0.55} />}
              {labelled && b.value > 0 && (
                <text x={x + width / 2} y={y - 5} textAnchor="middle" className="tick strong">
                  {fmtNum(b.value, 1)}
                  {unit}
                </text>
              )}
              {(i % 3 === (bars.length - 1) % 3) && (
                <text x={x + width / 2} y={H - 4} textAnchor="middle" className="tick">
                  {b.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function Donut(props: { slices: { label: string; value: number; color: string }[]; centre: string; caption: string }) {
  const total = props.slices.reduce((s, x) => s + x.value, 0)
  const R = 42
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <figure className="chart donut">
      <svg viewBox="0 0 120 120" role="img" aria-label="Круговая диаграмма">
        <circle cx="60" cy="60" r={R} className="donut-track" />
        {total > 0 &&
          props.slices.map((s) => {
            const len = (s.value / total) * C
            const el = (
              <circle
                key={s.label}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            )
            offset += len
            return el
          })}
        <text x="60" y="58" textAnchor="middle" className="donut-centre">
          {props.centre}
        </text>
        <text x="60" y="72" textAnchor="middle" className="tick">
          {props.caption}
        </text>
      </svg>
      <ul className="legend">
        {props.slices.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{total ? Math.round((s.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export const weekLabel = (start: number): string => fmtDate(start).replace('.', '')
