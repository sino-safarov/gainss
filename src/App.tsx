import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from './db'
import { Body } from './ui/Body'
import { Home } from './ui/Home'
import { More } from './ui/More'
import { Progress } from './ui/Progress'
import { WorkoutScreen } from './ui/Workout'

const TABS = [
  ['train', 'Тренировка'],
  ['progress', 'Прогресс'],
  ['body', 'Вес'],
  ['more', 'Настройки'],
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
        {tab === 'body' && <Body />}
        {tab === 'more' && <More />}
      </main>
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? 'tab on' : 'tab'} onClick={() => setTab(id)}>
            {label}
            {id === 'train' && active && <span className="live" aria-label="идёт тренировка" />}
          </button>
        ))}
      </nav>
    </>
  )
}
