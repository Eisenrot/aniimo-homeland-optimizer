import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './modern.css'

const node = document.getElementById('root')
if (!node) throw new Error('Missing #root')

createRoot(node).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
