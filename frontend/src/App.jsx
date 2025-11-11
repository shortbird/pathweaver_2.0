import React, { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './contexts/AuthContext'
import { DemoProvider } from './contexts/DemoContext'
import ErrorBoundary from './components/ErrorBoundary'
import { warmupBackend } from './utils/retryHelper'
import { tokenStore } from './services/api'
import { useActivityTracking } from './hooks/useActivityTracking'
import MasqueradeBanner from './components/admin/MasqueradeBanner'
import { getMasqueradeState, exitMasquerade } from './services/masqueradeService'
import api from './services/api'
import toast from 'react-hot-toast'

// Always-loaded components (Layout, Auth, Landing pages)
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import AuthCallback from './pages/AuthCallback'
import PrivateRoute from './components/PrivateRoute'

// Lazy-loaded pages for code splitting
const PromoLandingPage = lazy(() => import('./pages/PromoLandingPage'))
const ConsultationPage = lazy(() => import('./pages/ConsultationPage'))
const CreditTrackerLandingPage = lazy(() => import('./pages/CreditTrackerLandingPage'))
const HomeschoolPortfolioPage = lazy(() => import('./pages/HomeschoolPortfolioPage'))
const TeacherConsultationPage = lazy(() => import('./pages/TeacherConsultationPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
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
const AdvisorCheckinPage = lazy(() => import('./pages/AdvisorCheckinPage'))
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

// Inner component that uses activity tracking and masquerade banner (must be inside Router)
function AppContent() {
  const navigate = useNavigate();
  const [masqueradeState, setMasqueradeState] = useState(null);

  // Initialize activity tracking
  useActivityTracking();

  // Check masquerade state on mount and periodically
  useEffect(() => {
    const checkMasquerade = () => {
      const state = getMasqueradeState();
      setMasqueradeState(state);
    };

    checkMasquerade();

    // Check every 5 seconds in case state changes
    const interval = setInterval(checkMasquerade, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleExitMasquerade = async () => {
    try {
      const result = await exitMasquerade(api);

      if (result.success) {
        setMasqueradeState(null);
        toast.success('Exited masquerade session');
        // Redirect to admin users page
        navigate('/admin/users');
        window.location.reload(); // Force reload to apply admin token
      } else {
        toast.error(result.error || 'Failed to exit masquerade');
      }
    } catch (error) {
      console.error('Exit masquerade error:', error);
      toast.error('Failed to exit masquerade session');
    }
  };

  return (
    <>
      <ScrollToTop />
      {masqueradeState && (
        <MasqueradeBanner
          targetUser={masqueradeState.target_user}
          onExit={handleExitMasquerade}
        />
      )}
    </>
  );
}

function App() {
  // ✅ SSO TOKEN EXTRACTION: Extract tokens IMMEDIATELY on app load (before AuthContext)
  // This runs synchronously during App mount to ensure tokens are available for AuthContext
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      // Store tokens immediately in memory
      tokenStore.setTokens(accessToken, refreshToken)

      // Clean URL (remove tokens from address bar for security)
      const newUrl = window.location.pathname + (params.get('lti') ? '?lti=true' : '')
      window.history.replaceState({}, '', newUrl)

      console.log('[SSO] Tokens extracted and stored from URL')
    }
  }, []) // Empty deps = runs once on mount

  // Warm up the backend service on app load (helps with Render cold starts)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    warmupBackend(`${apiUrl}/api`);
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <Router>
          <AppContent />
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
                <Route path="services" element={<ServicesPage />} />
                <Route path="demo" element={<DemoProvider><DemoPage /></DemoProvider>} />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="auth/callback" element={<AuthCallback />} />
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

              <Route element={<PrivateRoute requiredRole={["advisor", "admin"]} />}>
                <Route path="advisor" element={<Navigate to="/advisor/dashboard" replace />} />
                <Route path="advisor/dashboard" element={<AdvisorDashboard />} />
                <Route path="advisor/checkin/:studentId" element={<AdvisorCheckinPage />} />
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
      </HelmetProvider>
    </ErrorBoundary>
  )
}

export default App
