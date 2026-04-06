import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import './styles/variables.css'
import './styles/base.css'
import './styles/animations.css'
import './styles/banners.css'
import './styles/components.css'
import './styles/navigation.css'
import './styles/layout.css'
import './styles/responsive.css'
import './App.css'

import { Layout, ThemeSync } from './components'
import { ErrorBoundary, LoadingSpinner } from './components/shared'
import { AuthProvider } from './contexts/AuthContext'
import { PWAInstallProvider } from './contexts/PWAInstallContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AdminPage } from './pages'

const MainPage = lazy(() =>
  import('./pages/MainPage').then(module => ({ default: module.MainPage }))
)

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
const HelpMeChooseMethodology = lazy(() =>
  import('./components/pages/HelpMeChooseMethodology').then(module => ({
    default: module.HelpMeChooseMethodology,
  }))
)
const ImageGeneration = lazy(() =>
  import('./components/pages/ImageGeneration').then(module => ({
    default: module.ImageGeneration,
  }))
)

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <PWAInstallProvider>
            <ThemeSync />
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
                <Route
                  path="/help-me-choose-methodology"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <HelpMeChooseMethodology />
                    </Suspense>
                  }
                />
                <Route
                  path="/image-generation"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <ImageGeneration />
                    </Suspense>
                  }
                />
                <Route
                  path="/"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <MainPage />
                    </Suspense>
                  }
                />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </PWAInstallProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
