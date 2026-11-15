import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GainssDB, onLocalChange } from '../../src/db'
import { ForeignDataError, resetLocal, stable, syncOnce, type PushRow, type Remote, type RemoteRow } from '../../src/sync/engine'
import type { BodyEntry, SetEntry, Workout } from '../../src/types'

/** In-memory stand-in for the server table of one account. */
function fakeServer() {
  const rows = new Map<string, RemoteRow>()
  let clock = Date.UTC(2026, 0, 1)
  const remote: Remote = {
    async pull(since) {
      return [...rows.values()]
        .filter((r) => !since || r.updated_at > since)
        .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
        .map((r) => structuredClone(r))
    },
    async push(batch: PushRow[]) {
      clock += 60_000
      for (const r of batch)
        rows.set(`${r.tbl}:${r.id}`, { ...structuredClone(r), updated_at: new Date(clock).toISOString() })
    },
  }
  return { rows, remote }
}

const me = { id: 'u1', email: 'me@example.com' }
let n = 0
const fresh = () => new GainssDB(`sync-${++n}`)
const workout = (d: GainssDB) =>
  d.workouts.add({ name: 'Ноги', status: 'done', startedAt: 1, finishedAt: 2, items: [] } as unknown as Workout)
const set = (d: GainssDB, workoutId: number, weight: number) =>
  d.sets.add({ workoutId, exerciseId: 25, weight, reps: 5, warmup: false, ts: 1 } as SetEntry)

describe('ids', () => {
  it('new records get ids that do not collide between devices', async () => {
    const [a, b] = [fresh(), fresh()]
    const ids = [await workout(a), await workout(a), await workout(b)]
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(Number.isSafeInteger(id) && id > 1e12).toBe(true)
    expect((await a.workouts.get(ids[0]))?.id).toBe(ids[0])
  })
})

describe('stable', () => {
  it('ignores key order', () => {
    expect(stable({ b: 1, a: { d: 1, c: [2, { y: 1, x: 2 }] } })).toBe(stable({ a: { c: [2, { x: 2, y: 1 }], d: 1 }, b: 1 }))
  })
})

describe('sync', () => {
  it('carries data from one device to another and back', async () => {
    const { remote } = fakeServer()
    const [a, b] = [fresh(), fresh()]
    const w = await workout(a)
    await set(a, w, 100)
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    expect(await b.workouts.get(w)).toEqual(await a.workouts.get(w))
    expect(await b.sets.count()).toBe(1)

    const w2 = await workout(b)
    await syncOnce(b, remote, me)
    await syncOnce(a, remote, me)
    expect(await a.workouts.get(w2)).toBeDefined()
    // Nothing left to exchange.
    expect(await syncOnce(a, remote, me)).toEqual({ pulled: 0, pushed: 0 })
    expect(await syncOnce(b, remote, me)).toEqual({ pulled: 0, pushed: 0 })
  })

  it('propagates deletions', async () => {
    const { remote } = fakeServer()
    const [a, b] = [fresh(), fresh()]
    const w = await workout(a)
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    await b.workouts.delete(w)
    await b.templates.delete(3)
    await syncOnce(b, remote, me)
    await syncOnce(a, remote, me)
    expect(await a.workouts.get(w)).toBeUndefined()
    expect(await a.templates.get(3)).toBeUndefined()
    expect(await syncOnce(a, remote, me)).toEqual({ pulled: 0, pushed: 0 })
  })

  it('a fresh device takes edited defaults from the account instead of overwriting them', async () => {
    const { remote } = fakeServer()
    const [a, b] = [fresh(), fresh()]
    await a.exercises.update(1, { name: 'Жим лёжа' })
    await a.templates.delete(5)
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    expect((await b.exercises.get(1))?.name).toBe('Жим лёжа')
    expect(await b.templates.get(5)).toBeUndefined()
    await syncOnce(a, remote, me)
    expect((await a.exercises.get(1))?.name).toBe('Жим лёжа')
    expect(await a.templates.get(5)).toBeUndefined()
    expect(await syncOnce(a, remote, me)).toEqual({ pulled: 0, pushed: 0 })
    expect(await syncOnce(b, remote, me)).toEqual({ pulled: 0, pushed: 0 })
  })

  it('when both devices changed a record, the one that syncs last wins', async () => {
    const { remote } = fakeServer()
    const [a, b] = [fresh(), fresh()]
    const w = await workout(a)
    const s = await set(a, w, 100)
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    await a.sets.update(s, { weight: 105 })
    await b.sets.update(s, { weight: 110 })
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    await syncOnce(a, remote, me)
    expect((await a.sets.get(s))?.weight).toBe(110)
    expect((await b.sets.get(s))?.weight).toBe(110)
  })

  it('keeps one body-weight entry per day', async () => {
    const { remote } = fakeServer()
    const [a, b] = [fresh(), fresh()]
    await a.body.add({ date: '2026-11-15', kg: 84 } as BodyEntry)
    await b.body.add({ date: '2026-11-15', kg: 85 } as BodyEntry)
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    await syncOnce(a, remote, me)
    expect((await a.body.toArray()).map((x) => x.kg)).toEqual([84])
    expect((await b.body.toArray()).map((x) => x.kg)).toEqual([84])
  })

  it('refuses to mix accounts until local data is reset', async () => {
    const one = fakeServer()
    const two = fakeServer()
    const a = fresh()
    await workout(a)
    await syncOnce(a, one.remote, me)
    const other = { id: 'u2', email: 'other@example.com' }
    await expect(syncOnce(a, two.remote, other)).rejects.toBeInstanceOf(ForeignDataError)
    expect(two.rows.size).toBe(0)
    await resetLocal(a)
    await syncOnce(a, two.remote, other)
    expect(await a.workouts.count()).toBe(0)
    expect(await a.exercises.count()).toBe(40)
    expect(two.rows.size).toBe(0)
  })

  it('notifies about local changes but not about changes applied by sync', async () => {
    const { remote } = fakeServer()
    const [a, b] = [fresh(), fresh()]
    await Promise.all([a.open(), b.open()])
    let calls = 0
    const off = onLocalChange(() => calls++)
    await workout(a)
    expect(calls).toBe(1)
    await syncOnce(a, remote, me)
    await syncOnce(b, remote, me)
    expect(calls).toBe(1)
    off()
  })
})
