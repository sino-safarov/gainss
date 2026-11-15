import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { exportBackup, importBackup, parseBackup } from '../../src/backup'
import { GainssDB } from '../../src/db'
import { seedExercises, seedTemplates } from '../../src/seed'
import type { BodyEntry, SetEntry, Workout } from '../../src/types'

describe('seed', () => {
  it('templates only reference existing exercises', () => {
    const ids = new Set(seedExercises.map((e) => e.id))
    for (const t of seedTemplates) for (const it of t.items) expect(ids.has(it.exerciseId)).toBe(true)
    expect(seedTemplates).toHaveLength(5)
  })
  it('populates a fresh database', async () => {
    const d = new GainssDB('seed-test')
    expect(await d.exercises.count()).toBe(seedExercises.length)
    expect(await d.templates.count()).toBe(5)
    // New rows must not collide with seeded ids.
    const id = await d.exercises.add({ name: 'x', muscle: 'abs', secondary: [], step: 1, repMin: 8, repMax: 12 } as never)
    expect(id).toBeGreaterThan(seedExercises.length)
  })
})

describe('backup', () => {
  it('round-trips all data into another database', async () => {
    const a = new GainssDB('backup-a')
    const wid = await a.workouts.add({ name: 'Ноги', status: 'done', startedAt: 1, finishedAt: 2, items: [] } as unknown as Workout)
    await a.sets.add({ workoutId: wid, exerciseId: 25, weight: 100, reps: 5, warmup: false, ts: 1 } as SetEntry)
    await a.body.add({ date: '2026-11-15', kg: 84.5 } as BodyEntry)
    await a.meta.put({ key: 'restSeconds', value: 90 })
    await a.exercises.update(1, { name: 'Переименовано' })

    const text = JSON.stringify(await exportBackup(a))

    const b = new GainssDB('backup-b')
    await b.workouts.add({ name: 'будет стёрто', status: 'done', startedAt: 5, items: [] } as unknown as Workout)
    await importBackup(parseBackup(text), b)

    expect(await b.workouts.toArray()).toEqual(await a.workouts.toArray())
    expect(await b.sets.toArray()).toEqual(await a.sets.toArray())
    expect(await b.body.toArray()).toEqual(await a.body.toArray())
    expect((await b.meta.get('restSeconds'))?.value).toBe(90)
    expect((await b.exercises.get(1))?.name).toBe('Переименовано')
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup('{"format":"other"}')).toThrow()
    expect(() => parseBackup('{"format":"gainss-backup","version":99,"data":{}}')).toThrow()
    expect(() => parseBackup('{"format":"gainss-backup","version":1,"data":{"exercises":[]}}')).toThrow()
  })
})
