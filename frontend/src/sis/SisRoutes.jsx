import React, { lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import SisLayout from '../components/sis/SisLayout'
import { goToLearningSurface } from '../utils/appSurface'
import { isPathHidden } from '../pages/sis/sisModules'
import { useSisOrg } from '../pages/sis/useSisOrg'

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
const AttendancePage = lazy(() => import('../pages/sis/AttendancePage'))
const FamilyMessagingPage = lazy(() => import('../pages/sis/FamilyMessagingPage'))
const RegistrationPage = lazy(() => import('../pages/sis/RegistrationPage'))
const CalendarPage = lazy(() => import('../pages/sis/CalendarPage'))
const ResourcesPage = lazy(() => import('../pages/sis/ResourcesPage'))
const SettingsPage = lazy(() => import('../pages/sis/SettingsPage'))
const GoalsReviewPage = lazy(() => import('../pages/sis/GoalsReviewPage'))
const SubmissionsPage = lazy(() => import('../pages/sis/SubmissionsPage'))
const ReportsPage = lazy(() => import('../pages/sis/ReportsPage'))

// Teacher portal pages (advisors; admins can open them too)
const MyClassesPage = lazy(() => import('../pages/sis/MyClassesPage'))
const TeacherClassPage = lazy(() => import('../pages/sis/TeacherClassPage'))
const DirectoryPage = lazy(() => import('../pages/sis/DirectoryPage'))
const StaffFormsPage = lazy(() => import('../pages/sis/StaffFormsPage'))
const OnboardingPage = lazy(() => import('../pages/sis/OnboardingPage'))
const MyTimePage = lazy(() => import('../pages/sis/MyTimePage'))
const TimesheetsPage = lazy(() => import('../pages/sis/TimesheetsPage'))

// Carved-out admin surfaces — re-registered at their ORIGINAL paths so the moved
// components' internal links keep working on the SIS host. Same lazy chunks as the
// learning app (Vite dedupes); the files are not physically moved (low-risk MVP).
// NOTE: the org-management page was retired from the SIS — its functionality now
// lives natively in Settings, Users, Staff, Families, Classes, and Messaging. The
// page still exists on the learning app (App.jsx /organization) for platform-only
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
    <Route element={<SisLayout />}>
      <Route index element={<SisDashboard />} />
      <Route path="people" element={<PeoplePage />} />
      {/* Old People routes now open the matching lens of the unified People page. */}
      <Route path="users" element={<Navigate to="/people" replace />} />
      <Route path="roster" element={<Navigate to="/people" replace />} />
      <Route path="staff" element={<Navigate to="/people?tab=staff" replace />} />
      <Route path="households" element={<Navigate to="/people?tab=families" replace />} />
      <Route path="classes" element={<ClassesPage />} />
      <Route path="clp" element={<ModuleRoute path="/clp"><ClpPage /></ModuleRoute>} />
      <Route path="billing" element={<ModuleRoute path="/billing"><BillingPage /></ModuleRoute>} />
      <Route path="attendance" element={<AttendancePage />} />
      <Route path="goals" element={<GoalsReviewPage />} />
      <Route path="submissions" element={<SubmissionsPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="messaging" element={<FamilyMessagingPage />} />
      <Route path="registration" element={<RegistrationPage />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="settings" element={<SettingsPage />} />

      {/* Teacher portal */}
      <Route path="my-classes" element={<MyClassesPage />} />
      <Route path="my-classes/:classId" element={<TeacherClassPage />} />
      <Route path="directory" element={<DirectoryPage />} />
      <Route path="forms" element={<ModuleRoute path="/forms"><StaffFormsPage /></ModuleRoute>} />
      <Route path="onboarding" element={<ModuleRoute path="/onboarding"><OnboardingPage /></ModuleRoute>} />
      <Route path="time" element={<ModuleRoute path="/time"><MyTimePage /></ModuleRoute>} />
      <Route path="timesheets" element={<ModuleRoute path="/timesheets"><TimesheetsPage /></ModuleRoute>} />

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
