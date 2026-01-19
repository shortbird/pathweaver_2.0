import React, { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './contexts/AuthContext'
import { AIAccessProvider } from './contexts/AIAccessContext'
import { DemoProvider } from './contexts/DemoContext'
import { OrganizationProvider } from './contexts/OrganizationContext'
import { ActingAsProvider, useActingAs } from './contexts/ActingAsContext'
import ErrorBoundary from './components/ErrorBoundary'
import { warmupBackend } from './utils/retryHelper'
import { tokenStore } from './services/api'
import MasqueradeBanner from './components/admin/MasqueradeBanner'
import ActingAsBanner from './components/parent/ActingAsBanner'
import ConsentBlockedOverlay from './components/consent/ConsentBlockedOverlay'
import { getMasqueradeState, exitMasquerade, restoreMasqueradeToken } from './services/masqueradeService'
import { queryKeys } from './utils/queryKeys'
import logger from './utils/logger'
import api from './services/api'
import { activityTracker } from './services/activityTracker'
import { toast } from 'react-hot-toast'

// Always-loaded components (critical for initial render)
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import OrgLoginPage from './pages/auth/OrgLoginPage'
import RegisterPage from './pages/RegisterPage'
import OrganizationSignup from './pages/auth/OrganizationSignup'
import PrivateRoute from './components/PrivateRoute'

// Lazy-loaded pages for code splitting
// Auth-related pages (less frequently accessed)
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'))
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
const QuestDiscovery = lazy(() => import('./pages/QuestDiscovery'))
// Badge system removed (January 2026 - Microschool client feedback)
const QuestDetail = lazy(() => import('./pages/QuestDetail'))
const TaskLibraryBrowser = lazy(() => import('./pages/TaskLibraryBrowser'))
// Badge Pages removed (January 2026 - Microschool client feedback)
const ConstellationPage = lazy(() => import('./pages/ConstellationPage'))
// Credit & Transcript Pages
const CreditTrackerPage = lazy(() => import('./pages/CreditTrackerPage'))
const TranscriptPage = lazy(() => import('./pages/TranscriptPage'))
// Other Pages
const DiplomaPage = lazy(() => import('./pages/DiplomaPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
// FriendsPage removed - redirects to ConnectionsPage (January 2025)
const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage'))
const CommunicationPage = lazy(() => import('./pages/CommunicationPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
// Admin & Special Pages
const AdminPage = lazy(() => import('./pages/AdminPage'))
const OrganizationManagement = lazy(() => import('./pages/admin/OrganizationManagement'))
const AdvisorDashboard = lazy(() => import('./pages/AdvisorDashboard'))
// AdvisorBadgeForm removed (January 2026 - Microschool client feedback)
const AdvisorCheckinPage = lazy(() => import('./pages/AdvisorCheckinPage'))
const TeacherVerificationPage = lazy(() => import('./pages/TeacherVerificationPage'))
const CollaborationsPage = lazy(() => import('./pages/advisor/CollaborationsPage'))
const ParentDashboardPage = lazy(() => import('./pages/ParentDashboardPage'))
const ParentQuestView = lazy(() => import('./pages/ParentQuestView'))
// Observer Pages (January 2025)
const ObserverAcceptInvitationPage = lazy(() => import('./pages/ObserverAcceptInvitationPage'))
const ObserverWelcomePage = lazy(() => import('./pages/ObserverWelcomePage'))
const ObserverFeedPage = lazy(() => import('./pages/ObserverFeedPage'))
// Parental Consent (COPPA Compliance - December 2025)
const ParentalConsentUploadPage = lazy(() => import('./pages/ParentalConsentUploadPage'))

// LMS Features (December 2025 - Multi-tenant LMS transformation)
const CurriculumBuilder = lazy(() => import('./pages/curriculum/CurriculumBuilder'))
const CurriculumPage = lazy(() => import('./pages/curriculum/CurriculumPage'))
// Course Pages (Course System - December 2025)
const CourseBuilder = lazy(() => import('./pages/courses/CourseBuilder'))
const CourseHomepage = lazy(() => import('./pages/courses/CourseHomepage'))
const CourseCatalog = lazy(() => import('./pages/courses/CourseCatalog'))
const MyInvitations = lazy(() => import('./pages/student/MyInvitations'))
const QuestInvitations = lazy(() => import('./pages/advisor/QuestInvitations'))
const DependentProgressReport = lazy(() => import('./pages/parent/DependentProgressReport'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))
const StudentFeedbackPage = lazy(() => import('./pages/StudentFeedbackPage'))

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

// Inner component that uses banners (must be inside Router and ActingAsProvider)
function AppContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Initialize masquerade state immediately from localStorage for instant banner display
  const [masqueradeState, setMasqueradeState] = useState(() => getMasqueradeState());
  const { actingAsDependent, clearActingAs } = useActingAs();
  const [consentBlockData, setConsentBlockData] = useState(null);

  // Track consecutive status check failures for resilient banner
  const statusCheckFailures = React.useRef(0);
  const MAX_STATUS_CHECK_FAILURES = 3;

  // Check masquerade state on mount and periodically
  useEffect(() => {
    const checkMasquerade = async () => {
      const state = getMasqueradeState();

      // Show banner immediately from localStorage (don't wait for API verification)
      if (state) {
        setMasqueradeState(state);

        // CRITICAL: Restore masquerade token from localStorage backup if needed
        // This ensures the token persists even if IndexedDB fails
        await restoreMasqueradeToken();

        // Verify with backend in the background (don't block the UI)
        const token = tokenStore.getAccessToken();
        if (token) {
          try {
            const response = await api.get('/api/admin/masquerade/status');
            const backendStatus = response.data;

            // Reset failure counter on successful check
            statusCheckFailures.current = 0;

            // If backend says we're not masquerading but localStorage says we are, clear it
            if (!backendStatus.is_masquerading) {
              console.warn('Clearing stale masquerade state from localStorage');
              localStorage.removeItem('masquerade_state');
              localStorage.removeItem('original_admin_token');
              setMasqueradeState(null);
            }
          } catch (error) {
            // RESILIENCE FIX: Don't immediately clear masquerade state on transient errors
            // Only clear after multiple consecutive failures to avoid losing banner on network blips
            statusCheckFailures.current += 1;
            console.warn(`Masquerade status check failed (${statusCheckFailures.current}/${MAX_STATUS_CHECK_FAILURES}):`, error.message);

            if (statusCheckFailures.current >= MAX_STATUS_CHECK_FAILURES) {
              console.error('Too many masquerade status check failures, clearing state');
              localStorage.removeItem('masquerade_state');
              localStorage.removeItem('original_admin_token');
              setMasqueradeState(null);
              statusCheckFailures.current = 0;
            }
            // Otherwise keep the banner visible - user can still use exit button
          }
        }
      } else {
        setMasqueradeState(null);
        statusCheckFailures.current = 0;
      }
    };

    checkMasquerade();

    // Check every 60 seconds to reduce unnecessary polling (optimized from 5s)
    const interval = setInterval(checkMasquerade, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleExitMasquerade = async () => {
    try {
      const result = await exitMasquerade(api);

      if (result.success) {
        setMasqueradeState(null);
        toast.success('Exited masquerade session');
        // Full page load required to reinitialize AuthContext with admin token
        window.location.href = '/admin/users';
      } else {
        toast.error(result.error || 'Failed to exit masquerade');
      }
    } catch (error) {
      console.error('Exit masquerade error:', error);
      toast.error('Failed to exit masquerade session');
    }
  };

  const handleSwitchBackToParent = async () => {
    await clearActingAs();
    // Force page reload to ensure clean state transition
    // This is necessary because we're already on /parent/dashboard
    // and navigate() won't unmount/remount the component
    window.location.href = '/parent/dashboard';
  };

  // Listen for consent-required events from API interceptor (COPPA compliance)
  useEffect(() => {
    const handleConsentRequired = (event) => {
      const { consentStatus, message } = event.detail;
      setConsentBlockData({ consentStatus, message });
    };

    window.addEventListener('consent-required', handleConsentRequired);

    return () => {
      window.removeEventListener('consent-required', handleConsentRequired);
    };
  }, []);

  const handleRetryConsent = () => {
    // Retry by clearing the blocked state and attempting to refresh
    setConsentBlockData(null);
    window.location.reload();
  };

  return (
    <>
      <ScrollToTop />
      {/* Masquerade Banner - Only show fixed version on mobile, sidebar handles desktop */}
      {masqueradeState && (
        <div className="lg:hidden">
          <MasqueradeBanner
            targetUser={masqueradeState.target_user}
            onExit={handleExitMasquerade}
          />
        </div>
      )}
      {/* Acting As Banner - Only show fixed version on mobile, sidebar handles desktop */}
      {actingAsDependent && (
        <div className="lg:hidden">
          <ActingAsBanner
            dependent={actingAsDependent}
            onSwitchBack={handleSwitchBackToParent}
          />
        </div>
      )}
      {consentBlockData && (
        <ConsentBlockedOverlay
          consentStatus={consentBlockData.consentStatus}
          onRetry={handleRetryConsent}
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
    }
  }, []) // Empty deps = runs once on mount

  // Warm up the backend service on app load (helps with Render cold starts)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    warmupBackend(`${apiUrl}/api`);
  }, []);

  // Initialize activity tracking for client-side event capture
  useEffect(() => {
    activityTracker.init()

    return () => {
      activityTracker.destroy()
    }
  }, [])

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {/* Skip Navigation Link - WCAG 2.1 AA Accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[10000] focus:bg-optio-purple focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-optio-pink"
          >
            Skip to main content
          </a>
          <AuthProvider>
            <AIAccessProvider>
            <OrganizationProvider>
            <ActingAsProvider>
            <AppContent />
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
                <Route path="login/:slug" element={<OrgLoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="join/:slug" element={<OrganizationSignup />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="invitation/:code" element={<AcceptInvitationPage />} />
                <Route path="auth/callback" element={<AuthCallback />} />
                <Route path="email-verification" element={<EmailVerificationPage />} />
                <Route path="terms" element={<TermsOfService />} />
                <Route path="privacy" element={<PrivacyPolicy />} />
                <Route path="academy-agreement" element={<OptioAcademyAgreement />} />
                <Route path="academy-handbook" element={<OptioAcademyHandbook />} />
                <Route path="observer/accept/:invitationCode" element={<ObserverAcceptInvitationPage />} />
                <Route path="parental-consent" element={<ParentalConsentUploadPage />} />

              <Route element={<PrivateRoute />}>
                <Route path="dashboard" element={<DashboardPage />} />
                {/* Quest Routes */}
                <Route path="quests" element={<QuestDiscovery />} />
                <Route path="quests/:id" element={<QuestDetail />} />
                <Route path="quests/:id/curriculum" element={<CurriculumPage />} />
                <Route path="quests/:questId/library" element={<TaskLibraryBrowser />} />
                {/* Badge Routes removed (January 2026 - Microschool client feedback) */}
                <Route path="constellation" element={<ConstellationPage />} />
                {/* Course Routes */}
                <Route path="courses" element={<CourseCatalog />} />
                <Route path="courses/:courseId" element={<CourseHomepage />} />
                {/* Credit & Transcript Routes */}
                <Route path="credits" element={<CreditTrackerPage />} />
                <Route path="transcript" element={<TranscriptPage />} />
                {/* Other Routes */}
                <Route path="profile" element={<ProfilePage />} />
                <Route path="friends" element={<Navigate to="/connections" replace />} />
                <Route path="connections" element={<ConnectionsPage />} />
                <Route path="communication" element={<CommunicationPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                {/* LMS Features */}
                <Route path="invitations" element={<MyInvitations />} />
                <Route path="notifications" element={<NotificationsPage />} />
                {/* Observer Feedback */}
                <Route path="feedback" element={<StudentFeedbackPage />} />
                {/* <Route path="subscription" element={<SubscriptionPage />} /> REMOVED - Phase 3 refactoring (January 2025) */}
                {/* Observer feed inside Layout for users with other roles (parent, advisor, etc.) */}
                <Route path="observer/feed" element={<ObserverFeedPage />} />
              </Route>
              
              <Route element={<PrivateRoute requiredRole="superadmin" />}>
                <Route path="admin/*" element={<AdminPage />} />
              </Route>

              {/* Organization Management - accessible to org admins and platform admins */}
              <Route element={<PrivateRoute />}>
                <Route path="organization" element={<OrganizationManagement />} />
              </Route>

              <Route element={<PrivateRoute requiredRole={["advisor", "org_admin", "superadmin"]} />}>
                <Route path="advisor" element={<Navigate to="/advisor/dashboard" replace />} />
                <Route path="advisor/dashboard" element={<AdvisorDashboard />} />
                <Route path="advisor/checkin/:studentId" element={<AdvisorCheckinPage />} />
                <Route path="advisor/verification" element={<TeacherVerificationPage />} />
                <Route path="advisor/collaborations" element={<CollaborationsPage />} />
                {/* Advisor badge routes removed (January 2026 - Microschool client feedback) */}
                {/* LMS Features - Advisor */}
                <Route path="advisor/invitations" element={<QuestInvitations />} />
                <Route path="quests/:questId/curriculum/edit" element={<CurriculumBuilder />} />
                {/* Course Builder */}
                <Route path="courses/:id/edit" element={<CourseBuilder />} />
                <Route path="courses/new" element={<CourseBuilder />} />
              </Route>

              <Route element={<PrivateRoute requiredRole="parent" />}>
                <Route path="parent/dashboard" element={<ParentDashboardPage />} />
                <Route path="parent/dashboard/:studentId" element={<ParentDashboardPage />} />
                <Route path="parent/quest/:studentId/:questId" element={<ParentQuestView />} />
                {/* LMS Features - Parent */}
                <Route path="parent/students/:studentId/report" element={<DependentProgressReport />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* Observer routes - full-screen without main navigation (for observer-role only)
                Users with other roles access /observer/feed via the Layout-wrapped route above */}
            <Route element={<PrivateRoute requiredRole="observer" />}>
              <Route path="observer/welcome" element={<ObserverWelcomePage />} />
              <Route path="observer/feed" element={<ObserverFeedPage />} />
            </Route>

            {/* Full-screen diploma routes (no Layout wrapper) */}
            <Route path="diploma" element={<DiplomaPage />} />
            <Route path="portfolio/:slug" element={<DiplomaPage />} />
            <Route path="public/diploma/:userId" element={<DiplomaPage />} />
          </Routes>
          </Suspense>
            </ActingAsProvider>
            </OrganizationProvider>
            </AIAccessProvider>
        </AuthProvider>
        </Router>
      </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  )
}

export default App
