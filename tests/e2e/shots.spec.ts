import { test } from '@playwright/test'

// Visual check only: run with SHOTS=<dir> to save screenshots of the main screens.
test('screenshots', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'set SHOTS to a directory')
  const dir = process.env.SHOTS!
  page.on('dialog', (d) => void d.accept())
  await page.goto('./')
  await page.getByRole('button', { name: /Жим: грудь.*Начать/ }).click()
  await page.getByRole('button', { name: 'Записать подход' }).waitFor()
  await page.screenshot({ path: `${dir}/1-workout.png` })
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Записать подход' }).click()
  await page.screenshot({ path: `${dir}/2-logged.png` })
  await page.getByRole('button', { name: 'Прогресс' }).click()
  await page.screenshot({ path: `${dir}/3-progress.png` })
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.screenshot({ path: `${dir}/4-settings.png`, fullPage: true })
  await page.getByRole('button', { name: /Ноги/ }).click()
  await page.screenshot({ path: `${dir}/5-template.png` })
})
