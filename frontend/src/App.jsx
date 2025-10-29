import React, { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { DemoProvider } from './contexts/DemoContext'
import ErrorBoundary from './components/ErrorBoundary'
import { warmupBackend } from './utils/retryHelper'

// Always-loaded components (Layout, Auth, Landing pages)
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PrivateRoute from './components/PrivateRoute'

// Lazy-loaded pages for code splitting
const PromoLandingPage = lazy(() => import('./pages/PromoLandingPage'))
const ConsultationPage = lazy(() => import('./pages/ConsultationPage'))
const CreditTrackerLandingPage = lazy(() => import('./pages/CreditTrackerLandingPage'))
const HomeschoolPortfolioPage = lazy(() => import('./pages/HomeschoolPortfolioPage'))
const TeacherConsultationPage = lazy(() => import('./pages/TeacherConsultationPage'))
const DemoPage = lazy(() => import('./pages/DemoPage'))
const EmailVerificationPage = lazy(() => import('./pages/EmailVerificationPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const OptioAcademyAgreement = lazy(() => import('./pages/OptioAcademyAgreement'))
const OptioAcademyHandbook = lazy(() => import('./pages/OptioAcademyHandbook'))
// Quest Pages
const QuestBadgeHub = lazy(() => import('./pages/QuestBadgeHub'))
const QuestDetail = lazy(() => import('./pages/QuestDetail'))
// Badge Pages
const BadgeDetail = lazy(() => import('./pages/BadgeDetail'))
const BadgeProgressPage = lazy(() => import('./pages/BadgeProgressPage'))
const ConstellationPage = lazy(() => import('./pages/ConstellationPage'))
// Credit & Transcript Pages
const CreditTrackerPage = lazy(() => import('./pages/CreditTrackerPage'))
const TranscriptPage = lazy(() => import('./pages/TranscriptPage'))
// Other Pages
const DiplomaPage = lazy(() => import('./pages/DiplomaPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const FriendsPage = lazy(() => import('./pages/FriendsPage'))
const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage'))
const CommunicationPage = lazy(() => import('./pages/CommunicationPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
// Admin & Special Pages
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdvisorDashboard = lazy(() => import('./pages/AdvisorDashboard'))
const AdvisorBadgeForm = lazy(() => import('./pages/AdvisorBadgeForm'))
const ParentDashboardPage = lazy(() => import('./pages/ParentDashboardPage'))

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
  </div>
)

// Configure React Query with proper defaults for data freshness
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // Data is fresh for 30 seconds
      cacheTime: 5 * 60 * 1000, // Cache data for 5 minutes
      refetchOnWindowFocus: true, // Refetch when window regains focus
      refetchOnReconnect: true, // Refetch when reconnecting
      retry: 3, // Retry failed requests 3 times
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    },
    mutations: {
      retry: 2, // Retry mutations twice on failure
    },
  },
})

function App() {
  // Warm up the backend service on app load (helps with Render cold starts)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    warmupBackend(`${apiUrl}/api`);
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <ScrollToTop />
          <AuthProvider>
            <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
                marginTop: '70px',
                marginRight: '20px',
                zIndex: 9999,
              },
            }}
          />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="promo" element={<PromoLandingPage />} />
                <Route path="promo/credit-tracker" element={<CreditTrackerLandingPage />} />
                <Route path="promo/homeschool-portfolio" element={<HomeschoolPortfolioPage />} />
                <Route path="promo/teacher-consultation" element={<TeacherConsultationPage />} />
                <Route path="consultation" element={<ConsultationPage />} />
                <Route path="demo" element={<DemoProvider><DemoPage /></DemoProvider>} />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="email-verification" element={<EmailVerificationPage />} />
                <Route path="terms" element={<TermsOfService />} />
                <Route path="privacy" element={<PrivacyPolicy />} />
                <Route path="academy-agreement" element={<OptioAcademyAgreement />} />
                <Route path="academy-handbook" element={<OptioAcademyHandbook />} />
                {/* Public diploma routes */}
                <Route path="portfolio/:slug" element={<DiplomaPage />} />
                <Route path="public/diploma/:userId" element={<DiplomaPage />} />

              <Route element={<PrivateRoute />}>
                <Route path="dashboard" element={<DashboardPage />} />
                {/* Quest Routes */}
                <Route path="quests" element={<QuestBadgeHub />} />
                <Route path="quests/:id" element={<QuestDetail />} />
                {/* Badge Routes */}
                <Route path="badges" element={<QuestBadgeHub />} />
                <Route path="badges/:badgeId" element={<BadgeDetail />} />
                <Route path="badge-progress" element={<BadgeProgressPage />} />
                <Route path="constellation" element={<ConstellationPage />} />
                {/* Credit & Transcript Routes */}
                <Route path="credits" element={<CreditTrackerPage />} />
                <Route path="transcript" element={<TranscriptPage />} />
                {/* Other Routes */}
                <Route path="diploma" element={<DiplomaPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="friends" element={<Navigate to="/connections" replace />} />
                <Route path="connections" element={<ConnectionsPage />} />
                <Route path="communication" element={<CommunicationPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                {/* <Route path="subscription" element={<SubscriptionPage />} /> REMOVED - Phase 3 refactoring (January 2025) */}
              </Route>
              
              <Route element={<PrivateRoute requiredRole="admin" />}>
                <Route path="admin/*" element={<AdminPage />} />
              </Route>

              <Route element={<PrivateRoute requiredRole="advisor" />}>
                <Route path="advisor" element={<AdvisorDashboard />} />
                <Route path="advisor/badges/create" element={<AdvisorBadgeForm />} />
                <Route path="advisor/badges/:badgeId/edit" element={<AdvisorBadgeForm />} />
              </Route>

              <Route element={<PrivateRoute requiredRole="parent" />}>
                <Route path="parent/dashboard" element={<ParentDashboardPage />} />
                <Route path="parent/dashboard/:studentId" element={<ParentDashboardPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
