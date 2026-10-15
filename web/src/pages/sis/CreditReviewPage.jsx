import React from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useSisOrg } from './useSisOrg'
import CreditReviewDashboardPage from '../CreditReviewDashboardPage'

/**
 * Credit Review in the SIS console (/credit-review).
 *
 * The school stage of credit review: a student asks for diploma credit on a
 * task, the request waits at diploma_status 'pending_org_approval', and the
 * school approves it or sends it back with a note (Grow This). Since
 * 2026-10-15 an approval finalizes the credit when the student's transcript is
 * the school's own, and sends it on to Optio when it is under Optio's
 * accreditation (backend: routes/credit_dashboard/org_admin_actions.py). The queue
 * and grader are the organization console's (CreditReviewDashboardPage),
 * scoped to the org in view. Until 2026-10-15 the only door was that console,
 * which the web sidebar hid from SIS schools, so 299 requests sat unseen
 * (Gryffin 222, the oldest from March).
 *
 * The route guard (SisRoutes: CreditReviewRoute) admits every staff role:
 * org admins, coordinators and teachers (whose queue the backend narrows to
 * their own students), and superadmins. Every one of them sits in the school
 * stage's seat, so the dashboard is told 'org_admin' -- the seat, not the
 * account's role. Reading the singular effective role instead would make a
 * teacher an 'advisor', which the dashboard reads as Optio's final-review seat
 * (pending_review), and drop the school-stage buttons.
 */
export default function CreditReviewPage() {
  const { user } = useAuth()
  const { orgId, loading } = useSisOrg()

  if (loading) return <p className="text-neutral-500">Loading…</p>
  if (!orgId) {
    return <p className="text-neutral-500">Select an organization to review its credit requests.</p>
  }
  return (
    <CreditReviewDashboardPage
      orgId={orgId}
      reviewerRole={user?.role === 'superadmin' ? 'superadmin' : 'org_admin'}
    />
  )
}
