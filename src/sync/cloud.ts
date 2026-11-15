import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { db, onLocalChange } from '../db'
import { ForeignDataError, forgetSync, resetLocal, syncOnce, type PushRow, type Remote, type RemoteRow } from './engine'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
/** Without these the app stays a local-only log and the account section is hidden. */
export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

export interface CloudUser {
  id: string
  email: string
}
export interface CloudState {
  /** The saved session has been read. */
  ready: boolean
  user: CloudUser | null
  syncing: boolean
  lastSyncAt: number | null
  error: string | null
  /** E-mail of another account whose data is on this device; sync waits for a decision. */
  foreign: string | null
}

const LAST_SYNC_KEY = 'gainss.lastSyncAt'
const PAGE = 1000
const CHUNK = 500
const DEBOUNCE_MS = 2000

let state: CloudState = {
  ready: !cloudConfigured,
  user: null,
  syncing: false,
  lastSyncAt: Number(localStorage.getItem(LAST_SYNC_KEY)) || null,
  error: null,
  foreign: null,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<CloudState>) => {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
export const useCloud = (): CloudState =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

let clientPromise: Promise<SupabaseClient> | null = null
const getClient = (): Promise<SupabaseClient> =>
  (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { flowType: 'pkce', detectSessionInUrl: true } }),
  ))

const remoteFor = (client: SupabaseClient, userId: string): Remote => ({
  async pull(since) {
    const out: RemoteRow[] = []
    for (let from = 0; ; from += PAGE) {
      let query = client.from('records').select('tbl,id,data,deleted,updated_at')
      if (since) query = query.gt('updated_at', since)
      const { data, error } = await query.order('updated_at').order('tbl').order('id').range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      out.push(...(data as RemoteRow[]))
      if (data.length < PAGE) return out
    }
  },
  async push(rows: PushRow[]) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => ({ ...r, user_id: userId }))
      const { error } = await client.from('records').upsert(batch, { onConflict: 'user_id,tbl,id' })
      if (error) throw new Error(error.message)
    }
  },
})

let running = false
let again = false
/** Exchanges changes with the account. Safe to call at any time; calls made meanwhile are folded into one more run. */
export async function syncNow(): Promise<void> {
  const user = state.user
  if (!user || state.foreign) return
  if (running) {
    again = true
    return
  }
  running = true
  set({ syncing: true })
  try {
    do {
      again = false
      await syncOnce(db, remoteFor(await getClient(), user.id), user)
    } while (again && state.user?.id === user.id)
    const lastSyncAt = Date.now()
    localStorage.setItem(LAST_SYNC_KEY, String(lastSyncAt))
    set({ lastSyncAt, error: null })
  } catch (e) {
    if (e instanceof ForeignDataError) set({ foreign: e.email })
    // Offline is the normal state in the gym: changes simply wait.
    else set({ error: navigator.onLine ? (e as Error).message : null })
  } finally {
    running = false
    set({ syncing: false })
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
const syncSoon = () => {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), DEBOUNCE_MS)
}

/** Reads the saved session and keeps data in sync while someone is signed in. */
export async function initCloud(): Promise<void> {
  if (!cloudConfigured) return
  const client = await getClient()
  client.auth.onAuthStateChange((_event, session) => {
    const u = session?.user
    const user = u ? { id: u.id, email: u.email ?? '' } : null
    const switched = user?.id !== state.user?.id
    set({ ready: true, user, ...(switched ? { error: null, foreign: null } : {}) })
    // Not from inside the callback: the auth client is still holding its lock here.
    if (user && switched) setTimeout(() => void syncNow(), 0)
  })
  onLocalChange(syncSoon)
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
}

const check = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message)
}

export async function signInWithGoogle(): Promise<void> {
  const client = await getClient()
  const redirectTo = `${location.origin}${import.meta.env.BASE_URL}`
  check(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }))
}

/** E-mails a one-time code; a new address gets an account on the spot. */
export async function sendEmailCode(email: string): Promise<void> {
  check(await (await getClient()).auth.signInWithOtp({ email }))
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  check(await (await getClient()).auth.verifyOtp({ email, token, type: 'email' }))
}

/** Signs out on this device. Records stay on the device. */
export async function signOut(): Promise<void> {
  await syncNow()
  check(await (await getClient()).auth.signOut({ scope: 'local' }))
}

/** Replaces the previous account's records on this device with the signed-in account's data. */
export async function replaceLocalData(): Promise<void> {
  await resetLocal(db)
  set({ foreign: null })
  await syncNow()
}

/** Deletes the account and everything stored for it on the server. Records on this device stay. */
export async function deleteAccount(): Promise<void> {
  const client = await getClient()
  check(await client.rpc('delete_account'))
  await client.auth.signOut({ scope: 'local' })
  await forgetSync(db)
  localStorage.removeItem(LAST_SYNC_KEY)
  set({ lastSyncAt: null })
}
