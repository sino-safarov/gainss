import type { Exercise, Muscle, SetEntry } from '../types'

/** Estimated one-rep max (Epley). */
export const e1rm = (weight: number, reps: number): number =>
  reps <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30)

export const round1 = (n: number): number => Math.round(n * 10) / 10

export interface Session {
  workoutId: number
  date: number
  /** Working sets only, in the order they were logged. */
  sets: SetEntry[]
}

/** Groups one exercise's sets into per-workout sessions, oldest first. Warm-ups are dropped. */
export function sessionsOf(sets: SetEntry[], excludeWorkoutId?: number): Session[] {
  const byWorkout = new Map<number, SetEntry[]>()
  for (const s of sets) {
    if (s.warmup || s.workoutId === excludeWorkoutId) continue
    const list = byWorkout.get(s.workoutId)
    if (list) list.push(s)
    else byWorkout.set(s.workoutId, [s])
  }
  return [...byWorkout.entries()]
    .map(([workoutId, list]) => {
      list.sort((a, b) => a.ts - b.ts)
      return { workoutId, date: list[0].ts, sets: list }
    })
    .sort((a, b) => a.date - b.date)
}

export const topWeight = (s: Session): number => Math.max(...s.sets.map((x) => x.weight))
export const sessionVolume = (s: Session): number => s.sets.reduce((sum, x) => sum + x.weight * x.reps, 0)

/** Best result of a session: e1RM for weighted work, max reps for bodyweight work. */
export function sessionScore(s: Session): number {
  return topWeight(s) > 0 ? Math.max(...s.sets.map((x) => e1rm(x.weight, x.reps))) : Math.max(...s.sets.map((x) => x.reps))
}

export type Suggestion =
  | { kind: 'increase'; weight: number; from: number }
  | { kind: 'hold'; weight: number; targetReps: number }

/**
 * Double progression: once every working set of the last session reached the top
 * of the rep range, add one step of weight; otherwise keep the weight and add reps.
 */
export function suggest(ex: Pick<Exercise, 'step' | 'repMax'>, last: Session | undefined): Suggestion | null {
  if (!last || last.sets.length === 0) return null
  const top = topWeight(last)
  if (last.sets.every((s) => s.reps >= ex.repMax)) return { kind: 'increase', weight: top + ex.step, from: top }
  return { kind: 'hold', weight: top, targetReps: ex.repMax }
}

export const PLATEAU_WINDOW = 3

/** Stalled when none of the last three sessions beat the best result from before them. */
export function isPlateau(sessions: Session[]): boolean {
  if (sessions.length < PLATEAU_WINDOW + 1) return false
  const scores = sessions.map(sessionScore)
  const recent = Math.max(...scores.slice(-PLATEAU_WINDOW))
  const before = Math.max(...scores.slice(0, -PLATEAU_WINDOW))
  return recent <= before
}

export interface Records {
  maxWeight: { weight: number; reps: number; date: number } | null
  bestE1rm: { value: number; weight: number; reps: number; date: number } | null
  bestVolume: { value: number; date: number } | null
  /** Best reps achieved at each weight, heaviest first. */
  repsAtWeight: { weight: number; reps: number; date: number }[]
}

export function recordsOf(sessions: Session[]): Records {
  const r: Records = { maxWeight: null, bestE1rm: null, bestVolume: null, repsAtWeight: [] }
  const perWeight = new Map<number, { weight: number; reps: number; date: number }>()
  for (const session of sessions) {
    const vol = sessionVolume(session)
    if (vol > 0 && (!r.bestVolume || vol > r.bestVolume.value)) r.bestVolume = { value: vol, date: session.date }
    for (const s of session.sets) {
      if (s.reps <= 0) continue
      if (!r.maxWeight || s.weight > r.maxWeight.weight || (s.weight === r.maxWeight.weight && s.reps > r.maxWeight.reps))
        r.maxWeight = { weight: s.weight, reps: s.reps, date: s.ts }
      const est = e1rm(s.weight, s.reps)
      if (est > 0 && (!r.bestE1rm || est > r.bestE1rm.value))
        r.bestE1rm = { value: est, weight: s.weight, reps: s.reps, date: s.ts }
      const cur = perWeight.get(s.weight)
      if (!cur || s.reps > cur.reps) perWeight.set(s.weight, { weight: s.weight, reps: s.reps, date: s.ts })
    }
  }
  r.repsAtWeight = [...perWeight.values()].sort((a, b) => b.weight - a.weight)
  return r
}

export type PrKind = 'weight' | 'e1rm' | 'reps'

/** Which records a new working set breaks, compared with the earlier working sets of the exercise. */
export function prKinds(prior: SetEntry[], set: Pick<SetEntry, 'weight' | 'reps' | 'warmup'>): PrKind[] {
  const work = prior.filter((s) => !s.warmup && s.reps > 0)
  if (set.warmup || set.reps <= 0 || work.length === 0) return []
  const kinds: PrKind[] = []
  if (set.weight > Math.max(...work.map((s) => s.weight))) kinds.push('weight')
  if (set.weight > 0 && e1rm(set.weight, set.reps) > Math.max(...work.map((s) => e1rm(s.weight, s.reps)))) kinds.push('e1rm')
  const same = work.filter((s) => s.weight === set.weight)
  if (same.length > 0 && set.reps > Math.max(...same.map((s) => s.reps))) kinds.push('reps')
  return kinds
}

/**
 * Values to pre-fill for the next working set.
 * Follows the last session set-by-set while the lifter sticks to it; after a
 * deviation (for example a suggested increase) it repeats the previous set.
 */
export function prefill(
  ex: Pick<Exercise, 'repMin'>,
  last: Session | undefined,
  current: SetEntry[],
  suggestion: Suggestion | null,
): { weight: number; reps: number } {
  const idx = current.length
  const prev = current[idx - 1]
  const lastAt = last?.sets[idx]
  if (!prev) {
    if (suggestion?.kind === 'increase') return { weight: suggestion.weight, reps: ex.repMin }
    const first = last?.sets[0]
    return first ? { weight: first.weight, reps: first.reps } : { weight: 20, reps: ex.repMin }
  }
  const followed = last?.sets[idx - 1]?.weight === prev.weight
  if (followed && lastAt) return { weight: lastAt.weight, reps: lastAt.reps }
  return { weight: prev.weight, reps: prev.reps }
}

/** Monday 00:00 local time of the week containing ts. */
export function weekStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

export interface MuscleLoad {
  /** Working sets; a secondary muscle counts as half a set. */
  sets: number
  /** Tonnage in kg, attributed to the primary muscle only. */
  tonnage: number
}

export function muscleVolume(
  sets: SetEntry[],
  exercises: Map<number, Pick<Exercise, 'muscle' | 'secondary'>>,
  from: number,
  to: number,
): Partial<Record<Muscle, MuscleLoad>> {
  const out: Partial<Record<Muscle, MuscleLoad>> = {}
  const at = (m: Muscle) => (out[m] ??= { sets: 0, tonnage: 0 })
  for (const s of sets) {
    if (s.warmup || s.ts < from || s.ts >= to) continue
    const ex = exercises.get(s.exerciseId)
    if (!ex) continue
    const primary = at(ex.muscle)
    primary.sets += 1
    primary.tonnage += s.weight * s.reps
    for (const m of ex.secondary) if (m !== ex.muscle) at(m).sets += 0.5
  }
  return out
}

const startOfDay = (ts: number): number => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Adds whole calendar days in local time (safe across daylight-saving changes). */
export const addDays = (ts: number, days: number): number => {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export interface HeatDay {
  ts: number
  /** Working sets logged that day. */
  count: number
  /** 0 = nothing, 1–4 = intensity relative to the busiest day in the window. */
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** Activity calendar: `weeks` columns of Monday-first days, ending with the current week. */
export function heatmap(sets: SetEntry[], weeks: number, now: number): HeatDay[] {
  const counts = new Map<number, number>()
  for (const s of sets) {
    if (s.warmup) continue
    const day = startOfDay(s.ts)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  const first = addDays(weekStart(now), -(weeks - 1) * 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const ts = addDays(first, i)
    return { ts, count: counts.get(ts) ?? 0 }
  })
  const max = Math.max(1, ...days.map((d) => d.count))
  return days.map((d) => ({
    ...d,
    level: (d.count === 0 ? 0 : Math.ceil((d.count / max) * 4)) as HeatDay['level'],
    future: d.ts > now,
  }))
}

export interface WeekTotals {
  start: number
  sets: number
  tonnage: number
  workouts: number
}

/** Totals for the last `weeks` calendar weeks, oldest first. */
export function weeklySeries(sets: SetEntry[], weeks: number, now: number): WeekTotals[] {
  const first = addDays(weekStart(now), -(weeks - 1) * 7)
  const out = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(first, i * 7),
    sets: 0,
    tonnage: 0,
    ids: new Set<number>(),
  }))
  for (const s of sets) {
    if (s.warmup || s.ts < first) continue
    const week = out.findLast((w) => w.start <= s.ts)
    if (!week) continue
    week.sets += 1
    week.tonnage += s.weight * s.reps
    week.ids.add(s.workoutId)
  }
  return out.map(({ ids, ...w }) => ({ ...w, workouts: ids.size }))
}

/** Consecutive weeks with at least one workout; the current week may still be empty. */
export function weekStreak(workoutTimes: number[], now: number): number {
  const weeks = new Set(workoutTimes.map(weekStart))
  let cursor = weekStart(now)
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7)
  let streak = 0
  while (weeks.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -7)
  }
  return streak
}

export type MuscleStatus = 'none' | 'low' | 'mid' | 'ok' | 'high'

/** Rates average weekly working sets against the usual 10–20 sets per muscle guideline. */
export function muscleStatus(weeklySets: number): MuscleStatus {
  if (weeklySets <= 0) return 'none'
  if (weeklySets < 5) return 'low'
  if (weeklySets < 10) return 'mid'
  if (weeklySets <= 20) return 'ok'
  return 'high'
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Average weekly sets per muscle over the last four weeks — or over the
 * history so far when it is shorter, so a new log is not rated as lagging.
 */
export function muscleBalance(
  sets: SetEntry[],
  exercises: Map<number, Pick<Exercise, 'muscle' | 'secondary'>>,
  now: number,
): Partial<Record<Muscle, number>> {
  const work = sets.filter((s) => !s.warmup && s.ts <= now)
  if (work.length === 0) return {}
  const first = Math.min(...work.map((s) => s.ts))
  const span = Math.min(4, Math.max(1, Math.ceil((now - first) / WEEK_MS)))
  const totals = muscleVolume(work, exercises, now - span * WEEK_MS, now + 1)
  const out: Partial<Record<Muscle, number>> = {}
  for (const [m, v] of Object.entries(totals)) out[m as Muscle] = v.sets / span
  return out
}
