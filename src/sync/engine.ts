import { muteLocalChange, SYNCED, type GainssDB } from '../db'
import { seedExercises, seedTemplates } from '../seed'

export interface RemoteRow {
  tbl: string
  id: number
  data: unknown
  deleted: boolean
  updated_at: string
}
export type PushRow = Omit<RemoteRow, 'updated_at'>

export interface Remote {
  /** Rows changed after `since`, oldest first. */
  pull(since: string | null): Promise<RemoteRow[]>
  push(rows: PushRow[]): Promise<void>
}

export class ForeignDataError extends Error {
  constructor(public email: string) {
    super('На устройстве данные другого аккаунта')
  }
}

/** Re-read a little before the cursor: rows may land on the server slightly out of order. */
const OVERLAP_MS = 10_000

const isSynced = (t: string): t is (typeof SYNCED)[number] => (SYNCED as readonly string[]).includes(t)

/** JSON with sorted keys, so the same record compares equal whatever the key order. */
export const stable = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )

/**
 * Built-in exercises and templates exist on every device from the start, so they are
 * compared against their defaults: untouched ones are never sent, removed ones are.
 */
const DEFAULTS = new Map<string, string>([
  ...seedExercises.map((e) => [`exercises:${e.id}`, stable(e)] as const),
  ...seedTemplates.map((t) => [`templates:${t.id}`, stable(t)] as const),
])
/** Shadow marker for a built-in record that is known to be deleted. */
const GONE = ''

/**
 * One round of sync: take what changed on the server, then send what changed here.
 * A record changed on both sides keeps the local version, which is then sent.
 */
export async function syncOnce(
  db: GainssDB,
  remote: Remote,
  user: { id: string; email: string },
): Promise<{ pulled: number; pushed: number }> {
  const prev = await db.syncState.get('state')
  if (prev && prev.userId !== user.id) throw new ForeignDataError(prev.email)

  const since = prev?.cursor ? new Date(new Date(prev.cursor).getTime() - OVERLAP_MS).toISOString() : null
  const rows = await remote.pull(since)
  let pulled = 0
  muteLocalChange(1)
  try {
    await db.transaction('rw', [...SYNCED.map((t) => db.table(t)), db.shadow, db.syncState], async () => {
      for (const row of rows) {
        if (!isSynced(row.tbl)) continue
        const table = db.table(row.tbl)
        const key = `${row.tbl}:${row.id}`
        const data = row.deleted ? null : { ...(row.data as object), id: row.id }
        const [shadow, local] = await Promise.all([db.shadow.get(key), table.get(row.id)])
        const localJson = local === undefined ? null : stable(local)
        const remoteJson = data === null ? null : stable(data)
        const changedHere = shadow !== undefined && (shadow.json || null) !== localJson
        if (changedHere && localJson !== remoteJson) continue
        if (localJson !== remoteJson) {
          if (data === null) await table.delete(row.id)
          else {
            if (row.tbl === 'body') {
              // One entry per day: the server's entry replaces a different local one for that date.
              const date = (data as { date?: string }).date ?? ''
              await db.body.where('date').equals(date).and((b) => b.id !== row.id).delete()
            }
            await table.put(data)
          }
          pulled++
        }
        if (remoteJson !== null) await db.shadow.put({ key, json: remoteJson })
        else if (DEFAULTS.has(key)) await db.shadow.put({ key, json: GONE })
        else await db.shadow.delete(key)
      }
      const cursor = rows.length ? rows[rows.length - 1].updated_at : (prev?.cursor ?? null)
      await db.syncState.put({ key: 'state', userId: user.id, email: user.email, cursor })
    })
  } finally {
    muteLocalChange(-1)
  }

  const known = new Map((await db.shadow.toArray()).map((s) => [s.key, s.json]))
  const out: PushRow[] = []
  const settled: { key: string; json: string | null }[] = []
  const present = new Set<string>()
  for (const tbl of SYNCED) {
    for (const rec of (await db.table(tbl).toArray()) as { id: number }[]) {
      const key = `${tbl}:${rec.id}`
      const json = stable(rec)
      present.add(key)
      if ((known.get(key) ?? DEFAULTS.get(key)) === json) continue
      out.push({ tbl, id: rec.id, data: JSON.parse(json), deleted: false })
      settled.push({ key, json })
    }
  }
  for (const key of new Set([...known.keys(), ...DEFAULTS.keys()])) {
    if (present.has(key) || known.get(key) === GONE) continue
    const at = key.indexOf(':')
    out.push({ tbl: key.slice(0, at), id: Number(key.slice(at + 1)), data: null, deleted: true })
    settled.push({ key, json: DEFAULTS.has(key) ? GONE : null })
  }
  if (out.length) {
    await remote.push(out)
    await db.transaction('rw', db.shadow, async () => {
      for (const s of settled) {
        if (s.json === null) await db.shadow.delete(s.key)
        else await db.shadow.put({ key: s.key, json: s.json })
      }
    })
  }
  return { pulled, pushed: out.length }
}

/** Forget the account this device was synchronised with; local records stay. */
export async function forgetSync(db: GainssDB): Promise<void> {
  await db.transaction('rw', db.shadow, db.syncState, async () => {
    await db.shadow.clear()
    await db.syncState.clear()
  })
}

/** Back to a fresh install: used when another account signs in on this device. */
export async function resetLocal(db: GainssDB): Promise<void> {
  muteLocalChange(1)
  try {
    await db.transaction('rw', [...SYNCED.map((t) => db.table(t)), db.shadow, db.syncState], async () => {
      for (const t of SYNCED) await db.table(t).clear()
      await db.shadow.clear()
      await db.syncState.clear()
      await db.exercises.bulkAdd(seedExercises)
      await db.templates.bulkAdd(seedTemplates)
    })
  } finally {
    muteLocalChange(-1)
  }
}
