import React, { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import GlassTabBar from '../ui/GlassTabBar'
import { RolePill } from '../ui/RolePill'
import PersonPhoto from './PersonPhoto'
import ProfilePanel from './staffRecord/ProfilePanel'
import EmploymentPanel from './staffRecord/EmploymentPanel'
import AccountPanel from './staffRecord/AccountPanel'

/**
 * A staff member's record, the way the student and family records are one
 * modal each: Profile (who they are, their role), Employment (position, pay,
 * duties), Account (login, portal, removal).
 *
 * Until M13c (2026-09-18) this was a summary card whose footer opened three
 * more dialogs -- TeacherModal to edit, StaffProfileModal for employment,
 * LinkStaffAccountModal to link a login -- so PeoplePage mounted a stack of
 * four and a coordinator hunting for "where do I change her hours" opened
 * them in turn (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G-3). The
 * three are tabs now, and TeacherModal only adds. Opened through
 * useRecordDoors().openStaff(row), the console's one mount.
 */

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'employment', label: 'Employment' },
  { id: 'account', label: 'Account' },
]

export default function StaffDetailModal({ orgId, staff, onClose, onSaved, onViewPortal, onRemoved, initialTab = 'profile' }) {
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : 'profile')
  // The employment profile row carries the phone the Profile tab edits and
  // the position the header summarises; the Employment tab reads it again
  // for its own form.
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    api.get(`/api/sis/staff-admin/profiles/${staff.id}?organization_id=${orgId}`)
      .then((r) => setProfile(r.data?.profile || {}))
      .catch(() => setProfile({}))
  }, [orgId, staff.id])

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <PersonPhoto src={staff.avatar_url} name={staff.name} size="w-14 h-14" textSize="text-lg" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-900 truncate">{staff.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {(staff.roles || []).map((r) => <RolePill key={r} role={r} />)}
                {profile?.position && <span className="text-xs text-neutral-500">{profile.position}</span>}
                {staff.is_placeholder && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    No login yet
                  </span>
                )}
                {profile && profile.is_active === false && (
                  <span className="text-xs font-medium text-red-600">Inactive</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-1">
          <GlassTabBar align="start" aria-label="Staff record sections" tabs={TABS} active={tab} onSelect={setTab} />
        </div>

        <div className="p-4 overflow-y-auto">
          {tab === 'profile' && <ProfilePanel orgId={orgId} staff={staff} profile={profile} onSaved={onSaved} />}
          {tab === 'employment' && <EmploymentPanel orgId={orgId} staff={staff} onSaved={onSaved} />}
          {tab === 'account' && (
            <AccountPanel orgId={orgId} staff={staff} onSaved={onSaved} onViewPortal={onViewPortal} onRemoved={onRemoved} />
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
