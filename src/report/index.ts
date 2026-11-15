import { db } from '../db'
import {
  heatmap,
  isPlateau,
  muscleBalance,
  muscleVolume,
  recordsOf,
  sessionsOf,
  weeklySeries,
  weekStart,
  weekStreak,
} from '../domain/calc'
import type { Muscle, SetEntry } from '../types'
import { buildReportPages, type ReportData, type ReportExercise } from './pages'
import { A4, buildPdf, type PdfImagePage } from './pdf'

const WEEK = 7 * 24 * 60 * 60 * 1000
/** Pixels per PDF point: 2.5 gives roughly 180 dpi, sharp on a phone and in print. */
const SCALE = 2.5

export async function collectReportData(now = Date.now()): Promise<ReportData> {
  const [exercises, sets, workouts, body] = await Promise.all([
    db.exercises.toArray(),
    db.sets.toArray(),
    db.workouts.where('status').equals('done').toArray(),
    db.body.orderBy('date').toArray(),
  ])
  const map = new Map(exercises.map((e) => [e.id, e]))
  const work = sets.filter((s) => !s.warmup)

  const grouped = new Map<number, SetEntry[]>()
  for (const s of work) {
    const list = grouped.get(s.exerciseId)
    if (list) list.push(s)
    else grouped.set(s.exerciseId, [s])
  }
  const rows: ReportExercise[] = []
  for (const [id, list] of grouped) {
    const sessions = sessionsOf(list)
    const last = sessions[sessions.length - 1]
    const records = recordsOf(sessions)
    const top = last.sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a))
    rows.push({
      name: map.get(id)?.name ?? 'Удалённое упражнение',
      sessions: sessions.length,
      last: `${top.weight.toLocaleString('ru-RU')}×${top.reps}`,
      lastDate: last.date,
      maxWeight: records.maxWeight?.weight ?? 0,
      best1rm: records.bestE1rm?.value ?? 0,
      stalled: isPlateau(sessions),
    })
  }
  rows.sort((a, b) => b.lastDate - a.lastDate)

  const thisWeek = weekStart(now)
  const month = muscleVolume(sets, map, thisWeek - 3 * WEEK, thisWeek + WEEK)
  const distribution: Partial<Record<Muscle, number>> = {}
  for (const [m, v] of Object.entries(month)) distribution[m as Muscle] = v.sets

  return {
    now,
    firstAt: work.length ? Math.min(...work.map((s) => s.ts)) : null,
    workouts: workouts.length,
    streak: weekStreak(workouts.map((w) => w.startedAt), now),
    tonnage: work.reduce((sum, s) => sum + s.weight * s.reps, 0),
    bodyKg: body.length ? body[body.length - 1].kg : null,
    heat: heatmap(sets, 26, now),
    balance: muscleBalance(sets, map, now),
    weeks: weeklySeries(sets, 12, now),
    distribution,
    body: body.map((b) => ({ ts: new Date(`${b.date}T12:00:00`).getTime(), kg: b.kg })),
    exercises: rows,
  }
}

async function rasterise(svg: string): Promise<PdfImagePage> {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(A4.width * SCALE)
  canvas.height = Math.round(A4.height * SCALE)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Не удалось отрисовать страницу отчёта')
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

/** Builds the PDF report from the local database. Works offline. */
export async function createReportPdf(): Promise<File> {
  const data = await collectReportData()
  const pages: PdfImagePage[] = []
  for (const svg of buildReportPages(data)) pages.push(await rasterise(svg))
  const date = new Date(data.now)
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return new File([buildPdf(pages) as BlobPart], `gainss-otchet-${stamp}.pdf`, { type: 'application/pdf' })
}
