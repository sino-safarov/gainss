import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type ReactNode } from 'react'
import { db } from '../db'
import { MUSCLES, MUSCLE_KEYS, type Exercise, type Muscle } from '../types'

export const fmtNum = (n: number, digits = 2): string =>
  n.toLocaleString('ru-RU', { maximumFractionDigits: digits, useGrouping: false })

export const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

export const fmtClock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function useExercises(): { list: Exercise[]; map: Map<number, Exercise> } | undefined {
  const list = useLiveQuery(() => db.exercises.toArray(), [])
  return useMemo(() => (list ? { list, map: new Map(list.map((e) => [e.id, e])) } : undefined), [list])
}

export function NumField(props: {
  label: string
  value: number
  step: number
  min?: number
  onChange: (v: number) => void
}) {
  const { label, value, step, min = 0, onChange } = props
  const [text, setText] = useState<string | null>(null)
  const bump = (dir: 1 | -1) => {
    // Snap to a multiple of the step so 21 with step 2.5 goes to 22.5, not 23.5.
    const snapped = dir > 0 ? Math.floor(value / step + 1e-9) * step + step : Math.ceil(value / step - 1e-9) * step - step
    onChange(Math.max(min, Math.round(snapped * 100) / 100))
  }
  return (
    <div className="numfield">
      <span className="numfield-label">{label}</span>
      <div className="numfield-row">
        <button type="button" className="step" aria-label={`${label}: меньше`} onClick={() => bump(-1)}>
          −
        </button>
        <input
          aria-label={label}
          inputMode="decimal"
          value={text ?? fmtNum(value)}
          onFocus={(e) => {
            setText(fmtNum(value))
            e.currentTarget.select()
          }}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value.replace(',', '.'))
            if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min) onChange(v)
          }}
          onBlur={() => setText(null)}
        />
        <button type="button" className="step" aria-label={`${label}: больше`} onClick={() => bump(1)}>
          +
        </button>
      </div>
    </div>
  )
}

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-label={props.title}>
      <header className="sheet-head">
        <button type="button" className="link" onClick={props.onClose}>
          ‹ Назад
        </button>
        <h2>{props.title}</h2>
        <span className="sheet-action">{props.action}</span>
      </header>
      <div className="sheet-body">{props.children}</div>
    </div>
  )
}

export function ExercisePicker(props: { onPick: (ex: Exercise) => void; onClose: () => void }) {
  const exercises = useExercises()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [creating, setCreating] = useState(false)
  const [newMuscle, setNewMuscle] = useState<Muscle>('chest')

  const q = query.trim().toLowerCase()
  const shown = (exercises?.list ?? [])
    .filter((e) => !e.archived && (!muscle || e.muscle === muscle) && e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const create = async () => {
    const name = query.trim()
    if (!name) return
    const ex = { name, muscle: newMuscle, secondary: [], step: 2.5, repMin: 8, repMax: 12 } as Omit<Exercise, 'id'>
    const id = await db.exercises.add(ex as Exercise)
    props.onPick({ ...ex, id })
  }

  return (
    <Sheet title="Упражнение" onClose={props.onClose}>
      <input
        className="text"
        placeholder="Поиск или название нового"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips">
        <button type="button" className={muscle === null ? 'chip on' : 'chip'} onClick={() => setMuscle(null)}>
          Все
        </button>
        {MUSCLE_KEYS.map((m) => (
          <button type="button" key={m} className={muscle === m ? 'chip on' : 'chip'} onClick={() => setMuscle(m)}>
            {MUSCLES[m]}
          </button>
        ))}
      </div>
      <ul className="list">
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" className="row" onClick={() => props.onPick(e)}>
              <span>{e.name}</span>
              <span className="muted">{MUSCLES[e.muscle]}</span>
            </button>
          </li>
        ))}
      </ul>
      {q !== '' && !creating && (
        <button type="button" className="btn ghost" onClick={() => setCreating(true)}>
          + Создать «{query.trim()}»
        </button>
      )}
      {creating && (
        <div className="card">
          <label className="field">
            <span>Основная мышца</span>
            <select value={newMuscle} onChange={(e) => setNewMuscle(e.target.value as Muscle)}>
              {MUSCLE_KEYS.map((m) => (
                <option key={m} value={m}>
                  {MUSCLES[m]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={create}>
            Создать и добавить
          </button>
        </div>
      )}
    </Sheet>
  )
}

export function LineChart(props: { points: { x: number; y: number }[]; unit?: string }) {
  const { points, unit = '' } = props
  if (points.length === 0) return <p className="muted">Пока нет данных</p>
  const W = 320
  const H = 150
  const pad = { l: 8, r: 8, t: 12, b: 20 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const sx = (x: number) => (x1 === x0 ? W / 2 : pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r))
  const sy = (y: number) => (y1 === y0 ? H / 2 : H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b))
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  return (
    <figure className="chart">
      <figcaption>
        <span>
          мин {fmtNum(y0, 1)}
          {unit}
        </span>
        <strong>
          {fmtNum(ys[ys.length - 1], 1)}
          {unit}
        </strong>
        <span>
          макс {fmtNum(y1, 1)}
          {unit}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График">
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="axis" />
        <path d={path} className="line" />
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={points.length > 40 ? 1.5 : 3} className="dot" />
        ))}
        <text x={pad.l} y={H - 4} className="tick">
          {fmtDate(x0)}
        </text>
        <text x={W - pad.r} y={H - 4} className="tick" textAnchor="end">
          {fmtDate(x1)}
        </text>
      </svg>
    </figure>
  )
}
