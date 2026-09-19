import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@frontend/styles/variables.css'
import '@frontend/styles/results.css'

import { App } from './App'
import './styles.css'

document.documentElement.setAttribute('data-theme', 'dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
