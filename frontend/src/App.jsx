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
import { getProgramRoutes } from './programs/registry'
import { tokenStore } from './services/api'
import MasqueradeBanner from './components/admin/MasqueradeBanner'
import ActingAsBanner from './components/parent/ActingAsBanner'
import ConsentBlockedOverlay from './components/consent/ConsentBlockedOverlay'
import SessionConflictOverlay from './components/SessionConflictOverlay'
import { getMasqueradeState, exitMasquerade } from './services/masqueradeService'
import { queryKeys } from './utils/queryKeys'
import logger from './utils/logger'
import api from './services/api'
import { activityTracker } from './services/activityTracker'
import InstallPrompt from './components/common/InstallPrompt'
import { initPostHog, captureErrorToast, setMasqueradeSuperProperties, clearMasqueradeSuperProperties } from './services/posthog'
import { toast } from 'react-hot-toast'

// Always-loaded components (critical for initial render)
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import MetaPixelTracker from './components/MetaPixelTracker'
import HomePage from './pages/marketing/HomePage'
import LoginPage from './pages/LoginPage'
import OrgLoginPage from './pages/auth/OrgLoginPage'
import RegisterPage from './pages/RegisterPage'
import OrganizationSignup from './pages/auth/OrganizationSignup'
import PrivateRoute from './components/PrivateRoute'
import RequireParentRegistration from './components/RequireParentRegistration'
import ShowcaseRoute from './components/ShowcaseRoute'
import { getAppSurface, subscribeSurface } from './utils/appSurface'
import SisRoutes from './sis/SisRoutes'
import UpdateAvailableBanner from './components/UpdateAvailableBanner'

// Lazy-loaded pages for code splitting
// Auth-related pages (less frequently accessed)
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'))
const ICreateRegisterPage = lazy(() => import('./pages/ICreateRegisterPage'))
const DemoPage = lazy(() => import('./pages/DemoPage'))
const EmailVerificationPage = lazy(() => import('./pages/EmailVerificationPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LearningJournalPage = lazy(() => import('./pages/LearningJournalPage'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const SupportPage = lazy(() => import('./pages/SupportPage'))
const OptioAcademyAgreement = lazy(() => import('./pages/OptioAcademyAgreement'))
const OptioAcademyHandbook = lazy(() => import('./pages/OptioAcademyHandbook'))
// Quest Pages
const QuestDiscovery = lazy(() => import('./pages/QuestDiscovery'))
const QuestDetail = lazy(() => import('./pages/QuestDetail'))
const TaskLibraryBrowser = lazy(() => import('./pages/TaskLibraryBrowser'))
// Program pages (Hearthwood Academy, Treehouse, Gryffin, POE) are lazy-loaded and
// routed via the program registry — see src/programs/registry.jsx.
// Credit & Transcript Pages
const CreditTrackerPage = lazy(() => import('./pages/CreditTrackerPage'))
const TranscriptPage = lazy(() => import('./pages/TranscriptPage'))
// Other Pages
const DiplomaPage = lazy(() => import('./pages/DiplomaPage'))
const StudentOverviewPage = lazy(() => import('./pages/StudentOverviewPage'))
const CommunicationPage = lazy(() => import('./pages/CommunicationPage'))
// Admin & Special Pages
const AdminPage = lazy(() => import('./pages/AdminPage'))
const ShowcasePage = lazy(() => import('./pages/ShowcasePage'))
const MobileDemoPage = lazy(() => import('./pages/MobileDemoPage'))
const OrganizationManagement = lazy(() => import('./pages/admin/OrganizationManagement'))
const PartnerEnrollStudentPage = lazy(() => import('./pages/PartnerEnrollStudentPage'))
const OnFireDashboard = lazy(() => import('./pages/OnFireDashboard'))
const OrgStudentOverviewPage = lazy(() => import('./pages/admin/OrgStudentOverviewPage'))
const AdvisorDashboard = lazy(() => import('./pages/AdvisorDashboard'))
const AdvisorClassesPage = lazy(() => import('./pages/AdvisorClassesPage'))
const AdvisorCheckinPage = lazy(() => import('./pages/AdvisorCheckinPage'))
const TeacherVerificationPage = lazy(() => import('./pages/TeacherVerificationPage'))
const ParentDashboardPage = lazy(() => import('./pages/ParentDashboardPage'))
const ParentQuestView = lazy(() => import('./pages/ParentQuestView'))
// Observer Pages (January 2025)
const ObserverAcceptInvitationPage = lazy(() => import('./pages/ObserverAcceptInvitationPage'))
const ObserverWelcomePage = lazy(() => import('./pages/ObserverWelcomePage'))
const ObserverFeedPage = lazy(() => import('./pages/ObserverFeedPage'))
const ObserverStudentOverviewPage = lazy(() => import('./pages/ObserverStudentOverviewPage'))
// Parental Consent (COPPA Compliance - December 2025)
const ParentalConsentUploadPage = lazy(() => import('./pages/ParentalConsentUploadPage'))

// LMS Features (December 2025 - Multi-tenant LMS transformation)
const CurriculumBuilder = lazy(() => import('./pages/curriculum/CurriculumBuilder'))
const CurriculumPage = lazy(() => import('./pages/curriculum/CurriculumPage'))
// Course Pages (Course System - December 2025)
const CourseBuilder = lazy(() => import('./pages/courses/CourseBuilder'))
const CourseHomepage = lazy(() => import('./pages/courses/CourseHomepage'))
const CourseCatalog = lazy(() => import('./pages/courses/CourseCatalog'))
const PublicCoursePage = lazy(() => import('./pages/courses/PublicCoursePage'))
const PublicCatalogPage = lazy(() => import('./pages/courses/PublicCatalogPage'))
// Student-curated classes (April 2026)
const StudentClassForm = lazy(() => import('./pages/classes/StudentClassForm'))
const MyClasses = lazy(() => import('./pages/classes/MyClasses'))
const ScheduleBuilderPage = lazy(() => import('./pages/ScheduleBuilderPage'))
const ScheduleEmbedPage = lazy(() => import('./pages/ScheduleEmbedPage'))
const AbsenceReportingPage = lazy(() => import('./pages/AbsenceReportingPage'))
const FamilyResourcesPage = lazy(() => import('./pages/FamilyResourcesPage'))
const FamilyDirectoryPage = lazy(() => import('./pages/FamilyDirectoryPage'))
const PublicClassPage = lazy(() => import('./pages/classes/PublicClassPage'))
// Marketing pages
const HowItWorksPage = lazy(() => import('./pages/marketing/HowItWorksPage'))
const ClassesPage = lazy(() => import('./pages/marketing/ClassesPage'))
const ForFamiliesPage = lazy(() => import('./pages/marketing/ForFamiliesPage'))
const AcademyPage = lazy(() => import('./pages/marketing/AcademyPage'))
const ForSchoolsPage = lazy(() => import('./pages/marketing/ForSchoolsPage'))
const PhilosophyPage = lazy(() => import('./pages/marketing/PhilosophyPage'))
// Help Center / Docs pages (February 2026)
const DocsLandingPage = lazy(() => import('./pages/docs/DocsLandingPage'))
const DocsCategoryPage = lazy(() => import('./pages/docs/DocsCategoryPage'))
const DocsArticlePage = lazy(() => import('./pages/docs/DocsArticlePage'))
const CoursePlanMode = lazy(() => import('./pages/admin/CoursePlanMode'))
const MyInvitations = lazy(() => import('./pages/student/MyInvitations'))
const QuestInvitations = lazy(() => import('./pages/advisor/QuestInvitations'))
const DependentProgressReport = lazy(() => import('./pages/parent/DependentProgressReport'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))
const StudentFeedbackPage = lazy(() => import('./pages/StudentFeedbackPage'))
// Evidence Reports (February 2026 - Shareable evidence reports with PDF download)
const MyEvidenceReports = lazy(() => import('./pages/MyEvidenceReports'))
const EvidenceReportBuilder = lazy(() => import('./pages/EvidenceReportBuilder'))
const PublicEvidenceReport = lazy(() => import('./pages/PublicEvidenceReport'))
const PublicTranscriptPage = lazy(() => import('./pages/PublicTranscriptPage'))
const SharedFeedPostPage = lazy(() => import('./pages/SharedFeedPostPage'))
// Credit Review Dashboard (March 2026 - Unified credit review for org admins + superadmin)
const CreditReviewDashboardPage = lazy(() => import('./pages/CreditReviewDashboardPage'))
// Bounty Board (March 2026 - Integrated from mobile app plan)
const BountyBoardPage = lazy(() => import('./pages/BountyBoardPage'))
const BountyDetailPage = lazy(() => import('./pages/BountyDetailPage'))
const BountyCreatePage = lazy(() => import('./pages/BountyCreatePage'))
// Canvas LTI iframe pages (April 2026) — no Layout, no sidebar; for Canvas embed only
const LtiLaunchPage = lazy(() => import('./pages/lti/LtiLaunchPage'))
const LtiDeepLinkPage = lazy(() => import('./pages/lti/LtiDeepLinkPage'))
const LtiQuestPage = lazy(() => import('./pages/lti/LtiQuestPage'))
const LtiErrorPage = lazy(() => import('./pages/lti/LtiErrorPage'))
const LtiEvidencePage = lazy(() => import('./pages/lti/LtiEvidencePage'))

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
  // C2: backend /status is the source of truth. Don't trust localStorage cache —
  // after C2 the masquerade JWT can't survive page reload, so any persisted
  // `masquerade_state` may be stale. Banner appears only after backend confirms.
  const [masqueradeState, setMasqueradeState] = useState(null);
  const { actingAsDependent, clearActingAs } = useActingAs();
  const [consentBlockData, setConsentBlockData] = useState(null);

  // Track consecutive status check failures for resilient banner
  const statusCheckFailures = React.useRef(0);
  const MAX_STATUS_CHECK_FAILURES = 3;

  // Check masquerade state on mount and periodically
  useEffect(() => {
    const checkMasquerade = async () => {
      try {
        const response = await api.get('/api/admin/masquerade/status');
        const backendStatus = response.data;

        statusCheckFailures.current = 0;

        if (backendStatus.is_masquerading) {
          // Hydrate UI state from backend; keep localStorage in sync for the
          // few places that still read it (exit handler, sidebar label).
          const next = {
            is_masquerading: true,
            admin_id: backendStatus.admin_id || null,
            target_user: backendStatus.target_user,
            log_id: backendStatus.log_id || null,
            started_at: getMasqueradeState()?.started_at || new Date().toISOString()
          };
          localStorage.setItem('masquerade_state', JSON.stringify(next));
          setMasqueradeState(next);
          // Flag every subsequent PostHog event so admin masquerade activity
          // can be filtered out of real-user analytics.
          setMasqueradeSuperProperties({
            adminId: backendStatus.admin_id || null,
            targetUserId: backendStatus.target_user?.id || null,
          });
        } else {
          // Not masquerading server-side — purge any stale local cache.
          if (getMasqueradeState()) {
            localStorage.removeItem('masquerade_state');
          }
          setMasqueradeState(null);
          clearMasqueradeSuperProperties();
        }
      } catch (error) {
        // 401/network blip: don't flap the banner. After repeated failures, clear.
        statusCheckFailures.current += 1;
        if (statusCheckFailures.current >= MAX_STATUS_CHECK_FAILURES) {
          localStorage.removeItem('masquerade_state');
          setMasqueradeState(null);
          statusCheckFailures.current = 0;
        }
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
      <MetaPixelTracker />
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
      <SessionConflictOverlay />
    </>
  );
}

/**
 * Renders the active surface's route tree and swaps it reactively when the user
 * toggles between the Learning app and the SIS console. Because the swap is a
 * client-side route change (not window.location), the AuthProvider above stays
 * mounted and the session is preserved — no re-login on toggle. Must live inside
 * <Router> so it can use useNavigate.
 */
function SurfaceRoutes({ renderLearning }) {
  const [surface, setSurface] = useState(() => getAppSurface());
  const navigate = useNavigate();
  useEffect(() => subscribeSurface((target, path) => {
    setSurface(target);
    navigate(path || '/');
  }), [navigate]);
  return surface === 'sis' ? <SisRoutes /> : renderLearning();
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

  // Initialize PostHog session replay (no-ops if VITE_POSTHOG_KEY is not set)
  // Patch toast.error so every error toast is auto-tracked in PostHog
  useEffect(() => {
    initPostHog()

    const originalToastError = toast.error
    toast.error = (...args) => {
      captureErrorToast(args[0])
      return originalToastError(...args)
    }

    return () => {
      toast.error = originalToastError
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
            <InstallPrompt />
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
          <UpdateAvailableBanner />
          <Suspense fallback={<PageLoader />}>
            {/* Surface (Learning vs SIS console) is reactive so the toggle swaps
                route trees in place — no full reload, so the auth session is never
                re-initialized. SIS console shares the providers + session above. */}
            <SurfaceRoutes renderLearning={() => (
            <Routes>
              {/* Marketing pages (standalone, use MarketingLayout) */}
              <Route path="/" element={<HomePage />} />
              <Route path="classes" element={<ClassesPage />} />
              {/* /for-students is the legacy URL for the same offering; preserve external links by redirecting. */}
              <Route path="for-students" element={<Navigate to="/classes" replace />} />
              <Route path="for-families" element={<ForFamiliesPage />} />
              <Route path="academy" element={<AcademyPage />} />
              <Route path="for-schools" element={<ForSchoolsPage />} />
              <Route path="how-it-works" element={<HowItWorksPage />} />
              <Route path="philosophy" element={<PhilosophyPage />} />
              {/* Program public/marketing routes (e.g. POE) — see src/programs/registry.jsx */}
              {getProgramRoutes('public')}

              {/* Canvas LTI iframe routes (no Layout, no auth chrome). The
                  AuthContext skips session checks on these paths so the
                  one-time-code → Bearer-token handoff isn't fought by /me.
                  All routes use a `lti-` prefix (hyphen) so they don't
                  collide with the Vite `/lti` proxy that forwards LTI
                  protocol endpoints (login, launch, token, jwks, deep-link
                  submit/context) to the backend. */}
              <Route path="lti-launch" element={<LtiLaunchPage />} />
              <Route path="lti-deep-link" element={<LtiDeepLinkPage />} />
              <Route path="lti-quest/:id" element={<LtiQuestPage />} />
              <Route path="lti-evidence" element={<LtiEvidencePage />} />
              <Route path="lti-error" element={<LtiErrorPage />} />

              <Route path="/" element={<Layout />}>
                <Route path="demo" element={<DemoProvider><DemoPage /></DemoProvider>} />
                <Route path="login" element={<LoginPage />} />
                <Route path="login/:slug" element={<OrgLoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="join/:slug" element={<OrganizationSignup />} />
                <Route path="forgot-password" element={<ForgotPasswordPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="auth/callback" element={<AuthCallback />} />
                <Route path="email-verification" element={<EmailVerificationPage />} />
                <Route path="terms" element={<TermsOfService />} />
                <Route path="privacy" element={<PrivacyPolicy />} />
                <Route path="support" element={<SupportPage />} />
                <Route path="academy-agreement" element={<OptioAcademyAgreement />} />
                <Route path="academy-handbook" element={<OptioAcademyHandbook />} />
                <Route path="parental-consent" element={<ParentalConsentUploadPage />} />
                {/* Public course pages (no auth required) */}
                <Route path="catalog" element={<PublicCatalogPage />} />
                <Route path="course/:slug" element={<PublicCoursePage />} />
                <Route path="class/:slug" element={<PublicClassPage />} />
                {/* Docs routes moved outside Layout for standalone full-screen experience */}

              <Route element={<PrivateRoute />}>
                {/* Student-only surfaces: parents/observers are bounced to their
                    own home. Students, advisors, org_admins, superadmin unaffected. */}
                <Route element={<PrivateRoute blockRoles={['parent', 'observer']} />}>
                  <Route path="dashboard" element={<DashboardPage />} />
                  {/* Quest Routes */}
                  <Route path="quests" element={<QuestDiscovery />} />
                  <Route path="quests/:id" element={<QuestDetail />} />
                  <Route path="quests/:id/curriculum" element={<CurriculumPage />} />
                  <Route path="quests/:questId/library" element={<TaskLibraryBrowser />} />
                </Route>
                {/* Course Routes */}
                <Route path="courses" element={<CourseCatalog />} />
                <Route path="courses/:courseId" element={<CourseHomepage />} />
                {/* Course Builder - backend enforces creator/superadmin permissions */}
                <Route path="courses/:id/edit" element={<CourseBuilder />} />
                <Route path="courses/new" element={<CourseBuilder />} />
                {/* Student-curated classes (admin surfaces live under /admin/classes/* inside AdminPage) */}
                <Route path="my-classes" element={<MyClasses />} />
                {/* Parent/guardian self-service: register your own children for SIS
                    classes. Gated behind completing the iCreate registration + fee —
                    including parent+teacher staff, whose teacher surfaces stay open. */}
                <Route element={<RequireParentRegistration />}>
                  <Route path="schedule-builder" element={<ScheduleBuilderPage />} />
                  {/* old bookmarks: Class Registration became the Schedule Builder */}
                  <Route path="class-registration" element={<Navigate to="/schedule-builder" replace />} />
                </Route>
                {/* Parent/guardian self-service: report a child's planned absences */}
                <Route path="absences" element={<AbsenceReportingPage />} />
                {/* School document library + opt-in family directory (SIS orgs) */}
                <Route path="resources" element={<FamilyResourcesPage />} />
                <Route path="family-directory" element={<FamilyDirectoryPage />} />
                <Route path="classes/new" element={<StudentClassForm />} />
                <Route path="classes/:id/edit" element={<StudentClassForm />} />
                {/* Credit & Transcript Routes */}
                <Route path="credits" element={<CreditTrackerPage />} />
                <Route path="transcript" element={<TranscriptPage />} />
                {/* Student Overview - Unified page combining profile, diploma, and constellation.
                    Blocked for parents/observers: it renders the viewer's OWN (empty) student
                    portfolio, which reads as "the app thinks I'm a student". Parents see their
                    child's overview inside /parent/dashboard instead. */}
                <Route element={<PrivateRoute blockRoles={['parent', 'observer']} />}>
                  <Route path="overview" element={<StudentOverviewPage />} />
                </Route>
                {/* Legacy routes - redirect to overview with hash anchors */}
                <Route path="profile" element={<Navigate to="/overview" replace />} />
                <Route path="friends" element={<Navigate to="/dashboard" replace />} />
                <Route path="connections" element={<Navigate to="/dashboard" replace />} />
                <Route path="messages" element={<CommunicationPage />} />
                {/* Old /communication URL retired — redirect to /messages. */}
                <Route path="communication" element={<Navigate to="/messages" replace />} />
                {/* Personal student journal — parents use the child journal at
                    /parent/child/:childId/journal instead. */}
                <Route element={<PrivateRoute blockRoles={['parent', 'observer']} />}>
                  <Route path="learning-journal" element={<LearningJournalPage />} />
                </Route>
                {/* LMS Features */}
                <Route path="invitations" element={<MyInvitations />} />
                <Route path="notifications" element={<NotificationsPage />} />
                {/* Observer Feedback */}
                <Route path="feedback" element={<StudentFeedbackPage />} />
                {/* Observer pages */}
                <Route path="observer/feed" element={<ObserverFeedPage />} />
                <Route path="observer/welcome" element={<ObserverWelcomePage />} />
                <Route path="observer/student/:studentId" element={<ObserverStudentOverviewPage />} />
                {/* Evidence Reports - shareable evidence with PDF download (February 2026) */}
                <Route path="evidence-reports" element={<MyEvidenceReports />} />
                <Route path="evidence-reports/new" element={<EvidenceReportBuilder />} />
                <Route path="evidence-reports/:id/edit" element={<EvidenceReportBuilder />} />
                {/* Bounty Board (March 2026) */}
                <Route path="bounties" element={<BountyBoardPage />} />
                <Route path="bounties/create" element={<BountyCreatePage />} />
                <Route path="bounties/:bountyId/edit" element={<BountyCreatePage />} />
                <Route path="bounties/:bountyId" element={<BountyDetailPage />} />
                {/* Program in-app routes (Hearthwood Academy, Treehouse, Gryffin),
                    gated in the sidebar by org slug / program_key; pages branch by
                    role and writes are enforced server-side. See programs/registry.jsx. */}
                {getProgramRoutes('app')}
              </Route>
              
              <Route element={<PrivateRoute requiredRole="superadmin" />}>
                <Route path="admin/*" element={<AdminPage />} />
                <Route path="course-plan" element={<CoursePlanMode />} />
                <Route path="course-plan/:sessionId" element={<CoursePlanMode />} />
              </Route>

              {/* Marketing showcase: superadmin or users.can_view_showcase=true */}
              <Route element={<ShowcaseRoute />}>
                <Route path="showcase" element={<ShowcasePage />} />
              </Route>

              {/* Organization Management - accessible to org admins and platform admins */}
              <Route element={<PrivateRoute />}>
                <Route path="organization" element={<OrganizationManagement />} />
              </Route>

              {/* Partner course-purchase registration form - org admins + superadmin */}
              <Route element={<PrivateRoute requiredRole={["org_admin", "superadmin"]} />}>
                <Route path="enroll-students" element={<PartnerEnrollStudentPage />} />
                {/* OnFire Learning simplified dashboard (enrollments + register tabs) */}
                <Route path="onfire" element={<OnFireDashboard />} />
              </Route>

              {/* Org Student Overview - accessible to org admins and advisors */}
              <Route element={<PrivateRoute requiredRole={["advisor", "org_admin", "superadmin"]} />}>
                <Route path="admin/organizations/:orgId/student/:studentId" element={<OrgStudentOverviewPage />} />
              </Route>

              {/* Organization Classes - accessible to students (enrolled), advisors, org_admins, superadmin.
                  Routed at /org-classes so the public marketing /classes page can own the simpler URL. */}
              <Route element={<PrivateRoute requiredRole={["student", "advisor", "org_admin", "superadmin"]} />}>
                <Route path="org-classes" element={<AdvisorClassesPage />} />
                <Route path="org-classes/:classId" element={<AdvisorClassesPage />} />
              </Route>

              <Route element={<PrivateRoute requiredRole={["advisor", "org_admin", "superadmin"]} />}>
                <Route path="advisor" element={<Navigate to="/advisor/dashboard" replace />} />
                <Route path="advisor/dashboard" element={<AdvisorDashboard />} />
                <Route path="advisor/checkin/:studentId" element={<AdvisorCheckinPage />} />
                <Route path="advisor/verification" element={<TeacherVerificationPage />} />
                {/* LMS Features - Advisor */}
                <Route path="advisor/invitations" element={<QuestInvitations />} />
                <Route path="quests/:questId/curriculum/edit" element={<CurriculumBuilder />} />
              </Route>

              {/* Credit Review Dashboard - superadmin, org_admin */}
              <Route element={<PrivateRoute requiredRole={["superadmin", "org_admin"]} />}>
                <Route path="credit-dashboard" element={<CreditReviewDashboardPage />} />
              </Route>

              <Route element={<PrivateRoute requiredRole="parent" />}>
                <Route path="parent/dashboard" element={<ParentDashboardPage />} />
                <Route path="parent/dashboard/:studentId" element={<ParentDashboardPage />} />
                <Route path="parent/quest/:studentId/:questId" element={<ParentQuestView />} />
                <Route path="parent/child/:childId/journal" element={<LearningJournalPage />} />
                {/* LMS Features - Parent */}
                <Route path="parent/students/:studentId/report" element={<DependentProgressReport />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* Help Center / Docs (public, no auth, standalone layout) */}
            <Route path="docs" element={<DocsLandingPage />} />
            <Route path="docs/:categorySlug" element={<DocsCategoryPage />} />
            <Route path="docs/:categorySlug/:articleSlug" element={<DocsArticlePage />} />

            {/* Full-screen diploma routes (no Layout wrapper) */}
            {/* /diploma retired — the overview page is the student's diploma/portfolio now. */}
            <Route path="diploma" element={<Navigate to="/overview" replace />} />
            <Route path="portfolio/:slug" element={<DiplomaPage />} />
            <Route path="public/diploma/:userId" element={<DiplomaPage />} />
            <Route path="public/transcript/:userId" element={<PublicTranscriptPage />} />

            {/* Program standalone routes (no app Layout), e.g. the Treehouse
                kiosk — see src/programs/registry.jsx */}
            {getProgramRoutes('standalone')}

            {/* Public evidence report view (no auth required) */}
            <Route path="report/:token" element={<PublicEvidenceReport />} />

            {/* Public shared feed post view (no auth required) */}
            <Route path="shared/feed/:token" element={<SharedFeedPostPage />} />

            {/* Invitation pages - standalone full-screen layouts */}
            <Route path="invitation/:code" element={<AcceptInvitationPage />} />
            {/* iCreate branded parent registration funnel (AcceptInvitationPage
                redirects iCreate parent links here; other orgs are unaffected).
                /resume is the logged-in continuation for unfinished registrations
                (PrivateRoute forces iCreate parents here until they complete it). */}
            <Route path="register/icreate/resume" element={<ICreateRegisterPage />} />
            <Route path="register/icreate/:code" element={<ICreateRegisterPage />} />
            {/* Staff walkthrough of the parent Schedule Builder (nothing saved),
                reached from the registration funnel preview's final step. */}
            <Route path="schedule-builder/preview/:previewCode" element={<ScheduleBuilderPage />} />
            {/* Embeddable read-only weekly class schedule for the school's own
                website (iframe snippet in SIS Registration settings). */}
            <Route path="schedule-embed/:previewCode" element={<ScheduleEmbedPage />} />
            <Route path="observer/accept/:invitationCode" element={<ObserverAcceptInvitationPage />} />

            {/* Mobile demo - superadmin only, full-screen iframe */}
            <Route element={<PrivateRoute requiredRole="superadmin" />}>
              <Route path="mobile" element={<MobileDemoPage />} />
            </Route>
          </Routes>
            )} />
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
