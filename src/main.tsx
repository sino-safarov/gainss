import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { initCloud } from './sync/cloud'
import './styles.css'

registerSW({ immediate: true })
// Ask the browser not to evict the database under storage pressure.
void navigator.storage?.persist?.()
void initCloud()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
