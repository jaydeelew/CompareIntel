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
import './App.css'

import { Layout, ThemeSync } from './components'
import { ErrorBoundary, LoadingSpinner } from './components/shared'
import { AuthProvider } from './contexts/AuthContext'
import { PWAInstallProvider } from './contexts/PWAInstallContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AdminPage } from './pages'
import { MainPage } from './pages/MainPage'

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
const NotFound = lazy(() =>
  import('./components/pages/NotFound').then(module => ({ default: module.NotFound }))
)
const SharedComparison = lazy(() =>
  import('./components/pages/SharedComparison').then(module => ({
    default: module.SharedComparison,
  }))
)
const ModelsIndex = lazy(() =>
  import('./components/pages/ModelsIndex').then(module => ({ default: module.ModelsIndex }))
)
const ModelPage = lazy(() =>
  import('./components/pages/ModelPage').then(module => ({ default: module.ModelPage }))
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
                  path="/privacy"
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
                  path="/models"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <ModelsIndex />
                    </Suspense>
                  }
                />
                <Route
                  path="/models/:slug"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <ModelPage />
                    </Suspense>
                  }
                />
                {/* MainPage is eager-loaded: lazy route + Vite dev can load a second `react` copy and break hooks (Invalid hook call / useRef null). */}
                <Route path="/" element={<MainPage />} />
                <Route
                  path="/c/:shareSlug"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <SharedComparison />
                    </Suspense>
                  }
                />
                <Route path="/admin" element={<AdminPage />} />
                <Route
                  path="*"
                  element={
                    <Suspense fallback={<LoadingSpinner />}>
                      <NotFound />
                    </Suspense>
                  }
                />
              </Route>
            </Routes>
          </PWAInstallProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
