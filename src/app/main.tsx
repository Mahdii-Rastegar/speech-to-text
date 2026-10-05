import '@fontsource-variable/vazirmatn'
import '@fontsource-variable/jetbrains-mono'
import '@/ui/theme/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { APP_NAME } from './config'
import { loadKeys } from './stores/keysStore'
import { loadHistory } from './stores/sessionsStore'

document.title = APP_NAME
void loadHistory()
void loadKeys()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
