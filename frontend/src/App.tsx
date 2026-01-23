import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

import './styles/variables.css'
import './styles/base.css'
import './styles/animations.css'
import './styles/banners.css'
import './styles/components.css'
import './styles/navigation.css'
import './styles/layout.css'
import './styles/responsive.css'
import './styles/hero.css'
import './styles/models.css'
import './styles/results.css'
import './App.css'

import { Layout } from './components'
import { ErrorBoundary, LoadingSpinner } from './components/shared'
import { AuthProvider } from './contexts/AuthContext'
import { MainPage } from './pages'

const About = lazy(() =>
  import('./components/pages/About').then(module => ({ default: module.About }))
)
const Features = lazy(() =>
  import('./components/pages/Features').then(module => ({ default: module.Features }))
)
const FAQ = lazy(() => import('./components/pages/FAQ').then(module => ({ default: module.FAQ })))
const PrivacyPolicy = lazy(() =>
  import('./components/pages/PrivacyPolicy').then(module => ({ default: module.PrivacyPolicy }))
)
const HowItWorks = lazy(() =>
  import('./components/pages/HowItWorks').then(module => ({ default: module.HowItWorks }))
)
const TermsOfService = lazy(() =>
  import('./components/TermsOfService').then(module => ({ default: module.TermsOfService }))
)

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route
              path="/about"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <About />
                </Suspense>
              }
            />
            <Route
              path="/features"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <Features />
                </Suspense>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <HowItWorks />
                </Suspense>
              }
            />
            <Route
              path="/faq"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <FAQ />
                </Suspense>
              }
            />
            <Route
              path="/privacy-policy"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <PrivacyPolicy />
                </Suspense>
              }
            />
            <Route
              path="/terms-of-service"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <TermsOfService />
                </Suspense>
              }
            />
            <Route path="*" element={<MainPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
