import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import {
  isPlateau,
  muscleVolume,
  recordsOf,
  sessionScore,
  sessionsOf,
  sessionVolume,
  topWeight,
  weeklySeries,
  weekStart,
  type Session,
} from '../domain/calc'
import { MUSCLE_COLORS, MUSCLES, MUSCLE_KEYS, type Exercise } from '../types'
import { BarChart, Donut, weekLabel } from './charts'
import { fmtDate, fmtNum, LineChart, Sheet, useExercises } from './common'

const WEEK = 7 * 24 * 60 * 60 * 1000
type Metric = 'score' | 'weight' | 'volume'

function ExerciseDetail({ ex, sessions, onClose }: { ex: Exercise; sessions: Session[]; onClose: () => void }) {
  const [metric, setMetric] = useState<Metric>('score')
  const records = recordsOf(sessions)
  const weighted = sessions.some((s) => topWeight(s) > 0)
  const value = (s: Session) => (metric === 'score' ? sessionScore(s) : metric === 'weight' ? topWeight(s) : sessionVolume(s))
  const unit = metric === 'score' && !weighted ? ' повт.' : ' кг'
  return (
    <Sheet title={ex.name} onClose={onClose}>
      {isPlateau(sessions) && (
        <div className="card notice">
          <p>Застой: за последние 3 тренировки лучший результат не вырос.</p>
        </div>
      )}
      <div className="chips">
        {(
          [
            ['score', weighted ? 'Расчётный 1ПМ' : 'Макс. повторы'],
            ['weight', 'Макс. вес'],
            ['volume', 'Объём'],
          ] as [Metric, string][]
        ).map(([m, label]) => (
          <button type="button" key={m} className={metric === m ? 'chip on' : 'chip'} onClick={() => setMetric(m)}>
            {label}
          </button>
        ))}
      </div>
      <LineChart points={sessions.map((s) => ({ x: s.date, y: value(s) }))} unit={unit} />

      <h3>Личные рекорды</h3>
      <dl className="records">
        {records.maxWeight && (
          <>
            <dt>Макс. вес</dt>
            <dd>
              {fmtNum(records.maxWeight.weight)} кг × {records.maxWeight.reps}
              <small className="muted"> {fmtDate(records.maxWeight.date)}</small>
            </dd>
          </>
        )}
        {records.bestE1rm && (
          <>
            <dt>Расчётный 1ПМ</dt>
            <dd>
              {fmtNum(records.bestE1rm.value, 1)} кг
              <small className="muted">
                {' '}
                {fmtNum(records.bestE1rm.weight)}×{records.bestE1rm.reps}, {fmtDate(records.bestE1rm.date)}
              </small>
            </dd>
          </>
        )}
        {records.bestVolume && (
          <>
            <dt>Объём за тренировку</dt>
            <dd>
              {fmtNum(records.bestVolume.value, 0)} кг
              <small className="muted"> {fmtDate(records.bestVolume.date)}</small>
            </dd>
          </>
        )}
      </dl>

      <h3>Лучшие повторы по весам</h3>
      <ul className="plain">
        {records.repsAtWeight.slice(0, 6).map((r) => (
          <li key={r.weight}>
            {fmtNum(r.weight)} кг × {r.reps} <small className="muted">{fmtDate(r.date)}</small>
          </li>
        ))}
      </ul>

      <h3>Последние тренировки</h3>
      <ul className="plain">
        {sessions
          .slice(-8)
          .reverse()
          .map((s) => (
            <li key={s.workoutId}>
              <small className="muted">{fmtDate(s.date)}</small> {s.sets.map((x) => `${fmtNum(x.weight)}×${x.reps}`).join(' · ')}
            </li>
          ))}
      </ul>
    </Sheet>
  )
}

export function Progress() {
  const exercises = useExercises()
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const [selected, setSelected] = useState<number | null>(null)

  const sessionsByExercise = useMemo(() => {
    const grouped = new Map<number, typeof sets & object>()
    for (const s of sets ?? []) {
      const list = grouped.get(s.exerciseId)
      if (list) list.push(s)
      else grouped.set(s.exerciseId, [s])
    }
    const out = new Map<number, Session[]>()
    for (const [id, list] of grouped) {
      const sessions = sessionsOf(list)
      if (sessions.length) out.set(id, sessions)
    }
    return out
  }, [sets])

  if (!exercises || !sets) return null

  const thisWeek = weekStart(Date.now())
  const now = muscleVolume(sets, exercises.map, thisWeek, thisWeek + WEEK)
  const prev = muscleVolume(sets, exercises.map, thisWeek - WEEK, thisWeek)
  const muscles = MUSCLE_KEYS.filter((m) => now[m] || prev[m])
  const maxSets = Math.max(1, ...muscles.map((m) => Math.max(now[m]?.sets ?? 0, prev[m]?.sets ?? 0)))

  const tracked = [...sessionsByExercise.entries()]
    .map(([id, sessions]) => ({ ex: exercises.map.get(id), sessions }))
    .filter((x): x is { ex: Exercise; sessions: Session[] } => !!x.ex)
    .sort((a, b) => b.sessions[b.sessions.length - 1].date - a.sessions[a.sessions.length - 1].date)

  const current = tracked.find((t) => t.ex.id === selected)

  const weeks = weeklySeries(sets, 12, Date.now())
  const month = muscleVolume(sets, exercises.map, thisWeek - 3 * WEEK, thisWeek + WEEK)
  const slices = MUSCLE_KEYS.filter((m) => month[m])
    .map((m) => ({ label: MUSCLES[m], value: month[m]!.sets, color: MUSCLE_COLORS[m] }))
    .sort((a, b) => b.value - a.value)
  const monthSets = slices.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Прогресс</h1>
      </header>

      <h2>Объём за неделю</h2>
      {muscles.length === 0 && <p className="muted">За эту и прошлую неделю подходов нет.</p>}
      <div className="volume">
        {muscles.map((m) => (
          <div className="vol-row" key={m}>
            <span className="vol-name">{MUSCLES[m]}</span>
            <span className="vol-bars">
              <span className="vol-bar" style={{ width: `${((now[m]?.sets ?? 0) / maxSets) * 100}%` }} />
              <span className="vol-bar prev" style={{ width: `${((prev[m]?.sets ?? 0) / maxSets) * 100}%` }} />
            </span>
            <span className="vol-val">
              {fmtNum(now[m]?.sets ?? 0, 1)}
              <small className="muted"> / {fmtNum(prev[m]?.sets ?? 0, 1)}</small>
            </span>
          </div>
        ))}
      </div>
      {muscles.length > 0 && (
        <p className="muted small">
          Рабочие подходы: эта неделя / прошлая. Вспомогательная мышца считается за полподхода. Тоннаж за неделю:{' '}
          {fmtNum(Object.values(now).reduce((sum, v) => sum + v.tonnage, 0) / 1000, 1)} т.
        </p>
      )}

      {sets.length > 0 && (
        <>
          <h2>Тоннаж по неделям</h2>
          <BarChart
            unit=" т"
            bars={weeks.map((w, i) => ({ label: weekLabel(w.start), value: w.tonnage / 1000, current: i === weeks.length - 1 }))}
          />
          <h2>Распределение нагрузки</h2>
          <Donut slices={slices} centre={fmtNum(monthSets, 0)} caption="подх. за 4 нед." />
        </>
      )}

      <h2>Упражнения</h2>
      {tracked.length === 0 && <p className="muted">Графики появятся после первой тренировки.</p>}
      <ul className="list">
        {tracked.map(({ ex, sessions }) => {
          const last = sessions[sessions.length - 1]
          return (
            <li key={ex.id}>
              <button type="button" className="row" onClick={() => setSelected(ex.id)}>
                <span>
                  {ex.name} {isPlateau(sessions) && <span className="badge warn">застой</span>}
                </span>
                <span className="muted">
                  {fmtNum(topWeight(last))} кг · {fmtDate(last.date)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {current && <ExerciseDetail ex={current.ex} sessions={current.sessions} onClose={() => setSelected(null)} />}
    </div>
  )
}
