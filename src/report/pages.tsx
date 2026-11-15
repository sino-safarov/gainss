import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { muscleStatus, type HeatDay, type WeekTotals } from '../domain/calc'
import { MUSCLE_COLORS, MUSCLES, MUSCLE_KEYS, type Muscle } from '../types'
import { MannequinFigure, STATUS } from '../ui/Mannequin'
import { A4 } from './pdf'

export interface ReportExercise {
  name: string
  sessions: number
  last: string
  lastDate: number
  maxWeight: number
  best1rm: number
  stalled: boolean
}

export interface ReportData {
  now: number
  firstAt: number | null
  workouts: number
  streak: number
  tonnage: number
  bodyKg: number | null
  heat: HeatDay[]
  balance: Partial<Record<Muscle, number>>
  weeks: WeekTotals[]
  /** Working sets per muscle over the last four weeks. */
  distribution: Partial<Record<Muscle, number>>
  body: { ts: number; kg: number }[]
  exercises: ReportExercise[]
}

const C = {
  bg: '#07090c',
  card: '#141920',
  line: '#232a33',
  text: '#f4f6f8',
  muted: '#8a94a3',
  accent: '#b6f34a',
  accent2: '#34d399',
  warn: '#fbbf24',
}
const HEAT = ['#1b2027', '#1d4d35', '#2c8a52', '#5fd068', '#b6f34a']
const FONT = "-apple-system, system-ui, 'SF Pro Text', 'Helvetica Neue', Roboto, Arial, sans-serif"
const M = 36
const INNER = A4.width - M * 2
const FIRST_PAGE_ROWS = 19
const PAGE_ROWS = 31

const num = (n: number, digits = 1) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits, useGrouping: false })
const day = (ts: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(ts).toLocaleDateString('ru-RU', opts).replace('.', '')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function T(props: {
  x: number
  y: number
  size?: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  children: ReactNode
}) {
  return (
    <text x={props.x} y={props.y} fontSize={props.size ?? 10} fontWeight={props.weight ?? 400} fill={props.fill ?? C.text} textAnchor={props.anchor ?? 'start'}>
      {props.children}
    </text>
  )
}

const Card = (p: { x: number; y: number; w: number; h: number }) => (
  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={14} fill={C.card} stroke={C.line} />
)

const Section = ({ y, children }: { y: number; children: string }) => (
  <text x={M} y={y} fontSize={9} fontWeight={700} fill={C.muted} letterSpacing={1.2}>
    {children.toUpperCase()}
  </text>
)

function Page(props: { n: number; total: number; date: string; children: ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={A4.width} height={A4.height} viewBox={`0 0 ${A4.width} ${A4.height}`} fontFamily={FONT}>
      <defs>
        <radialGradient id="glow" cx="50%" cy="0%" r="75%">
          <stop offset="0" stopColor={C.accent2} stopOpacity="0.22" />
          <stop offset="1" stopColor={C.accent2} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.accent} />
          <stop offset="1" stopColor={C.accent2} />
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.accent} />
          <stop offset="1" stopColor={C.accent2} />
        </linearGradient>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.accent} stopOpacity="0.35" />
          <stop offset="1" stopColor={C.accent} stopOpacity="0" />
        </linearGradient>
        <style>{`.body-frame > * { fill: ${C.line}; } .body-frame path { fill: none; stroke: ${C.line}; stroke-width: 15; stroke-linecap: round; stroke-linejoin: round; } .muscle { stroke: ${C.card}; stroke-width: 1.2; }`}</style>
      </defs>
      <rect width={A4.width} height={A4.height} fill={C.bg} />
      <rect width={A4.width} height={320} fill="url(#glow)" />
      {props.children}
      <T x={M} y={A4.height - 20} size={8} fill={C.muted}>
        Gainss · отчёт от {props.date}
      </T>
      <T x={A4.width - M} y={A4.height - 20} size={8} fill={C.muted} anchor="end">
        {props.n} / {props.total}
      </T>
    </svg>
  )
}

function Tiles({ d, y }: { d: ReportData; y: number }) {
  const tiles = [
    [String(d.workouts), 'тренировок всего'],
    [String(d.streak), 'недель подряд'],
    [`${num(d.tonnage / 1000, 0)} т`, 'поднято за всё время'],
    [d.bodyKg === null ? '—' : `${num(d.bodyKg)} кг`, 'вес тела'],
  ]
  const w = (INNER - 30) / 4
  return (
    <>
      {tiles.map(([value, label], i) => (
        <g key={label}>
          <Card x={M + i * (w + 10)} y={y} w={w} h={62} />
          <text x={M + i * (w + 10) + 14} y={y + 33} fontSize={22} fontWeight={800} fill="url(#grad)">
            {value}
          </text>
          <T x={M + i * (w + 10) + 14} y={y + 49} size={8.5} fill={C.muted}>
            {label}
          </T>
        </g>
      ))}
    </>
  )
}

function Heat({ days, y }: { days: HeatDay[]; y: number }) {
  const weeks = days.length / 7
  const left = M + 36
  const pitch = (INNER - 52) / weeks
  const cell = pitch - 3
  const top = y + 30
  const months: ReactNode[] = []
  for (let w = 0; w < weeks - 1; w++) {
    const m = new Date(days[w * 7].ts).getMonth()
    if (w === 0 || m !== new Date(days[(w - 1) * 7].ts).getMonth())
      months.push(
        <T key={w} x={left + w * pitch} y={y + 22} size={8} fill={C.muted}>
          {day(days[w * 7].ts, { month: 'short' })}
        </T>,
      )
  }
  return (
    <>
      <Card x={M} y={y} w={INNER} h={7 * pitch + 44} />
      {months}
      {['Пн', 'Ср', 'Пт'].map((label, i) => (
        <T key={label} x={M + 14} y={top + i * 2 * pitch + cell - 3} size={8} fill={C.muted}>
          {label}
        </T>
      ))}
      {days.map((d, i) =>
        d.future ? null : (
          <rect key={d.ts} x={left + Math.floor(i / 7) * pitch} y={top + (i % 7) * pitch} width={cell} height={cell} rx={3.5} fill={HEAT[d.level]} />
        ),
      )}
    </>
  )
}

function Balance({ d, y }: { d: ReportData; y: number }) {
  const statusOf = (m: Muscle) => muscleStatus(d.balance[m] ?? 0)
  const paint = (m: Muscle) => ({ fill: STATUS[statusOf(m)].color, className: 'muscle' })
  const ranked = [...MUSCLE_KEYS].sort((a, b) => (d.balance[a] ?? 0) - (d.balance[b] ?? 0))
  const listX = M + 262
  const barX = listX + 94
  const barW = 84
  return (
    <>
      <Card x={M} y={y} w={INNER} h={250} />
      <g transform={`translate(${M + 16} ${y + 14}) scale(0.86)`}>
        <MannequinFigure side="front" paint={paint} />
      </g>
      <g transform={`translate(${M + 132} ${y + 14}) scale(0.86)`}>
        <MannequinFigure side="back" paint={paint} />
      </g>
      {ranked.map((m, i) => {
        const v = d.balance[m] ?? 0
        const rowY = y + 28 + i * 18.5
        return (
          <g key={m}>
            <circle cx={listX + 4} cy={rowY - 3} r={3.5} fill={STATUS[statusOf(m)].color} />
            <T x={listX + 14} y={rowY} size={9.5} weight={600}>
              {MUSCLES[m]}
            </T>
            <rect x={barX} y={rowY - 7} width={barW} height={6} rx={3} fill={C.line} />
            {v > 0 && <rect x={barX} y={rowY - 7} width={Math.max(4, Math.min(1, v / 20) * barW)} height={6} rx={3} fill={STATUS[statusOf(m)].color} />}
            <T x={M + INNER - 14} y={rowY} size={9} fill={C.muted} anchor="end">
              {num(v)} / нед
            </T>
          </g>
        )
      })}
      {(['none', 'low', 'mid', 'ok', 'high'] as const).map((s, i) => (
        <g key={s}>
          <circle cx={M + 22 + i * 100} cy={y + 236} r={3.5} fill={STATUS[s].color} />
          <T x={M + 30 + i * 100} y={y + 239} size={8.5} fill={C.muted}>
            {STATUS[s].label}
          </T>
        </g>
      ))}
    </>
  )
}

function Bars({ weeks, y }: { weeks: WeekTotals[]; y: number }) {
  const h = 74
  const max = Math.max(1, ...weeks.map((w) => w.tonnage))
  const pitch = (INNER - 28) / weeks.length
  const width = pitch * 0.56
  const base = y + h + 22
  return (
    <>
      <Card x={M} y={y} w={INNER} h={h + 46} />
      {weeks.map((w, i) => {
        const bh = (w.tonnage / max) * h * 0.82
        const x = M + 14 + i * pitch + (pitch - width) / 2
        return (
          <g key={w.start}>
            <rect x={x} y={base - h * 0.82} width={width} height={h * 0.82} rx={5} fill="#ffffff" opacity={0.04} />
            {bh > 0 && <rect x={x} y={base - bh} width={width} height={Math.max(bh, 3)} rx={5} fill="url(#bar)" opacity={i === weeks.length - 1 ? 1 : 0.6} />}
            {w.tonnage > 0 && (
              <T x={x + width / 2} y={base - bh - 4} size={7.5} weight={700} anchor="middle">
                {num(w.tonnage / 1000)}
              </T>
            )}
            <T x={x + width / 2} y={base + 12} size={7.5} fill={C.muted} anchor="middle">
              {day(w.start)}
            </T>
          </g>
        )
      })}
    </>
  )
}

function Donut({ d, x, y, w }: { d: ReportData; x: number; y: number; w: number }) {
  const slices = MUSCLE_KEYS.filter((m) => d.distribution[m])
    .map((m) => ({ m, value: d.distribution[m]! }))
    .sort((a, b) => b.value - a.value)
  const total = slices.reduce((s, v) => s + v.value, 0)
  const R = 44
  const circ = 2 * Math.PI * R
  const cx = x + 66
  const cy = y + 100
  let offset = 0
  return (
    <>
      <Card x={x} y={y} w={w} h={200} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.line} strokeWidth={15} />
      {slices.map(({ m, value }) => {
        const len = (value / total) * circ
        const el = (
          <circle
            key={m}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={MUSCLE_COLORS[m]}
            strokeWidth={15}
            strokeDasharray={`${Math.max(0, len - 1.5)} ${circ - Math.max(0, len - 1.5)}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += len
        return el
      })}
      <T x={cx} y={cy + 3} size={20} weight={800} anchor="middle">
        {num(total, 0)}
      </T>
      <T x={cx} y={cy + 15} size={7.5} fill={C.muted} anchor="middle">
        подх. за 4 нед.
      </T>
      {slices.map(({ m, value }, i) => (
        <g key={m}>
          <circle cx={x + 136} cy={y + 21 + i * 15.5} r={3.5} fill={MUSCLE_COLORS[m]} />
          <T x={x + 145} y={y + 24 + i * 15.5} size={9} fill={C.muted}>
            {MUSCLES[m]}
          </T>
          <T x={x + w - 14} y={y + 24 + i * 15.5} size={9} weight={700} anchor="end">
            {Math.round((value / total) * 100)}%
          </T>
        </g>
      ))}
      {total === 0 && (
        <T x={x + 136} y={y + 104} size={9} fill={C.muted}>
          Пока нет данных
        </T>
      )}
    </>
  )
}

function BodyChart({ d, x, y, w }: { d: ReportData; x: number; y: number; w: number }) {
  const pts = d.body
  const box = { l: x + 16, r: x + w - 16, t: y + 56, b: y + 172 }
  const xs = pts.map((p) => p.ts)
  const ys = pts.map((p) => p.kg)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = (v: number) => (x1 === x0 ? (box.l + box.r) / 2 : box.l + ((v - x0) / (x1 - x0)) * (box.r - box.l))
  const sy = (v: number) => (y1 === y0 ? (box.t + box.b) / 2 : box.b - ((v - y0) / (y1 - y0)) * (box.b - box.t))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.ts).toFixed(1)},${sy(p.kg).toFixed(1)}`).join(' ')
  return (
    <>
      <Card x={x} y={y} w={w} h={200} />
      {pts.length === 0 ? (
        <T x={x + 16} y={y + 104} size={9} fill={C.muted}>
          Вес тела ещё не записывался
        </T>
      ) : (
        <>
          <T x={x + 16} y={y + 34} size={20} weight={800}>
            {num(ys[ys.length - 1])} кг
          </T>
          <T x={x + w - 16} y={y + 24} size={8} fill={C.muted} anchor="end">
            мин {num(y0)} · макс {num(y1)}
          </T>
          {pts.length > 1 && <path d={`${path} L${sx(x1).toFixed(1)},${box.b} L${sx(x0).toFixed(1)},${box.b} Z`} fill="url(#area)" />}
          <path d={path} fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pts.length === 1 && <circle cx={sx(x0)} cy={sy(y0)} r={3} fill={C.accent} />}
          <line x1={box.l} x2={box.r} y1={box.b} y2={box.b} stroke={C.line} />
          <T x={box.l} y={box.b + 13} size={7.5} fill={C.muted}>
            {day(x0)}
          </T>
          <T x={box.r} y={box.b + 13} size={7.5} fill={C.muted} anchor="end">
            {day(x1)}
          </T>
        </>
      )}
    </>
  )
}

function Table({ rows, y }: { rows: ReportExercise[]; y: number }) {
  const cols = { name: M + 14, sessions: M + 262, last: M + 345, max: M + 410, rm: M + 463, status: M + INNER - 14 }
  const rowH = 22
  return (
    <>
      <Card x={M} y={y} w={INNER} h={rows.length * rowH + 34} />
      <g fontSize={8} fontWeight={700} fill={C.muted}>
        <text x={cols.name} y={y + 20}>УПРАЖНЕНИЕ</text>
        <text x={cols.sessions} y={y + 20} textAnchor="end">ТРЕН.</text>
        <text x={cols.last} y={y + 20} textAnchor="end">ПОСЛЕДНЯЯ</text>
        <text x={cols.max} y={y + 20} textAnchor="end">МАКС., КГ</text>
        <text x={cols.rm} y={y + 20} textAnchor="end">1ПМ, КГ</text>
        <text x={cols.status} y={y + 20} textAnchor="end">ДАТА</text>
      </g>
      {rows.map((r, i) => {
        const ry = y + 44 + i * rowH
        return (
          <g key={r.name + i}>
            <line x1={M + 14} x2={M + INNER - 14} y1={ry - 15} y2={ry - 15} stroke={C.line} />
            <T x={cols.name} y={ry} size={9.5} weight={600}>
              {clip(r.name, r.stalled ? 34 : 42)}
            </T>
            {r.stalled && (
              <T x={cols.sessions - 34} y={ry} size={7.5} weight={700} fill={C.warn} anchor="end">
                ЗАСТОЙ
              </T>
            )}
            <T x={cols.sessions} y={ry} size={9.5} fill={C.muted} anchor="end">
              {r.sessions}
            </T>
            <T x={cols.last} y={ry} size={9.5} anchor="end">
              {r.last}
            </T>
            <T x={cols.max} y={ry} size={9.5} anchor="end">
              {num(r.maxWeight, 2)}
            </T>
            <T x={cols.rm} y={ry} size={9.5} weight={700} fill={C.accent} anchor="end">
              {r.best1rm ? num(r.best1rm) : '—'}
            </T>
            <T x={cols.status} y={ry} size={9} fill={C.muted} anchor="end">
              {day(r.lastDate)}
            </T>
          </g>
        )
      })}
    </>
  )
}

/** Renders the report as standalone SVG documents, one per A4 page. */
export function buildReportPages(d: ReportData): string[] {
  const full = (ts: number) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const date = full(d.now)
  const rest = d.exercises.slice(FIRST_PAGE_ROWS)
  const extra: ReportExercise[][] = []
  for (let i = 0; i < rest.length; i += PAGE_ROWS) extra.push(rest.slice(i, i + PAGE_ROWS))
  const total = 2 + extra.length
  const half = (INNER - 12) / 2

  const pages = [
    <Page n={1} total={total} date={date}>
      <text x={M} y={58} fontSize={12} fontWeight={800} fill="url(#grad)" letterSpacing={2}>
        GAINSS
      </text>
      <T x={M} y={88} size={28} weight={800}>
        Отчёт о тренировках
      </T>
      <T x={M} y={106} size={10} fill={C.muted}>
        {d.firstAt ? `${full(d.firstAt)} — ${date}` : date}
      </T>
      <Tiles d={d} y={120} />
      <Section y={204}>Активность за полгода</Section>
      <Heat days={d.heat} y={212} />
      <Section y={404}>Баланс мышц · рабочих подходов в неделю за 4 недели</Section>
      <Balance d={d} y={412} />
      <Section y={682}>Тоннаж по неделям, т</Section>
      <Bars weeks={d.weeks} y={690} />
    </Page>,
    <Page n={2} total={total} date={date}>
      <Section y={52}>Распределение нагрузки</Section>
      <Donut d={d} x={M} y={60} w={half} />
      <text x={M + half + 12} y={52} fontSize={9} fontWeight={700} fill={C.muted} letterSpacing={1.2}>
        ВЕС ТЕЛА
      </text>
      <BodyChart d={d} x={M + half + 12} y={60} w={half} />
      <Section y={290}>Упражнения и личные рекорды</Section>
      {d.exercises.length ? (
        <Table rows={d.exercises.slice(0, FIRST_PAGE_ROWS)} y={298} />
      ) : (
        <T x={M} y={316} size={10} fill={C.muted}>
          Записанных упражнений пока нет.
        </T>
      )}
    </Page>,
    ...extra.map((rows, i) => (
      <Page n={3 + i} total={total} date={date}>
        <Section y={52}>Упражнения и личные рекорды (продолжение)</Section>
        <Table rows={rows} y={60} />
      </Page>
    )),
  ]
  return pages.map((p) => renderToStaticMarkup(p))
}
