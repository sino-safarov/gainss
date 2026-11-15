import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db, DEFAULT_REST, finishWorkout, getMeta } from '../db'
import { isPlateau, prefill, prKinds, sessionsOf, suggest, type PrKind } from '../domain/calc'
import { adjustRest, beep, markSignalled, startRest, stopRest, unlockAudio, useRest } from '../rest'
import type { Exercise, SetEntry, Workout } from '../types'
import { ExercisePicker, fmtClock, fmtNum, NumField, useExercises } from './common'

const PR_LABEL: Record<PrKind, string> = { weight: 'рекорд веса', e1rm: 'рекорд 1ПМ', reps: 'рекорд повторов' }

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
        const l = await navigator.wakeLock.request('screen')
        if (cancelled) void l.release()
        else lock = l
      } catch {
        /* not available (low power mode etc.) */
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [])
}

export function RestBar() {
  const rest = useRest()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!rest) return
    const tick = () => {
      setNow(Date.now())
      if (!rest.signalled && Date.now() >= rest.endAt) {
        markSignalled()
        beep()
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [rest])
  if (!rest) return null
  const left = (rest.endAt - now) / 1000
  const done = left <= 0
  return (
    <div className={done ? 'restbar done' : 'restbar'} role="timer" aria-label="Таймер отдыха">
      <div className="restbar-fill" style={{ width: `${done || rest.total === 0 ? 100 : (1 - left / rest.total) * 100}%` }} />
      <button type="button" className="rest-btn" onClick={() => adjustRest(-15)} disabled={done}>
        −15
      </button>
      <span className="rest-time">{done ? 'Отдых окончен' : fmtClock(left)}</span>
      <button type="button" className="rest-btn" onClick={() => adjustRest(15)}>
        +15
      </button>
      <button type="button" className="rest-btn" onClick={stopRest} aria-label="Закрыть таймер">
        ✕
      </button>
    </div>
  )
}

function SetEditor(props: {
  ex: Exercise
  initial: { weight: number; reps: number }
  onLog: (weight: number, reps: number, warmup: boolean) => void
}) {
  const [weight, setWeight] = useState(props.initial.weight)
  const [reps, setReps] = useState(props.initial.reps)
  const [warmup, setWarmup] = useState(false)
  return (
    <div className="editor">
      <div className="editor-fields">
        <NumField label="Вес, кг" value={weight} step={props.ex.step} onChange={setWeight} />
        <NumField label="Повторы" value={reps} step={1} onChange={(v) => setReps(Math.round(v))} />
      </div>
      <div className="editor-actions">
        <button
          type="button"
          className={warmup ? 'chip on' : 'chip'}
          aria-pressed={warmup}
          onClick={() => setWarmup(!warmup)}
        >
          Разминка
        </button>
        <button type="button" className="btn log" onClick={() => props.onLog(weight, reps, warmup)}>
          Записать подход
        </button>
      </div>
    </div>
  )
}

export function WorkoutScreen({ workout }: { workout: Workout }) {
  useWakeLock()
  const exercises = useExercises()
  const ids = workout.items.map((i) => i.exerciseId)
  const idsKey = ids.join(',')
  const allSets = useLiveQuery(() => db.sets.where('exerciseId').anyOf(ids).sortBy('ts'), [idsKey])
  const restSeconds = useLiveQuery(() => getMeta('restSeconds', DEFAULT_REST), [])
  const [open, setOpen] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const byExercise = useMemo(() => {
    const m = new Map<number, SetEntry[]>()
    for (const s of allSets ?? []) {
      const list = m.get(s.exerciseId)
      if (list) list.push(s)
      else m.set(s.exerciseId, [s])
    }
    return m
  }, [allSets])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(id)
  }, [flash])

  if (!exercises || !allSets) return null

  const mine = (exId: number) => (byExercise.get(exId) ?? []).filter((s) => s.workoutId === workout.id)
  const workCount = (exId: number) => mine(exId).filter((s) => !s.warmup).length
  const firstOpen = workout.items.findIndex((it) => workCount(it.exerciseId) < it.sets)
  const openIdx = open ?? (firstOpen === -1 ? null : firstOpen)

  const logSet = async (ex: Exercise, idx: number, weight: number, reps: number, warmup: boolean) => {
    unlockAudio()
    const kinds = prKinds(byExercise.get(ex.id) ?? [], { weight, reps, warmup })
    await db.sets.add({ workoutId: workout.id, exerciseId: ex.id, weight, reps, warmup, ts: Date.now() } as SetEntry)
    startRest(restSeconds ?? DEFAULT_REST)
    if (kinds.length) setFlash(`🏆 ${ex.name}: ${kinds.map((k) => PR_LABEL[k]).join(', ')}`)
    // Planned sets done: move on to the next unfinished exercise.
    if (!warmup && workCount(ex.id) + 1 >= workout.items[idx].sets) {
      const next = workout.items.findIndex((it, i) => i !== idx && workCount(it.exerciseId) < it.sets)
      setOpen(next === -1 ? idx : next)
    } else setOpen(idx)
  }

  const removeSet = async (s: SetEntry) => {
    if (confirm(`Удалить подход ${fmtNum(s.weight)} кг × ${s.reps}?`)) await db.sets.delete(s.id)
  }

  const removeItem = async (idx: number) => {
    const exId = workout.items[idx].exerciseId
    if (mine(exId).length && !confirm('Убрать упражнение вместе с записанными подходами?')) return
    await db.transaction('rw', db.workouts, db.sets, async () => {
      await db.sets.where('workoutId').equals(workout.id).and((s) => s.exerciseId === exId).delete()
      await db.workouts.update(workout.id, { items: workout.items.filter((_, i) => i !== idx) })
    })
    setOpen(null)
  }

  const addExercise = async (ex: Exercise) => {
    setPicking(false)
    if (ids.includes(ex.id)) return setOpen(ids.indexOf(ex.id))
    await db.workouts.update(workout.id, { items: [...workout.items, { exerciseId: ex.id, sets: 3 }] })
    setOpen(workout.items.length)
  }

  const finish = async () => {
    const total = (allSets ?? []).filter((s) => s.workoutId === workout.id).length
    if (!confirm(total ? 'Завершить тренировку?' : 'Подходов нет — тренировка не сохранится. Закрыть?')) return
    stopRest()
    await finishWorkout(workout.id)
  }

  return (
    <div className="screen workout">
      <header className="screen-head">
        <h1>{workout.name}</h1>
        <button type="button" className="link" onClick={finish}>
          Завершить
        </button>
      </header>

      {flash && <div className="flash">{flash}</div>}

      {workout.items.map((item, idx) => {
        const ex = exercises.map.get(item.exerciseId)
        if (!ex) return null
        const done = mine(ex.id)
        const work = done.filter((s) => !s.warmup)
        const past = sessionsOf(byExercise.get(ex.id) ?? [], workout.id)
        const last = past[past.length - 1]
        const hint = suggest(ex, last)
        const stalled = isPlateau(past)
        const isOpen = openIdx === idx
        return (
          <section key={ex.id} className={isOpen ? 'card ex open' : 'card ex'}>
            <button type="button" className="ex-head" onClick={() => setOpen(idx)} aria-expanded={isOpen}>
              <span className="ex-name">{ex.name}</span>
              {stalled && <span className="badge warn">застой</span>}
              <span className={work.length >= item.sets ? 'ex-count ok' : 'ex-count'}>
                {work.length}/{item.sets}
              </span>
            </button>
            {isOpen && (
              <>
                {last ? (
                  <p className="hint">
                    <span className="muted">
                      Прошлый раз: {last.sets.map((s) => `${fmtNum(s.weight)}×${s.reps}`).join(' · ')}
                    </span>
                    {hint?.kind === 'increase' && (
                      <strong className="up">
                        ↑ Пора добавить вес: {fmtNum(hint.weight)} кг
                      </strong>
                    )}
                    {hint?.kind === 'hold' && (
                      <span>
                        Цель: {fmtNum(hint.weight)} кг × {hint.targetReps} во всех подходах
                      </span>
                    )}
                    {stalled && <span className="warn-text">Нет роста 3 тренировки — смените диапазон повторов или упражнение</span>}
                  </p>
                ) : (
                  <p className="hint muted">Первая запись этого упражнения</p>
                )}
                {done.length > 0 && (
                  <ol className="sets">
                    {done.map((s, i) => (
                      <li key={s.id}>
                        <button type="button" className="set" onClick={() => removeSet(s)}>
                          <span className="set-n">{s.warmup ? 'Р' : i + 1 - done.slice(0, i).filter((x) => x.warmup).length}</span>
                          <span>
                            {fmtNum(s.weight)} кг × {s.reps}
                          </span>
                          <span className="muted">удалить</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <SetEditor
                  key={`${ex.id}:${work.length}`}
                  ex={ex}
                  initial={prefill(ex, last, work, hint)}
                  onLog={(w, r, warm) => logSet(ex, idx, w, r, warm)}
                />
                <button type="button" className="link danger small" onClick={() => removeItem(idx)}>
                  Убрать упражнение
                </button>
              </>
            )}
          </section>
        )
      })}

      <button type="button" className="btn ghost" onClick={() => setPicking(true)}>
        + Добавить упражнение
      </button>
      <button type="button" className="btn ghost" onClick={finish}>
        Завершить тренировку
      </button>

      <RestBar />
      {picking && <ExercisePicker onPick={addExercise} onClose={() => setPicking(false)} />}
    </div>
  )
}
