import React, { lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import SisLayout from '../components/sis/SisLayout'
import { goToLearningSurface } from '../utils/appSurface'
import { isPathHidden, isCommunityEnabled } from '../pages/sis/sisModules'
import { useSisOrg } from '../pages/sis/useSisOrg'
import { canSeeFinance, canSeeHr } from '../pages/sis/sisRole'
import { useAuth } from '../contexts/AuthContext'

// Guards a route whose module the active org has hidden (feature_flags.
// sis_settings.hidden_modules). A hidden module bounces to the SIS dashboard so
// a stale bookmark or typed URL can't reach a surface the org opted out of.
// Follows the active org, so a superadmin viewing that org is bounced too —
// mirroring exactly what the org's admin can reach. `path` is the leading-slash
// nav path (e.g. '/clp').
const ModuleRoute = ({ path, children }) => {
  const { activeOrg } = useSisOrg()
  if (isPathHidden(path, activeOrg)) return <Navigate to="/" replace />
  return children
}

// Community Hub is opt-in — bounce to the dashboard for any org that hasn't
// enabled it (feature_flags.sis_settings.community_enabled), so a typed URL or
// stale bookmark can't reach a section the org hasn't turned on.
const CommunityRoute = ({ children }) => {
  const { activeOrg } = useSisOrg()
  if (!isCommunityEnabled(activeOrg)) return <Navigate to="/" replace />
  return children
}

// The money pages. A campus coordinator runs the console but not the finances
// (iCreate, 2026-08-01), so a typed URL or a bookmark from when they were an
// admin bounces to the dashboard rather than rendering a page whose every API
// call will 403. The backend's FINANCE_ROLES is the real gate; this is chrome.
const FinanceRoute = ({ children }) => {
  const { user } = useAuth()
  if (!canSeeFinance(user)) return <Navigate to="/" replace />
  return children
}

// The HR store — contracts, background checks. Same chrome-guard idea as
// FinanceRoute; the backend's HR_ROLES is the real gate.
const HrRoute = ({ children }) => {
  const { user } = useAuth()
  if (!canSeeHr(user)) return <Navigate to="/" replace />
  return children
}

// Family-facing links (registration invitations) belong on the Learning app.
// If one is opened on the SIS host anyway — e.g. an old link copied before the
// www fix — bounce it to the same path on the learning surface instead of
// dead-ending on the staff login.
const LearningRedirect = () => {
  const location = useLocation()
  useEffect(() => { goToLearningSurface(location.pathname + location.search) }, [location])
  return null
}

// New SIS console pages
const SisDashboard = lazy(() => import('../pages/sis/SisDashboard'))
const PeoplePage = lazy(() => import('../pages/sis/PeoplePage'))
const ClassesPage = lazy(() => import('../pages/sis/ClassesPage'))
const ClpPage = lazy(() => import('../pages/sis/ClpPage'))
const BillingPage = lazy(() => import('../pages/sis/BillingPage'))
const TuitionApprovalPage = lazy(() => import('../pages/sis/TuitionApprovalPage'))
const AttendancePage = lazy(() => import('../pages/sis/AttendancePage'))
const FamilyMessagingPage = lazy(() => import('../pages/sis/FamilyMessagingPage'))
const RegistrationPage = lazy(() => import('../pages/sis/RegistrationPage'))
const CalendarPage = lazy(() => import('../pages/sis/CalendarPage'))
const ResourcesPage = lazy(() => import('../pages/sis/ResourcesPage'))
const CommunityPage = lazy(() => import('../pages/sis/CommunityPage'))
const SettingsPage = lazy(() => import('../pages/sis/SettingsPage'))
const GoalsReviewPage = lazy(() => import('../pages/sis/GoalsReviewPage'))
const SubmissionsPage = lazy(() => import('../pages/sis/SubmissionsPage'))
const ReportsPage = lazy(() => import('../pages/sis/ReportsPage'))
const SecureDocumentsPage = lazy(() => import('../pages/sis/SecureDocumentsPage'))
const CurriculumPage = lazy(() => import('../pages/sis/CurriculumPage'))
const StaffTrainingPage = lazy(() => import('../pages/sis/StaffTrainingPage'))

// Teacher portal pages (advisors; admins can open them too)
const MyClassesPage = lazy(() => import('../pages/sis/MyClassesPage'))
const TeacherClassPage = lazy(() => import('../pages/sis/TeacherClassPage'))
const MySchedulePage = lazy(() => import('../pages/sis/MySchedulePage'))
const MyProfilePage = lazy(() => import('../pages/sis/MyProfilePage'))
const DirectoryPage = lazy(() => import('../pages/sis/DirectoryPage'))
const StaffFormsPage = lazy(() => import('../pages/sis/StaffFormsPage'))
const OnboardingPage = lazy(() => import('../pages/sis/OnboardingPage'))
const MyDocumentsPage = lazy(() => import('../pages/sis/MyDocumentsPage'))
const MyTimePage = lazy(() => import('../pages/sis/MyTimePage'))
const TimesheetsPage = lazy(() => import('../pages/sis/TimesheetsPage'))

// Carved-out admin surfaces — re-registered at their ORIGINAL paths so the moved
// components' internal links keep working on the SIS host. Same lazy chunks as the
// web platform (Vite dedupes); the files are not physically moved (low-risk MVP).
// NOTE: the org-management page was retired from the SIS — its functionality now
// lives natively in Settings, Users, Staff, Families, Classes, and Messaging. The
// page still exists on the web platform (App.jsx /organization) for platform-only
// tabs (Quests, Bounties, Credit Review, credit-classes).
const AdvisorCheckinPage = lazy(() => import('../pages/AdvisorCheckinPage'))
const TeacherVerificationPage = lazy(() => import('../pages/TeacherVerificationPage'))
const PartnerEnrollStudentPage = lazy(() => import('../pages/PartnerEnrollStudentPage'))
const OnFireDashboard = lazy(() => import('../pages/OnFireDashboard'))
const OrgStudentOverviewPage = lazy(() => import('../pages/admin/OrgStudentOverviewPage'))
const AdminPage = lazy(() => import('../pages/AdminPage'))

/**
 * Route tree for the SIS console (sis.optioeducation.com / ?app=sis).
 * SisLayout gates access to staff and provides the SIS chrome. Auth, org, and
 * acting-as providers are already mounted by App.jsx, shared across both surfaces.
 */
const SisRoutes = () => (
  <Routes>
    {/* Family-facing paths escape the staff console entirely */}
    <Route path="invitation/:code" element={<LearningRedirect />} />
    <Route path="register/icreate/*" element={<LearningRedirect />} />
    <Route path="enroll/*" element={<LearningRedirect />} />
    <Route element={<SisLayout />}>
      <Route index element={<SisDashboard />} />
      <Route path="people" element={<PeoplePage />} />
      {/* Old People routes now open the matching lens of the unified People page. */}
      <Route path="users" element={<Navigate to="/people" replace />} />
      <Route path="roster" element={<Navigate to="/people" replace />} />
      <Route path="staff" element={<Navigate to="/people?tab=staff" replace />} />
      <Route path="households" element={<Navigate to="/people?tab=families" replace />} />
      <Route path="classes" element={<ModuleRoute path="/classes"><ClassesPage /></ModuleRoute>} />
      <Route path="clp" element={<ModuleRoute path="/clp"><ClpPage /></ModuleRoute>} />
      <Route path="billing" element={<FinanceRoute><ModuleRoute path="/billing"><BillingPage /></ModuleRoute></FinanceRoute>} />
      <Route path="tuition" element={<FinanceRoute><ModuleRoute path="/tuition"><TuitionApprovalPage /></ModuleRoute></FinanceRoute>} />
      <Route path="attendance" element={<ModuleRoute path="/attendance"><AttendancePage /></ModuleRoute>} />
      <Route path="goals" element={<GoalsReviewPage />} />
      <Route path="submissions" element={<SubmissionsPage />} />
      <Route path="reports" element={<ModuleRoute path="/reports"><ReportsPage /></ModuleRoute>} />
      <Route path="secure-documents" element={<HrRoute><ModuleRoute path="/secure-documents"><SecureDocumentsPage /></ModuleRoute></HrRoute>} />
      <Route path="messaging" element={<FamilyMessagingPage />} />
      <Route path="registration" element={<RegistrationPage />} />
      <Route path="calendar" element={<ModuleRoute path="/calendar"><CalendarPage /></ModuleRoute>} />
      <Route path="resources" element={<ModuleRoute path="/resources"><ResourcesPage /></ModuleRoute>} />
      <Route path="curriculum" element={<ModuleRoute path="/curriculum"><CurriculumPage /></ModuleRoute>} />
      <Route path="training" element={<ModuleRoute path="/training"><StaffTrainingPage /></ModuleRoute>} />
      <Route path="community" element={<CommunityRoute><CommunityPage /></CommunityRoute>} />
      <Route path="settings" element={<SettingsPage />} />

      {/* Teacher portal */}
      <Route path="my-classes" element={<ModuleRoute path="/my-classes"><MyClassesPage /></ModuleRoute>} />
      <Route path="my-classes/:classId" element={<ModuleRoute path="/my-classes"><TeacherClassPage /></ModuleRoute>} />
      <Route path="my-schedule" element={<ModuleRoute path="/my-schedule"><MySchedulePage /></ModuleRoute>} />
      <Route path="my-profile" element={<MyProfilePage />} />
      <Route path="directory" element={<DirectoryPage />} />
      <Route path="forms" element={<ModuleRoute path="/forms"><StaffFormsPage /></ModuleRoute>} />
      <Route path="onboarding" element={<ModuleRoute path="/onboarding"><OnboardingPage /></ModuleRoute>} />
      <Route path="my-documents" element={<MyDocumentsPage />} />
      <Route path="time" element={<ModuleRoute path="/time"><MyTimePage /></ModuleRoute>} />
      <Route path="timesheets" element={<FinanceRoute><ModuleRoute path="/timesheets"><TimesheetsPage /></ModuleRoute></FinanceRoute>} />

      {/* Carved-out admin surfaces (original paths preserved) */}
      <Route path="advisor/checkin/:studentId" element={<AdvisorCheckinPage />} />
      <Route path="advisor/verification" element={<TeacherVerificationPage />} />
      <Route path="enroll-students" element={<PartnerEnrollStudentPage />} />
      <Route path="onfire" element={<OnFireDashboard />} />
      <Route path="admin/organizations/:orgId/student/:studentId" element={<OrgStudentOverviewPage />} />
      <Route path="admin/*" element={<AdminPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
)

export default SisRoutes
