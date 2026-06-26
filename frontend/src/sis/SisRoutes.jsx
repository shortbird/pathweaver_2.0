import React, { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import SisLayout from '../components/sis/SisLayout'

// New SIS console pages
const SisDashboard = lazy(() => import('../pages/sis/SisDashboard'))
const RosterPage = lazy(() => import('../pages/sis/RosterPage'))
const ClassesPage = lazy(() => import('../pages/sis/ClassesPage'))
const HouseholdsPage = lazy(() => import('../pages/sis/HouseholdsPage'))
const FamilyMessagingPage = lazy(() => import('../pages/sis/FamilyMessagingPage'))

// Carved-out admin surfaces — re-registered at their ORIGINAL paths so the moved
// components' internal links keep working on the SIS host. Same lazy chunks as the
// learning app (Vite dedupes); the files are not physically moved (low-risk MVP).
const OrganizationManagement = lazy(() => import('../pages/admin/OrganizationManagement'))
const AdvisorDashboard = lazy(() => import('../pages/AdvisorDashboard'))
const AdvisorCheckinPage = lazy(() => import('../pages/AdvisorCheckinPage'))
const TeacherVerificationPage = lazy(() => import('../pages/TeacherVerificationPage'))
const CreditReviewDashboardPage = lazy(() => import('../pages/CreditReviewDashboardPage'))
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
    <Route element={<SisLayout />}>
      <Route index element={<SisDashboard />} />
      <Route path="roster" element={<RosterPage />} />
      <Route path="classes" element={<ClassesPage />} />
      <Route path="households" element={<HouseholdsPage />} />
      <Route path="messaging" element={<FamilyMessagingPage />} />

      {/* Carved-out admin surfaces (original paths preserved) */}
      <Route path="organization" element={<OrganizationManagement />} />
      <Route path="advisor/dashboard" element={<AdvisorDashboard />} />
      <Route path="advisor/checkin/:studentId" element={<AdvisorCheckinPage />} />
      <Route path="advisor/verification" element={<TeacherVerificationPage />} />
      <Route path="credit-dashboard" element={<CreditReviewDashboardPage />} />
      <Route path="enroll-students" element={<PartnerEnrollStudentPage />} />
      <Route path="onfire" element={<OnFireDashboard />} />
      <Route path="admin/organizations/:orgId/student/:studentId" element={<OrgStudentOverviewPage />} />
      <Route path="admin/*" element={<AdminPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
)

export default SisRoutes
