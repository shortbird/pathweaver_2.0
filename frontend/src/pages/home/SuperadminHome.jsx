import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheckIcon, CheckBadgeIcon, UsersIcon, BuildingLibraryIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { HomeStatSection, HomeDoorGrid } from '../../components/home/AdminHomeTiles'

/**
 * Superadmin Home — the platform cockpit (rendered by RoleHome at /dashboard).
 * Replaces the accidental parent-dashboard landing; the family dashboard
 * remains one click away for superadmins who are also parents.
 *
 * "Platform pulse": total users, signups this week, active organizations,
 * pending credit reviews, flagged tasks — each deep-linking into the surface
 * that acts on it. All sources reuse existing admin endpoints and degrade
 * silently, so even a full API outage still shows the greeting + doors.
 */
const DOORS = [
  {
    name: 'Admin Panel', path: '/admin', Icon: ShieldCheckIcon,
    description: 'Users, quests, organizations, settings.',
  },
  {
    name: 'Credit Review', path: '/credit-dashboard', Icon: CheckBadgeIcon,
    description: 'Transcripts and credit waiting on review.',
  },
  {
    name: 'Family Dashboard', path: '/parent/dashboard', Icon: UsersIcon,
    description: 'Your own family, as a parent sees it.',
  },
  {
    name: 'School Preview', path: '/school', Icon: BuildingLibraryIcon,
    description: 'Any school’s page, as any role.',
  },
]

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SIGNUPS_PAGE_SIZE = 100 // the endpoint's max per_page

/**
 * Newest-first page of users -> how many signed up in the last 7 days.
 * If the whole page is inside the window the true count may be larger, so
 * report "100+" rather than a wrong exact number.
 */
export function countSignupsThisWeek(users, total) {
  if (!Array.isArray(users)) return null
  const cutoff = Date.now() - WEEK_MS
  const count = users.filter(u => {
    const created = Date.parse(u?.created_at)
    return !Number.isNaN(created) && created >= cutoff
  }).length
  if (count === users.length && typeof total === 'number' && total > count) {
    return `${count}+`
  }
  return count
}

export default function SuperadminHome() {
  const { user } = useAuth()
  const firstName = user?.first_name || 'there'

  // One newest-first page serves two tiles: the exact platform total (count
  // header) and the signups-in-the-last-week tally.
  const usersQuery = useQuery({
    queryKey: ['home', 'superadmin', 'users'],
    queryFn: async () => (await api.get('/api/admin/users', {
      params: { page: 1, per_page: SIGNUPS_PAGE_SIZE, sortBy: 'created_at', sortOrder: 'desc' },
    })).data,
    staleTime: 60_000,
    retry: false,
  })

  const orgsQuery = useQuery({
    queryKey: ['home', 'superadmin', 'organizations'],
    queryFn: async () => (await api.get('/api/admin/organizations')).data,
    staleTime: 60_000,
    retry: false,
  })

  const creditQuery = useQuery({
    queryKey: ['home', 'superadmin', 'credit-stats'],
    queryFn: async () => {
      const res = await api.get('/api/credit-dashboard/stats')
      return res.data?.data || res.data
    },
    staleTime: 60_000,
    retry: false,
  })

  const flaggedQuery = useQuery({
    queryKey: ['home', 'superadmin', 'flagged-tasks'],
    queryFn: async () =>
      (await api.get('/api/admin/flagged-tasks', { params: { limit: 50, offset: 0 } })).data,
    staleTime: 60_000,
    retry: false,
  })

  const totalUsers = typeof usersQuery.data?.total === 'number' ? usersQuery.data.total : null
  const activeOrgs = Array.isArray(orgsQuery.data?.organizations)
    ? orgsQuery.data.organizations.filter(o => o?.is_active !== false).length
    : null
  const flaggedCount = typeof flaggedQuery.data?.count === 'number'
    ? (flaggedQuery.data.count === 50 ? '50+' : flaggedQuery.data.count)
    : null

  const stats = [
    {
      key: 'total-users',
      label: 'Total users',
      value: totalUsers,
      isLoading: usersQuery.isLoading,
      to: '/admin/users',
    },
    {
      key: 'signups-week',
      label: 'Signups this week',
      value: countSignupsThisWeek(usersQuery.data?.users, usersQuery.data?.total),
      isLoading: usersQuery.isLoading,
      to: '/admin/users',
    },
    {
      key: 'active-orgs',
      label: 'Active organizations',
      value: activeOrgs,
      isLoading: orgsQuery.isLoading,
      to: '/admin/organizations',
    },
    {
      key: 'pending-review',
      label: 'Pending credit review',
      value: typeof creditQuery.data?.pending_review === 'number'
        ? creditQuery.data.pending_review
        : null,
      isLoading: creditQuery.isLoading,
      to: '/credit-dashboard',
    },
    {
      key: 'flagged-tasks',
      label: 'Flagged tasks',
      value: flaggedCount,
      isLoading: flaggedQuery.isLoading,
      to: '/admin/flagged-tasks',
    },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
      <p className="text-sm text-gray-500 mt-1">The platform at a glance.</p>

      <HomeStatSection
        ariaLabel="Platform pulse"
        className="grid-cols-2 md:grid-cols-3"
        stats={stats}
      />

      <HomeDoorGrid ariaLabel="Superadmin surfaces" doors={DOORS} />
    </div>
  )
}
