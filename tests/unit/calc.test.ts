import { describe, expect, it } from 'vitest'
import {
  e1rm,
  isPlateau,
  muscleVolume,
  prefill,
  prKinds,
  recordsOf,
  sessionsOf,
  suggest,
  weekStart,
} from '../../src/domain/calc'
import type { Muscle, SetEntry } from '../../src/types'

let nextId = 1
const DAY = 24 * 60 * 60 * 1000
const set = (workoutId: number, weight: number, reps: number, extra: Partial<SetEntry> = {}): SetEntry => ({
  id: nextId++,
  workoutId,
  exerciseId: 1,
  weight,
  reps,
  warmup: false,
  ts: workoutId * DAY + nextId,
  ...extra,
})
const ex = { step: 2.5, repMin: 8, repMax: 12 }

describe('e1rm', () => {
  it('uses Epley and returns the weight itself for a single', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 2)
    expect(e1rm(100, 0)).toBe(0)
  })
})

describe('sessionsOf', () => {
  it('groups by workout, oldest first, without warm-ups or the excluded workout', () => {
    const sets = [set(2, 80, 8), set(1, 40, 10, { warmup: true }), set(1, 75, 10), set(3, 85, 6)]
    const sessions = sessionsOf(sets, 3)
    expect(sessions.map((s) => s.workoutId)).toEqual([1, 2])
    expect(sessions[0].sets.map((s) => s.weight)).toEqual([75])
  })
})

describe('suggest', () => {
  it('returns nothing without history', () => {
    expect(suggest(ex, undefined)).toBeNull()
  })
  it('adds a step once every set reached the top of the range', () => {
    const [last] = sessionsOf([set(1, 80, 12), set(1, 80, 12), set(1, 80, 13)])
    expect(suggest(ex, last)).toEqual({ kind: 'increase', weight: 82.5, from: 80 })
  })
  it('holds the weight while any set is short of the top', () => {
    const [last] = sessionsOf([set(1, 80, 12), set(1, 80, 11)])
    expect(suggest(ex, last)).toEqual({ kind: 'hold', weight: 80, targetReps: 12 })
  })
})

describe('isPlateau', () => {
  const run = (...reps: number[]) => sessionsOf(reps.map((r, i) => set(i + 1, 80, r)))
  it('needs four sessions', () => {
    expect(isPlateau(run(10, 10, 10))).toBe(false)
  })
  it('flags three sessions without beating the earlier best', () => {
    expect(isPlateau(run(10, 10, 9, 10))).toBe(true)
  })
  it('clears as soon as a recent session is better', () => {
    expect(isPlateau(run(10, 10, 9, 11))).toBe(false)
  })
  it('compares reps for bodyweight work', () => {
    const sessions = sessionsOf([12, 12, 12, 12].map((r, i) => set(i + 1, 0, r)))
    expect(isPlateau(sessions)).toBe(true)
  })
})

describe('records', () => {
  it('finds max weight, best e1RM, best volume and reps per weight', () => {
    const r = recordsOf(sessionsOf([set(1, 80, 10), set(1, 80, 8), set(2, 90, 3), set(2, 80, 11)]))
    expect(r.maxWeight).toMatchObject({ weight: 90, reps: 3 })
    expect(r.bestE1rm).toMatchObject({ weight: 80, reps: 11 })
    expect(r.bestVolume?.value).toBe(80 * 10 + 80 * 8)
    expect(r.repsAtWeight.map((x) => [x.weight, x.reps])).toEqual([
      [90, 3],
      [80, 11],
    ])
  })
  it('detects which records a new set breaks', () => {
    const prior = [set(1, 80, 10), set(1, 85, 5)]
    expect(prKinds(prior, { weight: 90, reps: 1, warmup: false })).toEqual(['weight'])
    expect(prKinds(prior, { weight: 80, reps: 11, warmup: false })).toEqual(['e1rm', 'reps'])
    expect(prKinds(prior, { weight: 80, reps: 10, warmup: false })).toEqual([])
    expect(prKinds(prior, { weight: 200, reps: 5, warmup: true })).toEqual([])
    expect(prKinds([], { weight: 50, reps: 5, warmup: false })).toEqual([])
  })
})

describe('prefill', () => {
  const [last] = sessionsOf([set(1, 80, 10), set(1, 80, 9), set(1, 75, 9)])
  it('defaults when there is no history', () => {
    expect(prefill(ex, undefined, [], null)).toEqual({ weight: 20, reps: 8 })
  })
  it('follows the last session set by set', () => {
    const hint = suggest(ex, last)
    expect(prefill(ex, last, [], hint)).toEqual({ weight: 80, reps: 10 })
    expect(prefill(ex, last, [set(2, 80, 10)], hint)).toEqual({ weight: 80, reps: 9 })
    expect(prefill(ex, last, [set(2, 80, 10), set(2, 80, 9)], hint)).toEqual({ weight: 75, reps: 9 })
  })
  it('starts at the suggested weight and bottom of the range after an increase', () => {
    const [top] = sessionsOf([set(1, 80, 12), set(1, 80, 12)])
    const hint = suggest(ex, top)
    expect(prefill(ex, top, [], hint)).toEqual({ weight: 82.5, reps: 8 })
    expect(prefill(ex, top, [set(2, 82.5, 9)], hint)).toEqual({ weight: 82.5, reps: 9 })
  })
  it('repeats the previous set beyond the last session length', () => {
    const done = [set(2, 80, 10), set(2, 80, 9), set(2, 75, 9)]
    expect(prefill(ex, last, done, null)).toEqual({ weight: 75, reps: 9 })
  })
})

describe('muscleVolume', () => {
  it('counts working sets in the window, halves for secondary muscles', () => {
    const monday = weekStart(new Date(2026, 10, 12, 15).getTime())
    expect(new Date(monday).getDay()).toBe(1)
    expect(weekStart(new Date(2026, 10, 15, 23).getTime())).toBe(monday) // Sunday belongs to the same week
    const exercises = new Map([[1, { muscle: 'chest' as Muscle, secondary: ['triceps'] as Muscle[] }]])
    const sets = [
      set(1, 100, 5, { ts: monday + 1 }),
      set(1, 100, 5, { ts: monday + 2 }),
      set(1, 50, 10, { ts: monday + 3, warmup: true }),
      set(1, 100, 5, { ts: monday - 1 }),
    ]
    expect(muscleVolume(sets, exercises, monday, monday + 7 * DAY)).toEqual({
      chest: { sets: 2, tonnage: 1000 },
      triceps: { sets: 1, tonnage: 0 },
    })
  })
})

import { addDays, heatmap, muscleBalance, muscleStatus, weeklySeries, weekStreak } from '../../src/domain/calc'

describe('activity calendar and weekly totals', () => {
  const now = new Date(2026, 10, 15, 18).getTime() // Sunday
  const monday = weekStart(now)
  const sets = [
    set(1, 100, 5, { ts: monday + 1000 }),
    set(1, 100, 5, { ts: monday + 2000 }),
    set(1, 50, 5, { ts: monday + 3000, warmup: true }),
    set(2, 60, 10, { ts: addDays(monday, -7) + 5000 }),
  ]
  it('builds Monday-first weeks ending with the current one', () => {
    const days = heatmap(sets, 3, now)
    expect(days).toHaveLength(21)
    expect(days[14]).toMatchObject({ ts: monday, count: 2, level: 4, future: false })
    expect(days[7]).toMatchObject({ count: 1, level: 2 })
    expect(days[0].count).toBe(0)
    expect(days[20].future).toBe(false)
    expect(heatmap(sets, 1, monday + 1)[6].future).toBe(true)
  })
  it('sums sets, tonnage and workouts per week', () => {
    expect(weeklySeries(sets, 2, now)).toEqual([
      { start: addDays(monday, -7), sets: 1, tonnage: 600, workouts: 1 },
      { start: monday, sets: 2, tonnage: 1000, workouts: 1 },
    ])
  })
  it('counts the streak of weeks, tolerating an empty current week', () => {
    expect(weekStreak([monday, addDays(monday, -7), addDays(monday, -21)], now)).toBe(2)
    expect(weekStreak([addDays(monday, -7)], now)).toBe(1)
    expect(weekStreak([addDays(monday, -14)], now)).toBe(0)
  })
})

describe('muscle balance', () => {
  it('rates weekly sets', () => {
    expect([0, 3, 7, 10, 20, 21].map(muscleStatus)).toEqual(['none', 'low', 'mid', 'ok', 'ok', 'high'])
  })
  it('averages over the history so far, at most four weeks', () => {
    const now = new Date(2026, 10, 15, 18).getTime()
    const exercises = new Map([[1, { muscle: 'back' as Muscle, secondary: ['biceps'] as Muscle[] }]])
    const recent = Array.from({ length: 12 }, (_, i) => set(1, 50, 10, { ts: now - 1000 - i }))
    expect(muscleBalance(recent, exercises, now)).toEqual({ back: 12, biceps: 6 })
    const older = [...recent, set(2, 50, 10, { ts: now - 9 * DAY })]
    expect(muscleBalance(older, exercises, now)).toEqual({ back: 6.5, biceps: 3.25 })
    const ancient = [...recent, set(3, 50, 10, { ts: now - 100 * DAY })]
    expect(muscleBalance(ancient, exercises, now)).toEqual({ back: 3, biceps: 1.5 })
    expect(muscleBalance([], exercises, now)).toEqual({})
  })
})
