import Dexie, { type Table } from 'dexie'
import { seedExercises, seedTemplates } from './seed'
import type { BodyEntry, Exercise, Meta, PlanItem, SetEntry, Template, Workout } from './types'

/** Tables that are synchronised with the account. */
export const SYNCED = ['exercises', 'templates', 'workouts', 'sets', 'body'] as const

let lastId = 0
/** Ids are unique across devices, so records made offline on two phones never collide. */
export function newId(): number {
  const id = Date.now() * 1024 + Math.floor(Math.random() * 1024)
  lastId = id > lastId ? id : lastId + 1
  return lastId
}

const changeListeners = new Set<() => void>()
let muted = 0
/** Calls back after local data changes (not for changes applied by sync itself). */
export function onLocalChange(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}
export const muteLocalChange = (delta: 1 | -1) => void (muted += delta)
const changed = () => {
  if (!muted) for (const l of changeListeners) l()
}

export interface ShadowRow {
  key: string
  json: string
}
export interface SyncState {
  key: 'state'
  userId: string
  email: string
  cursor: string | null
}

export class GainssDB extends Dexie {
  exercises!: Table<Exercise, number>
  templates!: Table<Template, number>
  workouts!: Table<Workout, number>
  sets!: Table<SetEntry, number>
  body!: Table<BodyEntry, number>
  meta!: Table<Meta, string>
  /** Last synchronised content of every record, to tell what changed locally. */
  shadow!: Table<ShadowRow, string>
  syncState!: Table<SyncState, string>

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
    this.version(2).stores({ shadow: 'key', syncState: 'key' })
    for (const name of SYNCED) {
      const table = this.table(name)
      table.hook('creating', (primKey) => {
        changed()
        return primKey === undefined ? newId() : undefined
      })
      table.hook('updating', () => void changed())
      table.hook('deleting', () => void changed())
    }
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
