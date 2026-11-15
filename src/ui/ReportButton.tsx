import { useState } from 'react'
import { deliverFile } from '../backup'

type State = { kind: 'idle' } | { kind: 'building' } | { kind: 'ready'; file: File } | { kind: 'error'; message: string }

/**
 * Two taps on purpose: the share sheet only opens straight from a tap, and
 * building the PDF takes a moment, so the second tap hands over the ready file.
 */
export function ReportButton() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  const build = async () => {
    setState({ kind: 'building' })
    try {
      const { createReportPdf } = await import('../report')
      setState({ kind: 'ready', file: await createReportPdf() })
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message })
    }
  }

  const save = async (file: File) => {
    if (await deliverFile(file)) setState({ kind: 'idle' })
  }

  return (
    <div className="report">
      {state.kind === 'ready' ? (
        <button type="button" className="btn" onClick={() => void save(state.file)}>
          Сохранить PDF ({Math.max(1, Math.round(state.file.size / 1024))} КБ)
        </button>
      ) : (
        <button type="button" className="btn ghost" disabled={state.kind === 'building'} onClick={() => void build()}>
          {state.kind === 'building' ? 'Готовлю отчёт…' : 'Отчёт в PDF'}
        </button>
      )}
      {state.kind === 'error' && <p role="alert">Не удалось собрать отчёт: {state.message}</p>}
    </div>
  )
}
