import '@fontsource-variable/vazirmatn'
import '@fontsource-variable/jetbrains-mono'
import '@/ui/theme/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { APP_NAME } from './config'

document.title = APP_NAME

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
