import React, { lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import SisLayout from '../components/sis/SisLayout'
import { goToLearningSurface } from '../utils/appSurface'
import { isPathHidden } from '../pages/sis/sisModules'
import { useSisOrg } from '../pages/sis/useSisOrg'
import { canSeeFinance, canSeeHr } from '../pages/sis/sisRole'
import { useAuth } from '../contexts/AuthContext'

// Guards a route whose building-block module is off for the active org —
// opt-outs, opt-ins (community, prior learning, goals), and explicit
// feature_flags.modules entries all answer through the one evaluator behind
// isPathHidden (pages/sis/sisModules.js). A disabled module bounces to the
// SIS dashboard so a stale bookmark or typed URL can't reach a surface the
// org opted out of. Follows the active org, so a superadmin viewing that org
// is bounced too — mirroring exactly what the org's admin can reach. `path`
// is the leading-slash nav path (e.g. '/clp'). Replaced the former
// ModuleRoute / CommunityRoute / PriorLearningRoute trio.
const ModuleGate = ({ path, children }) => {
  const { activeOrg } = useSisOrg()
  if (isPathHidden(path, activeOrg)) return <Navigate to="/" replace />
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
const PriorLearningPage = lazy(() => import('../pages/sis/PriorLearningPage'))
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
const MyTasksPage = lazy(() => import('../pages/sis/MyTasksPage'))
const TaskCenterPage = lazy(() => import('../pages/sis/TaskCenterPage'))
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
const PhoneVerificationPage = lazy(() => import('../pages/PhoneVerificationPage'))

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
    {/* Phone verification hold. Standalone: SisLayout redirects held staff
        here, so routing it through SisLayout would redirect it to itself. */}
    <Route path="verify-phone" element={<PhoneVerificationPage />} />
    <Route element={<SisLayout />}>
      <Route index element={<SisDashboard />} />
      <Route path="people" element={<PeoplePage />} />
      {/* Old People routes now open the matching lens of the unified People page. */}
      <Route path="users" element={<Navigate to="/people" replace />} />
      <Route path="roster" element={<Navigate to="/people" replace />} />
      <Route path="staff" element={<Navigate to="/people?tab=staff" replace />} />
      <Route path="households" element={<Navigate to="/people?tab=families" replace />} />
      <Route path="classes" element={<ModuleGate path="/classes"><ClassesPage /></ModuleGate>} />
      <Route path="clp" element={<ModuleGate path="/clp"><ClpPage /></ModuleGate>} />
      <Route path="billing" element={<FinanceRoute><ModuleGate path="/billing"><BillingPage /></ModuleGate></FinanceRoute>} />
      <Route path="tuition" element={<FinanceRoute><ModuleGate path="/tuition"><TuitionApprovalPage /></ModuleGate></FinanceRoute>} />
      <Route path="attendance" element={<ModuleGate path="/attendance"><AttendancePage /></ModuleGate>} />
      <Route path="goals" element={<ModuleGate path="/goals"><GoalsReviewPage /></ModuleGate>} />
      <Route path="submissions" element={<ModuleGate path="/submissions"><SubmissionsPage /></ModuleGate>} />
      <Route path="prior-learning" element={<ModuleGate path="/prior-learning"><PriorLearningPage /></ModuleGate>} />
      <Route path="reports" element={<ModuleGate path="/reports"><ReportsPage /></ModuleGate>} />
      <Route path="secure-documents" element={<HrRoute><ModuleGate path="/secure-documents"><SecureDocumentsPage /></ModuleGate></HrRoute>} />
      <Route path="messaging" element={<FamilyMessagingPage />} />
      <Route path="registration" element={<ModuleGate path="/registration"><RegistrationPage /></ModuleGate>} />
      <Route path="calendar" element={<ModuleGate path="/calendar"><CalendarPage /></ModuleGate>} />
      <Route path="resources" element={<ModuleGate path="/resources"><ResourcesPage /></ModuleGate>} />
      <Route path="curriculum" element={<ModuleGate path="/curriculum"><CurriculumPage /></ModuleGate>} />
      <Route path="training" element={<ModuleGate path="/training"><StaffTrainingPage /></ModuleGate>} />
      <Route path="community" element={<ModuleGate path="/community"><CommunityPage /></ModuleGate>} />
      <Route path="settings" element={<SettingsPage />} />

      {/* Teacher portal */}
      <Route path="my-classes" element={<ModuleGate path="/my-classes"><MyClassesPage /></ModuleGate>} />
      <Route path="my-classes/:classId" element={<ModuleGate path="/my-classes"><TeacherClassPage /></ModuleGate>} />
      <Route path="my-schedule" element={<ModuleGate path="/my-schedule"><MySchedulePage /></ModuleGate>} />
      <Route path="my-profile" element={<MyProfilePage />} />
      <Route path="directory" element={<DirectoryPage />} />
      {/* The unified surfaces. /forms and /onboarding stay mounted rather than
          redirecting: they own the deep-linked completion flows the task inbox
          links into (?submission=, ?assignment=&item=), and every notification
          sent before this shipped points at them. They are simply off the nav. */}
      <Route path="my-tasks" element={<ModuleGate path="/my-tasks"><MyTasksPage /></ModuleGate>} />
      <Route path="tasks" element={<ModuleGate path="/tasks"><TaskCenterPage /></ModuleGate>} />
      <Route path="forms" element={<ModuleGate path="/forms"><StaffFormsPage /></ModuleGate>} />
      <Route path="onboarding" element={<ModuleGate path="/onboarding"><OnboardingPage /></ModuleGate>} />
      <Route path="my-documents" element={<MyDocumentsPage />} />
      <Route path="time" element={<ModuleGate path="/time"><MyTimePage /></ModuleGate>} />
      <Route path="timesheets" element={<FinanceRoute><ModuleGate path="/timesheets"><TimesheetsPage /></ModuleGate></FinanceRoute>} />

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
