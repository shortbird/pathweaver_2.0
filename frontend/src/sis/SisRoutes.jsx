import React, { lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import SisLayout from '../components/sis/SisLayout'
import { goToLearningSurface } from '../utils/appSurface'

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
const RosterPage = lazy(() => import('../pages/sis/RosterPage'))
const StaffPage = lazy(() => import('../pages/sis/StaffPage'))
const ClassesPage = lazy(() => import('../pages/sis/ClassesPage'))
const ClpPage = lazy(() => import('../pages/sis/ClpPage'))
const BillingPage = lazy(() => import('../pages/sis/BillingPage'))
const AttendancePage = lazy(() => import('../pages/sis/AttendancePage'))
const HouseholdsPage = lazy(() => import('../pages/sis/HouseholdsPage'))
const FamilyMessagingPage = lazy(() => import('../pages/sis/FamilyMessagingPage'))
const RegistrationPage = lazy(() => import('../pages/sis/RegistrationPage'))
const CalendarPage = lazy(() => import('../pages/sis/CalendarPage'))
const ResourcesPage = lazy(() => import('../pages/sis/ResourcesPage'))
const SettingsPage = lazy(() => import('../pages/sis/SettingsPage'))

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
      <Route path="users" element={<RosterPage />} />
      <Route path="roster" element={<Navigate to="/users" replace />} />
      <Route path="staff" element={<StaffPage />} />
      <Route path="classes" element={<ClassesPage />} />
      <Route path="clp" element={<ClpPage />} />
      <Route path="billing" element={<BillingPage />} />
      <Route path="attendance" element={<AttendancePage />} />
      <Route path="households" element={<HouseholdsPage />} />
      <Route path="messaging" element={<FamilyMessagingPage />} />
      <Route path="registration" element={<RegistrationPage />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="settings" element={<SettingsPage />} />

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
