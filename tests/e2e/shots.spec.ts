import { test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

// Visual check only: run with SHOTS=<dir> to save screenshots of the main screens with demo data.
test('screenshots', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'set SHOTS to a directory')
  const dir = process.env.SHOTS!
  page.on('dialog', (d) => void d.accept())
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }))
  await page.goto('./')

  // Build demo history on top of an exported backup, then import it.
  await page.getByRole('button', { name: 'Настройки' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить копию' }).click()
  const file = await (await download).path()
  const backup = JSON.parse(await readFile(file, 'utf8'))
  const DAY = 24 * 60 * 60 * 1000
  let setId = 1
  let rnd = 7
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647
  for (let d = 150, n = 1; d >= 1; d--) {
    if (d % 7 === 3 || d % 7 === 6 || rand() < 0.12) continue
    const tpl = backup.data.templates[n % 3] // legs-heavy templates skipped: shows lagging groups
    const startedAt = Date.now() - d * DAY
    backup.data.workouts.push({ id: n, name: tpl.name, templateId: tpl.id, status: 'done', startedAt, finishedAt: startedAt + 3600e3, items: tpl.items })
    for (const it of tpl.items)
      for (let s = 0; s < it.sets; s++)
        backup.data.sets.push({ id: setId++, workoutId: n, exerciseId: it.exerciseId, weight: 40 + Math.round((150 - d) / 12) * 2.5, reps: 8 + Math.floor(rand() * 4), warmup: false, ts: startedAt + setId * 1000 })
    n++
  }
  for (let d = 60; d >= 0; d -= 2)
    backup.data.body.push({ id: 100 + d, date: new Date(Date.now() - d * DAY).toISOString().slice(0, 10), kg: 82 + (60 - d) * 0.03 + rand() * 0.4 })
  await writeFile(file, JSON.stringify(backup))
  await page.getByTestId('import-file').setInputFiles(file)
  await page.getByText('Данные восстановлены из копии.').waitFor()

  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click()
  await shot('1-home')
  await page.getByRole('button', { name: 'Профиль' }).click()
  await page.getByText('Баланс мышц').waitFor()
  await shot('2-profile')
  await page.getByRole('button', { name: 'Прогресс' }).click()
  await page.getByText('Тоннаж по неделям').waitFor()
  await shot('3-progress')
  await page.getByRole('button', { name: /Жим штанги лёжа/ }).click()
  await page.screenshot({ path: `${dir}/4-exercise.png` })
  await page.getByRole('button', { name: '‹ Назад' }).click()
  await page.getByRole('button', { name: 'Вес', exact: true }).click()
  await page.screenshot({ path: `${dir}/5-body.png` })
  await page.getByRole('button', { name: 'Тренировка', exact: true }).click()
  await page.getByRole('button', { name: /Жим: грудь.*Начать/ }).click()
  await page.getByRole('button', { name: 'Записать подход' }).click()
  await page.getByRole('timer').waitFor()
  await page.screenshot({ path: `${dir}/6-workout.png` })
})
