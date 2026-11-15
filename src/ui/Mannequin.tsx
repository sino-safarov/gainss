import type { MuscleStatus } from '../domain/calc'
import type { Muscle } from '../types'

export const STATUS: Record<MuscleStatus, { label: string; color: string }> = {
  none: { label: 'нет нагрузки', color: '#2b323c' },
  low: { label: 'отстаёт', color: '#f87171' },
  mid: { label: 'маловато', color: '#fbbf24' },
  ok: { label: 'в норме', color: '#4ade80' },
  high: { label: 'очень много', color: '#a78bfa' },
}

export type Paint = (m: Muscle) => { fill: string; className: string; onClick?: () => void }

/** Stylised mannequin drawn in a 120×254 box. Each muscle shape is filled with its status colour. */
export function MannequinFigure({ side, paint }: { side: 'front' | 'back'; paint: Paint }) {
  const pair = (m: Muscle, cx: number, cy: number, rx: number, ry: number) => (
    <>
      <ellipse {...paint(m)} cx={60 - cx} cy={cy} rx={rx} ry={ry} />
      <ellipse {...paint(m)} cx={60 + cx} cy={cy} rx={rx} ry={ry} />
    </>
  )
  return (
    <>
      <g className="body-frame">
        <circle cx="60" cy="17" r="12" />
        <rect x="54" y="27" width="12" height="12" rx="4" />
        <rect x="37" y="36" width="46" height="84" rx="15" />
        <path d="M36 44 L20 98 L17 124" />
        <path d="M84 44 L100 98 L103 124" />
        <path d="M50 116 L48 240" />
        <path d="M70 116 L72 240" />
        <ellipse cx="46" cy="246" rx="9" ry="4.5" />
        <ellipse cx="74" cy="246" rx="9" ry="4.5" />
      </g>
      {side === 'front' ? (
        <>
          {pair('shoulders', 25, 47, 10, 9)}
          <rect {...paint('chest')} x="39.5" y="41" width="19.5" height="21" rx="8" />
          <rect {...paint('chest')} x="61" y="41" width="19.5" height="21" rx="8" />
          {pair('biceps', 31, 72, 6.5, 14)}
          {pair('forearms', 39, 104, 5.5, 15)}
          {[66, 78, 90].map((y) => (
            <g key={y}>
              <rect {...paint('abs')} x="47.5" y={y} width="11.5" height="10" rx="3.5" />
              <rect {...paint('abs')} x="61" y={y} width="11.5" height="10" rx="3.5" />
            </g>
          ))}
          {pair('quads', 11, 150, 10.5, 29)}
          {pair('calves', 12, 212, 7, 22)}
        </>
      ) : (
        <>
          <path {...paint('back')} d="M60 32 L78 42 L60 58 L42 42 Z" strokeLinejoin="round" />
          {pair('shoulders', 25, 47, 10, 9)}
          <path {...paint('back')} d="M41 52 Q41 48 45 50 L58 60 L58 90 Q48 88 43 74 Z" />
          <path {...paint('back')} d="M79 52 Q79 48 75 50 L62 60 L62 90 Q72 88 77 74 Z" />
          {pair('triceps', 31, 72, 6.5, 14)}
          {pair('forearms', 39, 104, 5.5, 15)}
          {pair('glutes', 10.5, 110, 10, 10.5)}
          {pair('hams', 11, 153, 10.5, 27)}
          {pair('calves', 12, 211, 8.5, 21)}
        </>
      )}
    </>
  )
}
