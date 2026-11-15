import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BACKUP_STALE_MS, saveBackupFile } from '../backup'
import { db, deleteWorkout, getMeta, startWorkout } from '../db'
import type { Workout } from '../types'
import { fmtDate, fmtNum, Sheet, useExercises } from './common'

function WorkoutDetail({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const exercises = useExercises()
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workout.id).sortBy('ts'), [workout.id])
  const order = [...new Set((sets ?? []).map((s) => s.exerciseId))]
  const remove = async () => {
    if (!confirm('Удалить тренировку из истории?')) return
    await deleteWorkout(workout.id)
    onClose()
  }
  return (
    <Sheet title={`${workout.name} · ${fmtDate(workout.startedAt)}`} onClose={onClose}>
      {order.map((exId) => (
        <div className="card" key={exId}>
          <h3>{exercises?.map.get(exId)?.name ?? 'Удалённое упражнение'}</h3>
          <p>
            {(sets ?? [])
              .filter((s) => s.exerciseId === exId)
              .map((s) => `${s.warmup ? 'Р ' : ''}${fmtNum(s.weight)}×${s.reps}`)
              .join(' · ')}
          </p>
        </div>
      ))}
      <button type="button" className="btn ghost danger" onClick={remove}>
        Удалить тренировку
      </button>
    </Sheet>
  )
}

export function Home() {
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
  const history = useLiveQuery(() => db.workouts.where('status').equals('done').reverse().sortBy('startedAt'), [])
  const lastBackupAt = useLiveQuery(() => getMeta<number>('lastBackupAt', 0), [])
  const [detail, setDetail] = useState<Workout | null>(null)

  const lastDone = (templateId: number) => history?.find((w) => w.templateId === templateId)
  const firstWorkoutAt = history?.length ? history[history.length - 1].startedAt : null
  const backupStale =
    firstWorkoutAt !== null &&
    lastBackupAt !== undefined &&
    Date.now() - Math.max(lastBackupAt, firstWorkoutAt) > BACKUP_STALE_MS

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Тренировка</h1>
      </header>

      {backupStale && (
        <div className="card notice">
          <p>{lastBackupAt ? `Последняя резервная копия — ${fmtDate(lastBackupAt)}.` : 'Резервной копии ещё нет.'}</p>
          <button type="button" className="btn small" onClick={() => void saveBackupFile()}>
            Сохранить копию
          </button>
        </div>
      )}

      <ul className="list">
        {(templates ?? []).map((t) => {
          const last = lastDone(t.id)
          return (
            <li key={t.id}>
              <button type="button" className="row big" onClick={() => void startWorkout(t.name, t.items, t.id)}>
                <span>
                  <strong>{t.name}</strong>
                  <small className="muted">
                    {t.items.length} упр.{last ? ` · последний раз ${fmtDate(last.startedAt)}` : ''}
                  </small>
                </span>
                <span className="go">Начать</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn ghost" onClick={() => void startWorkout('Свободная тренировка', [])}>
        Пустая тренировка
      </button>

      <h2>История</h2>
      {history?.length === 0 && <p className="muted">Здесь появятся завершённые тренировки.</p>}
      <ul className="list">
        {(history ?? []).slice(0, 30).map((w) => (
          <li key={w.id}>
            <button type="button" className="row" onClick={() => setDetail(w)}>
              <span>{w.name}</span>
              <span className="muted">{fmtDate(w.startedAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      {detail && <WorkoutDetail workout={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
