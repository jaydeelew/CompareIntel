import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'
import { initializeRegistry } from './config/loadModelConfigs'
import { initWebVitals } from './utils/performance'

// Initialize model renderer registry before rendering
initializeRegistry().catch(error => {
  console.error('Failed to initialize model renderer registry:', error)
})

// Initialize performance monitoring
// Track Web Vitals metrics for Core Web Vitals monitoring
initWebVitals(metric => {
  // Log metrics in development
  if (import.meta.env.DEV) {
    const emoji =
      metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌'
    console.log(
      `${emoji} [Web Vitals] ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`
    )
  }

  // In production, metrics are automatically sent to analytics endpoint if configured
  // via VITE_PERFORMANCE_ENDPOINT environment variable
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
