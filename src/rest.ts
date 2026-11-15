import { useSyncExternalStore } from 'react'

/** Rest timer state. Based on wall-clock timestamps so it stays correct after the screen locks. */
export interface Rest {
  endAt: number
  total: number
  signalled: boolean
}

const KEY = 'gainss.rest'
const listeners = new Set<() => void>()

function load(): Rest | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Rest) : null
  } catch {
    return null
  }
}

let state: Rest | null = load()

function set(next: Rest | null) {
  state = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the timer still works for this session */
  }
  listeners.forEach((l) => l())
}

export const startRest = (seconds: number) =>
  set({ endAt: Date.now() + seconds * 1000, total: seconds, signalled: false })

export const adjustRest = (deltaSeconds: number) => {
  if (!state) return
  const endAt = Math.max(Date.now(), state.endAt + deltaSeconds * 1000)
  set({ ...state, endAt, total: Math.max(0, state.total + deltaSeconds), signalled: endAt <= Date.now() })
}

export const stopRest = () => set(null)

export const markSignalled = () => {
  if (state && !state.signalled) set({ ...state, signalled: true })
}

export const useRest = (): Rest | null =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

let ctx: AudioContext | null = null

/** Must be called from a tap so iOS allows sound later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* no audio support */
  }
}

export function beep() {
  navigator.vibrate?.([200, 100, 200])
  if (!ctx || ctx.state !== 'running') return
  for (const offset of [0, 0.25, 0.5]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.25
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + offset)
    osc.stop(ctx.currentTime + offset + 0.15)
  }
}
