import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const BENCH = 'Жим штанги лёжа'

async function open(page: Page) {
  page.on('dialog', (d) => void d.accept())
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Тренировка' })).toBeVisible()
}

const weight = (page: Page) => page.getByLabel('Вес, кг', { exact: true })
const reps = (page: Page) => page.getByLabel('Повторы', { exact: true })
const log = (page: Page) => page.getByRole('button', { name: 'Записать подход' })

async function startFirstTemplate(page: Page) {
  await page.getByRole('button', { name: /Жим: грудь, плечи, трицепс.*Начать/ }).click()
  await expect(page.getByRole('button', { name: new RegExp(BENCH) })).toHaveAttribute('aria-expanded', 'true')
}

async function benchSession(page: Page, kg: string, count: string, sets = 4) {
  await startFirstTemplate(page)
  for (let i = 0; i < sets; i++) {
    await weight(page).fill(kg)
    await reps(page).fill(count)
    await log(page).click()
    await expect(page.getByRole('button', { name: new RegExp(`${BENCH}.*${i + 1}/4`) })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Завершить тренировку' }).click()
  await expect(page.getByRole('heading', { name: 'История' })).toBeVisible()
}

test('logs a workout, then prefills and suggests more weight next time', async ({ page }) => {
  await open(page)
  await startFirstTemplate(page)

  // No history yet: defaults.
  await expect(weight(page)).toHaveValue('20')
  await expect(reps(page)).toHaveValue('6')
  await page.getByRole('button', { name: 'Вес, кг: больше' }).click()
  await expect(weight(page)).toHaveValue('22,5')

  for (let i = 0; i < 4; i++) {
    await weight(page).fill('80')
    await reps(page).fill('10')
    await log(page).click()
    await expect(page.getByRole('button', { name: new RegExp(`${BENCH}.*${i + 1}/4`) })).toBeVisible()
  }
  await expect(page.getByRole('timer')).toBeVisible()
  // All planned sets done: the next exercise opens by itself.
  await expect(page.getByRole('button', { name: /Жим гантелей на наклонной скамье/ })).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('button', { name: 'Завершить тренировку' }).click()
  await expect(page.getByRole('timer')).toBeHidden()
  await expect(page.getByText('последний раз')).toBeVisible()

  // Second session: last results shown, weight bumped by one step.
  await startFirstTemplate(page)
  await expect(page.getByText('Прошлый раз: 80×10 · 80×10 · 80×10 · 80×10')).toBeVisible()
  await expect(page.getByText('Пора добавить вес: 82,5 кг')).toBeVisible()
  await expect(weight(page)).toHaveValue('82,5')
  await expect(reps(page)).toHaveValue('6')
  await log(page).click()
  await expect(page.getByText(/🏆.*рекорд веса/)).toBeVisible()

  // The active workout survives a reload.
  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(`${BENCH}.*1/4`) })).toBeVisible()

  // Profile: stats, activity calendar and the muscle map.
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByText('тренировок всего')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Календарь тренировок' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Манекен, вид спереди' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Грудь.*подх\.\/нед/ })).toBeVisible()

  // Progress shows the exercise with its records and this week's volume.
  await page.getByRole('button', { name: 'Прогресс' }).click()
  await expect(page.getByText('Грудь').first()).toBeVisible()
  await expect(page.getByText('Тоннаж по неделям')).toBeVisible()
  await page.getByRole('button', { name: new RegExp(BENCH) }).click()
  await expect(page.getByText('Личные рекорды')).toBeVisible()
  await expect(page.getByRole('definition').filter({ hasText: '82,5 кг × 6' })).toBeVisible()
})

test('flags a plateau after three sessions without improvement', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page)
  for (let i = 0; i < 4; i++) await benchSession(page, '80', '8')
  await startFirstTemplate(page)
  await expect(page.getByText('Нет роста 3 тренировки')).toBeVisible()
  await expect(page.getByText('Цель: 80 кг × 10 во всех подходах')).toBeVisible()
})

test('edits a template and uses it', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: '+ Новый шаблон' }).click()
  await page.getByLabel('Название шаблона').fill('Руки')
  await page.getByRole('button', { name: '+ Добавить упражнение' }).click()
  await page.getByPlaceholder('Поиск или название нового').fill('молот')
  await page.getByRole('button', { name: /Молотки с гантелями/ }).click()
  await page.getByRole('button', { name: 'Больше подходов' }).click()
  await expect(page.getByText('4 подх.')).toBeVisible()
  await page.getByRole('button', { name: '‹ Назад' }).click()

  await page.getByRole('button', { name: 'Тренировка' }).click()
  await page.getByRole('button', { name: /Руки/ }).click()
  await expect(page.getByRole('button', { name: /Молотки с гантелями.*0\/4/ })).toBeVisible()
})

test('tracks body weight and restores data from a backup file', async ({ page }) => {
  // The share sheet cannot be driven in a headless browser: exercise the download path.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }))
  await open(page)
  await page.getByRole('button', { name: 'Вес', exact: true }).click()
  await page.getByLabel('Сегодня, кг', { exact: true }).fill('84,6')
  await page.getByRole('button', { name: 'Записать' }).click()
  await expect(page.getByRole('button', { name: /84,6 кг/ })).toBeVisible()

  await page.getByRole('button', { name: 'Настройки' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить копию' }).click()
  const file = await (await download).path()
  expect(JSON.parse(await readFile(file, 'utf8')).data.body[0].kg).toBe(84.6)
  await expect(page.getByText('Копия сохранена.')).toBeVisible()

  // Wipe the entry, then bring it back from the file.
  await page.getByRole('button', { name: 'Вес', exact: true }).click()
  await page.getByRole('button', { name: /84,6 кг/ }).click()
  await expect(page.getByRole('button', { name: /84,6 кг/ })).toBeHidden()
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByTestId('import-file').setInputFiles(file)
  await expect(page.getByText('Данные восстановлены из копии.')).toBeVisible()
  await page.getByRole('button', { name: 'Вес', exact: true }).click()
  await expect(page.getByRole('button', { name: /84,6 кг/ })).toBeVisible()
})

test('works offline after the first visit', async ({ page, context }) => {
  await open(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await context.setOffline(true)
  await page.reload()
  await startFirstTemplate(page)
  await log(page).click()
  await expect(page.getByRole('button', { name: new RegExp(`${BENCH}.*1/4`) })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(`${BENCH}.*1/4`) })).toBeVisible()
})
