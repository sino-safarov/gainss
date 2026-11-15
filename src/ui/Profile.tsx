import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { heatmap, muscleBalance, muscleStatus, weekStart, weekStreak, type HeatDay, type MuscleStatus } from '../domain/calc'
import { MUSCLES, MUSCLE_KEYS, type Muscle } from '../types'
import { fmtNum, useExercises } from './common'
import { MannequinFigure, STATUS, type Paint } from './Mannequin'
import { ReportButton } from './ReportButton'

const WEEKS = 26
const CELL = 12
const PITCH = 15
const LEFT = 20
const TOP = 16

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

function Mannequin({ paint }: { paint: Paint }) {
  return (
    <div className="mannequin">
      <svg viewBox="0 0 120 254" role="img" aria-label="Манекен, вид спереди">
        <MannequinFigure side="front" paint={paint} />
      </svg>
      <svg viewBox="0 0 120 254" role="img" aria-label="Манекен, вид сзади">
        <MannequinFigure side="back" paint={paint} />
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

      <ReportButton />
    </div>
  )
}
