import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { importBackup, parseBackup, saveBackupFile } from '../backup'
import { db, DEFAULT_REST, getMeta, setMeta } from '../db'
import { MUSCLES, MUSCLE_KEYS, type Exercise, type Muscle, type PlanItem, type Template } from '../types'
import { Account } from './Account'
import { ReportButton } from './ReportButton'
import { ExercisePicker, fmtClock, fmtDate, NumField, Sheet, useExercises } from './common'

function TemplateEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const template = useLiveQuery(() => db.templates.get(id), [id])
  const exercises = useExercises()
  const [picking, setPicking] = useState(false)
  if (!template || !exercises) return null

  const save = (items: PlanItem[]) => db.templates.update(id, { items })
  const move = (i: number, dir: -1 | 1) => {
    const items = [...template.items]
    const j = i + dir
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    void save(items)
  }
  const setSets = (i: number, sets: number) =>
    void save(template.items.map((it, k) => (k === i ? { ...it, sets: Math.min(10, Math.max(1, sets)) } : it)))
  const remove = async () => {
    if (!confirm(`Удалить шаблон «${template.name}»? История тренировок останется.`)) return
    await db.templates.delete(id)
    onClose()
  }

  return (
    <Sheet title="Шаблон" onClose={onClose}>
      <input
        className="text"
        aria-label="Название шаблона"
        value={template.name}
        onChange={(e) => void db.templates.update(id, { name: e.target.value })}
      />
      <ul className="list">
        {template.items.map((it, i) => (
          <li key={it.exerciseId} className="tpl-item">
            <span className="tpl-name">{exercises.map.get(it.exerciseId)?.name ?? '—'}</span>
            <span className="tpl-controls">
              <button type="button" className="mini" aria-label="Выше" onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="mini" aria-label="Ниже" onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" className="mini" aria-label="Меньше подходов" onClick={() => setSets(i, it.sets - 1)}>
                −
              </button>
              <span className="tpl-sets">{it.sets} подх.</span>
              <button type="button" className="mini" aria-label="Больше подходов" onClick={() => setSets(i, it.sets + 1)}>
                +
              </button>
              <button
                type="button"
                className="mini danger"
                aria-label="Убрать"
                onClick={() => void save(template.items.filter((_, k) => k !== i))}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost" onClick={() => setPicking(true)}>
        + Добавить упражнение
      </button>
      <button type="button" className="btn ghost danger" onClick={remove}>
        Удалить шаблон
      </button>
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            setPicking(false)
            if (!template.items.some((it) => it.exerciseId === ex.id))
              void save([...template.items, { exerciseId: ex.id, sets: 3 }])
          }}
        />
      )}
    </Sheet>
  )
}

function ExerciseEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const ex = useLiveQuery(() => db.exercises.get(id), [id])
  if (!ex) return null
  const patch = (p: Partial<Exercise>) => void db.exercises.update(id, p)
  const toggleSecondary = (m: Muscle) =>
    patch({ secondary: ex.secondary.includes(m) ? ex.secondary.filter((x) => x !== m) : [...ex.secondary, m] })
  return (
    <Sheet title="Упражнение" onClose={onClose}>
      <input className="text" aria-label="Название" value={ex.name} onChange={(e) => patch({ name: e.target.value })} />
      <label className="field">
        <span>Основная мышца</span>
        <select value={ex.muscle} onChange={(e) => patch({ muscle: e.target.value as Muscle })}>
          {MUSCLE_KEYS.map((m) => (
            <option key={m} value={m}>
              {MUSCLES[m]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">Вспомогательные мышцы</p>
      <div className="chips wrap">
        {MUSCLE_KEYS.filter((m) => m !== ex.muscle).map((m) => (
          <button
            type="button"
            key={m}
            className={ex.secondary.includes(m) ? 'chip on' : 'chip'}
            onClick={() => toggleSecondary(m)}
          >
            {MUSCLES[m]}
          </button>
        ))}
      </div>
      <div className="card">
        <NumField label="Шаг веса, кг" value={ex.step} step={0.25} min={0.25} onChange={(v) => patch({ step: v })} />
        <NumField
          label="Повторы: от"
          value={ex.repMin}
          step={1}
          min={1}
          onChange={(v) => patch({ repMin: Math.round(v), repMax: Math.max(ex.repMax, Math.round(v)) })}
        />
        <NumField
          label="Повторы: до"
          value={ex.repMax}
          step={1}
          min={1}
          onChange={(v) => patch({ repMax: Math.round(v), repMin: Math.min(ex.repMin, Math.round(v)) })}
        />
        <p className="muted small">
          Когда во всех рабочих подходах набирается верх диапазона, приложение предложит добавить один шаг веса.
        </p>
      </div>
      <button type="button" className="btn ghost" onClick={() => patch({ archived: !ex.archived })}>
        {ex.archived ? 'Вернуть в список' : 'Скрыть из списка (история сохранится)'}
      </button>
    </Sheet>
  )
}

export function More() {
  const templates = useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
  const exercises = useExercises()
  const restSeconds = useLiveQuery(() => getMeta('restSeconds', DEFAULT_REST), [])
  const lastBackupAt = useLiveQuery(() => getMeta<number>('lastBackupAt', 0), [])
  const [view, setView] = useState<{ kind: 'template' | 'exercise'; id: number } | 'exercises' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addTemplate = async () => {
    const order = Math.max(0, ...(templates ?? []).map((t) => t.order)) + 1
    const id = await db.templates.add({ name: 'Новый шаблон', order, items: [] } as unknown as Template)
    setView({ kind: 'template', id })
  }

  const exportNow = async () => {
    try {
      if (await saveBackupFile()) setMessage('Копия сохранена.')
    } catch (e) {
      setMessage(`Не удалось сохранить копию: ${(e as Error).message}`)
    }
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      const n = backup.data.workouts.length
      if (!confirm(`Заменить все данные копией от ${backup.exportedAt.slice(0, 10)} (тренировок: ${n})?`)) return
      await importBackup(backup)
      setMessage('Данные восстановлены из копии.')
    } catch (e) {
      setMessage(`Не удалось восстановить: ${(e as Error).message}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Настройки</h1>
      </header>

      <Account />

      <h2>Шаблоны тренировок</h2>
      <ul className="list">
        {(templates ?? []).map((t) => (
          <li key={t.id}>
            <button type="button" className="row" onClick={() => setView({ kind: 'template', id: t.id })}>
              <span>{t.name}</span>
              <span className="muted">{t.items.length} упр. ›</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost" onClick={addTemplate}>
        + Новый шаблон
      </button>

      <h2>Упражнения</h2>
      <button type="button" className="btn ghost" onClick={() => setView('exercises')}>
        Список упражнений ({exercises?.list.length ?? 0})
      </button>

      <h2>Таймер отдыха</h2>
      <div className="card">
        <NumField
          label={`Отдых между подходами, сек (${fmtClock(restSeconds ?? DEFAULT_REST)})`}
          value={restSeconds ?? DEFAULT_REST}
          step={15}
          min={15}
          onChange={(v) => void setMeta('restSeconds', Math.round(v))}
        />
      </div>

      <h2>Отчёт</h2>
      <div className="card">
        <p className="muted small">
          Статистика, календарь активности, баланс мышц, диаграммы и таблица рекордов одним PDF-файлом. Это отчёт для
          чтения: восстановить данные из него нельзя, для этого нужна резервная копия ниже.
        </p>
        <ReportButton />
      </div>

      <h2>Резервная копия</h2>
      <div className="card">
        <p className="muted small">
          Данные хранятся только на этом телефоне. Сохраняйте копию в «Файлы» или iCloud Drive.
          {lastBackupAt ? ` Последняя копия: ${fmtDate(lastBackupAt)}.` : ' Копий ещё не было.'}
        </p>
        <button type="button" className="btn" onClick={exportNow}>
          Сохранить копию
        </button>
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
          Восстановить из файла
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        {message && <p role="status">{message}</p>}
      </div>

      {view === 'exercises' && exercises && (
        <Sheet title="Упражнения" onClose={() => setView(null)}>
          <ul className="list">
            {[...exercises.list]
              .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
              .map((e) => (
                <li key={e.id}>
                  <button type="button" className="row" onClick={() => setView({ kind: 'exercise', id: e.id })}>
                    <span className={e.archived ? 'muted' : ''}>{e.name}</span>
                    <span className="muted">
                      {MUSCLES[e.muscle]} · {e.repMin}–{e.repMax} ›
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </Sheet>
      )}
      {view && view !== 'exercises' && view.kind === 'template' && (
        <TemplateEditor id={view.id} onClose={() => setView(null)} />
      )}
      {view && view !== 'exercises' && view.kind === 'exercise' && (
        <ExerciseEditor id={view.id} onClose={() => setView('exercises')} />
      )}
    </div>
  )
}
