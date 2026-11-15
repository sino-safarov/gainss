import Dexie, { type Table } from 'dexie'
import { seedExercises, seedTemplates } from './seed'
import type { BodyEntry, Exercise, Meta, PlanItem, SetEntry, Template, Workout } from './types'

export class GainssDB extends Dexie {
  exercises!: Table<Exercise, number>
  templates!: Table<Template, number>
  workouts!: Table<Workout, number>
  sets!: Table<SetEntry, number>
  body!: Table<BodyEntry, number>
  meta!: Table<Meta, string>

  constructor(name = 'gainss') {
    super(name)
    this.version(1).stores({
      exercises: '++id, muscle',
      templates: '++id, order',
      workouts: '++id, status, startedAt',
      sets: '++id, workoutId, exerciseId, ts',
      body: '++id, &date',
      meta: 'key',
    })
    this.on('populate', (tx) => {
      tx.table('exercises').bulkAdd(seedExercises)
      tx.table('templates').bulkAdd(seedTemplates)
    })
  }
}

export const db = new GainssDB()

export const DEFAULT_REST = 120

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

export async function startWorkout(name: string, items: PlanItem[], templateId?: number): Promise<number> {
  return db.workouts.add({
    name,
    templateId,
    status: 'active',
    startedAt: Date.now(),
    items: items.map((i) => ({ ...i })),
  } as Workout)
}

/** Finishes the workout; a workout without any logged set is discarded instead. */
export async function finishWorkout(id: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    const count = await db.sets.where('workoutId').equals(id).count()
    if (count === 0) await db.workouts.delete(id)
    else await db.workouts.update(id, { status: 'done', finishedAt: Date.now() })
  })
}

export async function deleteWorkout(id: number): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).delete()
    await db.workouts.delete(id)
  })
}

export const localDate = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function logBodyWeight(kg: number, date = localDate()): Promise<void> {
  const existing = await db.body.where('date').equals(date).first()
  if (existing) await db.body.update(existing.id, { kg })
  else await db.body.add({ date, kg } as BodyEntry)
}
