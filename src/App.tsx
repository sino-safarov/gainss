import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { db } from './db'
import { Body } from './ui/Body'
import { Home } from './ui/Home'
import { More } from './ui/More'
import { Profile } from './ui/Profile'
import { Progress } from './ui/Progress'
import { WorkoutScreen } from './ui/Workout'

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
)

const TABS = [
  ['train', 'Тренировка', icon(<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12" />)],
  ['progress', 'Прогресс', icon(<path d="M4 5v14h16M8 15l4-5 3 3 4-6" />)],
  [
    'profile',
    'Профиль',
    icon(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>,
    ),
  ],
  [
    'body',
    'Вес',
    icon(
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M8.5 10a5 5 0 0 1 7 0M12 9.5l1.5 3" />
      </>,
    ),
  ],
  [
    'more',
    'Настройки',
    icon(
      <>
        <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
        <circle cx="16" cy="7" r="2.5" />
        <circle cx="10" cy="17" r="2.5" />
      </>,
    ),
  ],
] as const
type Tab = (typeof TABS)[number][0]

export function App() {
  const [tab, setTab] = useState<Tab>('train')
  // `null` = loaded, no active workout; `undefined` = still loading.
  const active = useLiveQuery(async () => (await db.workouts.where('status').equals('active').first()) ?? null, [])

  return (
    <>
      <main>
        {tab === 'train' && active !== undefined && (active ? <WorkoutScreen key={active.id} workout={active} /> : <Home />)}
        {tab === 'progress' && <Progress />}
        {tab === 'profile' && <Profile />}
        {tab === 'body' && <Body />}
        {tab === 'more' && <More />}
      </main>
      <nav className="tabs">
        {TABS.map(([id, label, glyph]) => (
          <button type="button" key={id} className={tab === id ? 'tab on' : 'tab'} onClick={() => setTab(id)}>
            {glyph}
            <span>{label}</span>
            {id === 'train' && active && <span className="live" aria-label="идёт тренировка" />}
          </button>
        ))}
      </nav>
    </>
  )
}
