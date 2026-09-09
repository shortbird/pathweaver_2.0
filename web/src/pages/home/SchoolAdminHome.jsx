import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { BuildingLibraryIcon, UsersIcon, MegaphoneIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { HomeStatSection, HomeDoorGrid } from '../../components/home/AdminHomeTiles'
import MyEnrolledQuests from '../../components/home/MyEnrolledQuests'

/**
 * School Home — the non-SIS org admin's landing (rendered by RoleHome at
 * /dashboard). SIS-org admins front-door the SIS console via /sis-launch;
 * simplified partner orgs keep /onfire.
 *
 * "Is the school healthy": a snapshot row (students, teachers, active classes,
 * work awaiting credit review) that deep-links into the organization console,
 * then the doors. Every snapshot source reuses an endpoint the console already
 * calls and degrades silently on failure.
 */
const DOORS = [
  {
    name: 'Organization Console', path: '/organization', Icon: BuildingLibraryIcon,
    description: 'Members, quests, courses and settings.',
  },
  {
    name: 'Classes', path: '/org-classes', Icon: AcademicCapIcon,
    description: 'Your organization’s classes and rosters.',
  },
  {
    name: 'People', path: '/organization?tab=people', Icon: UsersIcon,
    description: 'Students, teachers and families.',
  },
  {
    name: 'Announcements', path: '/school', Icon: MegaphoneIcon,
    description: 'What your community sees.',
  },
]

/** Org users carry their real role in org_role (single) or org_roles (array). */
function countByOrgRole(users, role) {
  if (!Array.isArray(users)) return null
  return users.filter(u =>
    u?.org_role === role || (Array.isArray(u?.org_roles) && u.org_roles.includes(role))
  ).length
}

export default function SchoolAdminHome() {
  const { user } = useAuth()
  const firstName = user?.first_name || 'there'
  const orgId = user?.organization_id

  // Same payload the organization console loads (users + quests + courses).
  const orgQuery = useQuery({
    queryKey: ['home', 'school-admin', 'org', orgId],
    queryFn: async () => (await api.get(`/api/admin/organizations/${orgId}`)).data,
    enabled: Boolean(orgId),
    staleTime: 60_000,
    retry: false,
  })

  // Active classes — what the console's Classes tab lists.
  const classesQuery = useQuery({
    queryKey: ['home', 'school-admin', 'classes', orgId],
    queryFn: async () =>
      (await api.get(`/api/organizations/${orgId}/classes`, { params: { status: 'active' } })).data,
    enabled: Boolean(orgId),
    staleTime: 60_000,
    retry: false,
  })

  // Credit-review queue counts, already scoped to this org for org admins.
  const creditQuery = useQuery({
    queryKey: ['home', 'school-admin', 'credit-stats'],
    queryFn: async () => {
      const res = await api.get('/api/credit-dashboard/stats')
      return res.data?.data || res.data
    },
    enabled: Boolean(orgId),
    staleTime: 60_000,
    retry: false,
  })

  const orgUsers = orgQuery.data?.users
  const stats = [
    {
      key: 'students',
      label: 'Students',
      value: countByOrgRole(orgUsers, 'student'),
      isLoading: orgQuery.isLoading,
      to: '/organization?tab=people',
    },
    {
      key: 'teachers',
      label: 'Teachers',
      value: countByOrgRole(orgUsers, 'advisor'),
      isLoading: orgQuery.isLoading,
      to: '/organization?tab=people',
    },
    {
      key: 'classes',
      label: 'Active classes',
      value: Array.isArray(classesQuery.data?.classes) ? classesQuery.data.classes.length : null,
      isLoading: classesQuery.isLoading,
      to: '/org-classes',
    },
    {
      key: 'pending-review',
      label: 'Awaiting credit review',
      value: typeof creditQuery.data?.pending_org_approval === 'number'
        ? creditQuery.data.pending_org_approval
        : null,
      isLoading: creditQuery.isLoading,
      to: '/organization?tab=credit-review',
    },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
      <p className="text-sm text-gray-500 mt-1">Your school at a glance.</p>

      {orgId && (
        <HomeStatSection
          ariaLabel="School snapshot"
          className="grid-cols-2 md:grid-cols-4"
          stats={stats}
        />
      )}

      <HomeDoorGrid ariaLabel="School admin surfaces" doors={DOORS} />
      {/* An admin can be assigned the school's own training like anybody else,
          and has no student dashboard to find it on. */}
      <MyEnrolledQuests className="mt-8" />
    </div>
  )
}
