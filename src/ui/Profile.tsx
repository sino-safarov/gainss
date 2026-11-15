import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { heatmap, muscleBalance, muscleStatus, weekStart, weekStreak, type HeatDay, type MuscleStatus } from '../domain/calc'
import { MUSCLES, MUSCLE_KEYS, type Muscle } from '../types'
import { fmtNum, useExercises } from './common'

const WEEKS = 26
const CELL = 12
const PITCH = 15
const LEFT = 20
const TOP = 16

const STATUS: Record<MuscleStatus, { label: string; color: string }> = {
  none: { label: 'нет нагрузки', color: 'var(--st-none)' },
  low: { label: 'отстаёт', color: 'var(--st-low)' },
  mid: { label: 'маловато', color: 'var(--st-mid)' },
  ok: { label: 'в норме', color: 'var(--st-ok)' },
  high: { label: 'очень много', color: 'var(--st-high)' },
}

function Heatmap({ days }: { days: HeatDay[] }) {
  const [picked, setPicked] = useState<HeatDay | null>(null)
  const months: { x: number; label: string }[] = []
  for (let w = 0; w < WEEKS; w++) {
    const d = new Date(days[w * 7].ts)
    const prev = w ? new Date(days[(w - 1) * 7].ts).getMonth() : -1
    if (d.getMonth() !== prev && w < WEEKS - 1)
      months.push({ x: LEFT + w * PITCH, label: d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '') })
  }
  const active = days.filter((d) => d.count > 0).length
  return (
    <div className="card heat">
      <svg viewBox={`0 0 ${LEFT + WEEKS * PITCH} ${TOP + 7 * PITCH}`} role="img" aria-label="Календарь тренировок">
        {months.map((m) => (
          <text key={m.x} x={m.x} y={10} className="tick">
            {m.label}
          </text>
        ))}
        {['Пн', 'Ср', 'Пт'].map((label, i) => (
          <text key={label} x={0} y={TOP + i * 2 * PITCH + 10} className="tick">
            {label}
          </text>
        ))}
        {days.map((d, i) =>
          d.future ? null : (
            <rect
              key={d.ts}
              x={LEFT + Math.floor(i / 7) * PITCH}
              y={TOP + (i % 7) * PITCH}
              width={CELL}
              height={CELL}
              rx={3}
              className={`heat-${d.level}${picked?.ts === d.ts ? ' picked' : ''}`}
              onClick={() => setPicked(d)}
            />
          ),
        )}
      </svg>
      <div className="heat-foot">
        <span className="muted small">
          {picked
            ? `${new Date(picked.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ${
                picked.count ? `${picked.count} подх.` : 'отдых'
              }`
            : `${active} тренировочных дней за полгода`}
        </span>
        <span className="heat-scale" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`heat-${l}`} />
          ))}
        </span>
      </div>
    </div>
  )
}

type Paint = (m: Muscle) => { fill: string; onClick: () => void; className: string }

/** Stylised mannequin, front and back. Each muscle shape is filled with its status colour. */
function Mannequin({ paint }: { paint: Paint }) {
  const pair = (m: Muscle, cx: number, cy: number, rx: number, ry: number) => (
    <>
      <ellipse {...paint(m)} cx={60 - cx} cy={cy} rx={rx} ry={ry} />
      <ellipse {...paint(m)} cx={60 + cx} cy={cy} rx={rx} ry={ry} />
    </>
  )
  const frame = (
    <g className="body-frame">
      <circle cx="60" cy="17" r="12" />
      <rect x="54" y="27" width="12" height="12" rx="4" />
      <rect x="37" y="36" width="46" height="84" rx="15" />
      <path d="M36 44 L20 98 L17 124" />
      <path d="M84 44 L100 98 L103 124" />
      <path d="M50 116 L48 240" />
      <path d="M70 116 L72 240" />
      <ellipse cx="46" cy="246" rx="9" ry="4.5" />
      <ellipse cx="74" cy="246" rx="9" ry="4.5" />
    </g>
  )
  return (
    <div className="mannequin">
      <svg viewBox="0 0 120 254" role="img" aria-label="Манекен, вид спереди">
        {frame}
        {pair('shoulders', 25, 47, 10, 9)}
        <rect {...paint('chest')} x="39.5" y="41" width="19.5" height="21" rx="8" />
        <rect {...paint('chest')} x="61" y="41" width="19.5" height="21" rx="8" />
        {pair('biceps', 31, 72, 6.5, 14)}
        {pair('forearms', 39, 104, 5.5, 15)}
        {[66, 78, 90].map((y) => (
          <g key={y}>
            <rect {...paint('abs')} x="47.5" y={y} width="11.5" height="10" rx="3.5" />
            <rect {...paint('abs')} x="61" y={y} width="11.5" height="10" rx="3.5" />
          </g>
        ))}
        {pair('quads', 11, 150, 10.5, 29)}
        {pair('calves', 12, 212, 7, 22)}
      </svg>
      <svg viewBox="0 0 120 254" role="img" aria-label="Манекен, вид сзади">
        {frame}
        <path {...paint('back')} d="M60 32 L78 42 L60 58 L42 42 Z" strokeLinejoin="round" />
        {pair('shoulders', 25, 47, 10, 9)}
        <path {...paint('back')} d="M41 52 Q41 48 45 50 L58 60 L58 90 Q48 88 43 74 Z" />
        <path {...paint('back')} d="M79 52 Q79 48 75 50 L62 60 L62 90 Q72 88 77 74 Z" />
        {pair('triceps', 31, 72, 6.5, 14)}
        {pair('forearms', 39, 104, 5.5, 15)}
        {pair('glutes', 10.5, 110, 10, 10.5)}
        {pair('hams', 11, 153, 10.5, 27)}
        {pair('calves', 12, 211, 8.5, 21)}
      </svg>
    </div>
  )
}

export function Profile() {
  const exercises = useExercises()
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const workouts = useLiveQuery(() => db.workouts.where('status').equals('done').toArray(), [])
  const [picked, setPicked] = useState<Muscle | null>(null)
  const now = useMemo(() => Date.now(), [sets])

  if (!exercises || !sets || !workouts) return null

  const days = heatmap(sets, WEEKS, now)
  const balance = muscleBalance(sets, exercises.map, now)
  const times = workouts.map((w) => w.startedAt)
  const thisWeek = times.filter((t) => t >= weekStart(now)).length
  const streak = weekStreak(times, now)
  const statusOf = (m: Muscle) => muscleStatus(balance[m] ?? 0)
  const paint: Paint = (m) => ({
    fill: STATUS[statusOf(m)].color,
    onClick: () => setPicked(m),
    className: picked === m ? 'muscle picked' : 'muscle',
  })
  const ranked = [...MUSCLE_KEYS].sort((a, b) => (balance[a] ?? 0) - (balance[b] ?? 0))
  const lagging = ranked.filter((m) => statusOf(m) === 'low' || statusOf(m) === 'none')

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Профиль</h1>
      </header>

      <div className="tiles">
        <div className="tile">
          <b>{workouts.length}</b>
          <span>тренировок всего</span>
        </div>
        <div className="tile">
          <b>{thisWeek}</b>
          <span>на этой неделе</span>
        </div>
        <div className="tile">
          <b>{streak}</b>
          <span>недель подряд</span>
        </div>
      </div>

      <h2>Активность</h2>
      <Heatmap days={days} />

      <h2>Баланс мышц</h2>
      <div className="card">
        {sets.length === 0 ? (
          <p className="muted">Манекен раскрасится после первой тренировки.</p>
        ) : (
          <p className="muted small">
            {lagging.length
              ? `Отстают: ${lagging.map((m) => MUSCLES[m].toLowerCase()).join(', ')}.`
              : 'Отстающих групп нет.'}{' '}
            Цвет — среднее число рабочих подходов в неделю за последние 4 недели.
          </p>
        )}
        <Mannequin paint={paint} />
        <ul className="legend row">
          {(Object.keys(STATUS) as MuscleStatus[]).map((s) => (
            <li key={s}>
              <i style={{ background: STATUS[s].color }} />
              <span>{STATUS[s].label}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Ориентир: меньше 5 подходов в неделю — отстаёт, 5–9 — маловато, 10–20 — норма.</p>
      </div>

      <ul className="list">
        {ranked.map((m) => (
          <li key={m}>
            <button type="button" className={picked === m ? 'row picked' : 'row'} onClick={() => setPicked(m)}>
              <span className="dot-label">
                <i style={{ background: STATUS[statusOf(m)].color }} />
                {MUSCLES[m]}
              </span>
              <span className="muted">
                {fmtNum(balance[m] ?? 0, 1)} подх./нед · {STATUS[statusOf(m)].label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
