import { db, setMeta, type GainssDB } from './db'

export const BACKUP_FORMAT = 'gainss-backup'
export const BACKUP_VERSION = 1
export const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000

const TABLES = ['exercises', 'templates', 'workouts', 'sets', 'body', 'meta'] as const
type TableName = (typeof TABLES)[number]

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: Record<TableName, unknown[]>
}

export async function exportBackup(source: GainssDB = db): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>
  for (const t of TABLES) data[t] = await source.table(t).toArray()
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
}

export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Файл повреждён: это не JSON')
  }
  const b = parsed as Partial<Backup>
  if (!b || b.format !== BACKUP_FORMAT || typeof b.data !== 'object' || b.data === null)
    throw new Error('Это не файл резервной копии Gainss')
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
    throw new Error('Копия сделана в более новой версии приложения')
  for (const t of TABLES) if (!Array.isArray(b.data[t])) throw new Error(`В копии нет раздела «${t}»`)
  return b as Backup
}

/** Replaces everything in the database with the backup contents, atomically. */
export async function importBackup(backup: Backup, target: GainssDB = db): Promise<void> {
  await target.transaction('rw', TABLES.map((t) => target.table(t)), async () => {
    for (const t of TABLES) {
      await target.table(t).clear()
      await target.table(t).bulkAdd(backup.data[t])
    }
  })
}

/** Hands the backup file to the share sheet (Files / iCloud Drive) or downloads it. */
export async function saveBackupFile(): Promise<boolean> {
  const backup = await exportBackup()
  const name = `gainss-${backup.exportedAt.slice(0, 10)}.json`
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' })
  let shared = false
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      shared = true
    } catch (e) {
      // Cancelled by the user: nothing was saved. Any other failure falls back to a download.
      if ((e as Error).name === 'AbortError') return false
    }
  }
  if (!shared) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  await setMeta('lastBackupAt', Date.now())
  return true
}
