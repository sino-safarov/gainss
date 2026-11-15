import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173/gainss/', locale: 'ru-RU' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15 Pro Max'] } },
  ],
  webServer: { command: 'npm run preview', url: 'http://localhost:4173/gainss/', reuseExistingServer: true },
})
