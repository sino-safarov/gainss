export const MUSCLES = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hams: 'Бицепс бедра',
  glutes: 'Ягодицы',
  calves: 'Икры',
  abs: 'Пресс',
  forearms: 'Предплечья',
} as const

export type Muscle = keyof typeof MUSCLES
export const MUSCLE_KEYS = Object.keys(MUSCLES) as Muscle[]

export interface Exercise {
  id: number
  name: string
  muscle: Muscle
  secondary: Muscle[]
  /** Weight increment in kg used by steppers and progression hints. */
  step: number
  repMin: number
  repMax: number
  archived?: boolean
}

export interface PlanItem {
  exerciseId: number
  sets: number
}

export interface Template {
  id: number
  name: string
  order: number
  items: PlanItem[]
}

export interface Workout {
  id: number
  name: string
  templateId?: number
  status: 'active' | 'done'
  startedAt: number
  finishedAt?: number
  items: PlanItem[]
}

export interface SetEntry {
  id: number
  workoutId: number
  exerciseId: number
  weight: number
  reps: number
  warmup: boolean
  ts: number
}

export interface BodyEntry {
  id: number
  /** Local date, YYYY-MM-DD. One entry per day. */
  date: string
  kg: number
}

export interface Meta {
  key: string
  value: unknown
}
