import React, { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useSisOrg } from './sis/useSisOrg'
import { useSchoolContext } from '../hooks/api/useSchoolContext'
import { familyModuleKnownOff } from '../modules/moduleEnabled'
import BackToSchool from '../components/navigation/BackToSchool'
import CarpoolBoard from '../components/announcements/CarpoolBoard'

/**
 * The carpool board on its own page (/carpool) — reached from the sidebar,
 * asked for by name (2026-08-23): parents arranging rides go straight here,
 * not through the school page's feed. The board on /school is the same board;
 * this is a second door, not a second board.
 *
 * Superadmins have no membership for the feed to resolve, so their reads name
 * the previewed org (the shared SIS selection, same as /school) and render
 * the parent view.
 *
 * The board is the community feed, gated on the `community` module, so a
 * school without it is not asked (Sentry: ModuleGate warnings from Apogee
 * NoCo, community off). The school is the one the school context names first,
 * the same entry /school renders its rail from; for a superadmin, the
 * previewed org.
 */
export default function CarpoolPage() {
  const { effectiveRole } = useAuth()
  const isSuperadmin = effectiveRole === 'superadmin'
  const { orgId: previewOrgId, activeOrg } = useSisOrg()
  const { orgs: schoolOrgs, loading: schoolLoading } = useSchoolContext({ enabled: !isSuperadmin })
  // null while the answer is not in yet; then whether the board is known not
  // to exist. A failed context read cannot answer, so it asks, as before.
  const communityOff = isSuperadmin
    ? familyModuleKnownOff(activeOrg, 'community')
    : (schoolLoading ? null : familyModuleKnownOff(schoolOrgs?.[0], 'community'))
  const [feed, setFeed] = useState(null)
  const [perms, setPerms] = useState({ canPost: false, canModerate: false })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (communityOff === null) return
    if (communityOff) { setFeed(null); setLoading(false); return }
    try {
      const params = isSuperadmin && previewOrgId
        ? { organization_id: previewOrgId, view_as: 'parent' }
        : undefined
      const { data } = await api.get('/api/sis/community/feed', params ? { params } : undefined)
      if (data?.success) {
        setFeed(data.feed || null)
        setPerms({
          canPost: Boolean(data.can_post_carpool),
          canModerate: Boolean(data.can_moderate),
        })
      }
    } catch {
      // No board for this user — the empty state below says so.
    } finally {
      setLoading(false)
    }
  }, [isSuperadmin, previewOrgId, communityOff])

  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackToSchool className="mb-3" />
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : feed !== null ? (
        <CarpoolBoard
          posts={feed?.carpool || []}
          canPost={perms.canPost}
          canModerate={perms.canModerate}
          onChanged={load}
          defaultOpen
        />
      ) : (
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Carpool</h1>
          <p className="text-gray-500">
            The carpool board isn’t available for your account yet. If your school runs
            its community on Optio, ask them to add your family.
          </p>
        </div>
      )}
    </div>
  )
}
