import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, localDate, logBodyWeight } from '../db'
import { fmtNum, LineChart, NumField } from './common'

const toTs = (date: string) => new Date(`${date}T12:00:00`).getTime()

export function Body() {
  const entries = useLiveQuery(() => db.body.orderBy('date').toArray(), [])
  const [draft, setDraft] = useState<number | null>(null)
  if (!entries) return null

  const latest = entries[entries.length - 1]
  const value = draft ?? latest?.kg ?? 80
  const today = localDate()
  const savedToday = entries.some((e) => e.date === today)
  const weekAgo = entries.filter((e) => toTs(e.date) <= Date.now() - 7 * 24 * 60 * 60 * 1000).pop()

  const save = async () => {
    await logBodyWeight(value)
    setDraft(null)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Вес тела</h1>
      </header>

      <div className="card">
        <NumField label="Сегодня, кг" value={value} step={0.1} onChange={setDraft} />
        <button type="button" className="btn" onClick={save}>
          {savedToday ? 'Обновить запись за сегодня' : 'Записать'}
        </button>
      </div>

      {latest && weekAgo && weekAgo !== latest && (
        <p className="muted">
          За неделю: {latest.kg - weekAgo.kg > 0 ? '+' : ''}
          {fmtNum(latest.kg - weekAgo.kg, 1)} кг
        </p>
      )}

      <LineChart points={entries.map((e) => ({ x: toTs(e.date), y: e.kg }))} unit=" кг" />

      <ul className="list">
        {[...entries].reverse().slice(0, 30).map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="row"
              onClick={() => {
                if (confirm(`Удалить запись ${fmtNum(e.kg, 1)} кг?`)) void db.body.delete(e.id)
              }}
            >
              <span>{fmtNum(e.kg, 1)} кг</span>
              <span className="muted">{new Date(toTs(e.date)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
