import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './stage.css'

const THEME_STORE = 'aniimoOptimizerThemeV1'

try {
  document.documentElement.dataset.optimizerTheme =
    window.localStorage.getItem(THEME_STORE) === 'dark' ? 'dark' : 'light'
} catch {
  document.documentElement.dataset.optimizerTheme = 'light'
}

const node = document.getElementById('root')
if (!node) throw new Error('Missing #root')

createRoot(node).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
