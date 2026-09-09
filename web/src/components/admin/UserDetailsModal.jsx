import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AcademicCapIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  PhotoIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import ChatLogsModal from './ChatLogsModal'
import CheckinHistoryModal from '../advisor/CheckinHistoryModal'
import UserPeopleTab from './UserPeopleTab'
import { ConfirmDialog, GlassTabBar, Modal, Spinner } from '../ui'
import { startMasquerade } from '../../services/masqueradeService'

/**
 * UserDetailsModal — the admin's view of one user.
 *
 * Condensed from five tabs (Profile / Role / Connections / Enrollments /
 * Actions) to three. What changed and why:
 *  - Identity lives in the header at every breakpoint, so the modal no longer
 *    spends its title bar on the words "User Details".
 *  - Overview leads with the stats the detail endpoint already returned and the
 *    old modal threw away (XP, quests completed, last active).
 *  - Access is one form with one Save and one diff confirm, replacing three
 *    buttons and three `window.confirm`s.
 *  - Connections and Enrollments were the same widget twice; they are one tab.
 *  - The eight-colour Actions tab is gone: record views sit at the bottom of
 *    Overview, account-state actions in Access, and the two identity-level
 *    actions (masquerade, delete) in the header menu.
 */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'access', label: 'Access' },
  { id: 'people', label: 'People' },
]

const PLATFORM_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'advisor', label: 'Teacher' },
  { value: 'observer', label: 'Observer' },
  { value: 'org_managed', label: 'Organization Managed' },
  { value: 'org_admin', label: 'Organization Admin' },
  { value: 'superadmin', label: 'Superadmin' },
]

// Mirrors utils/roles.py OrgRole. campus_coordinator is org-only and was
// missing here, so the role could not be assigned from this screen at all.
const ORG_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'advisor', label: 'Teacher' },
  { value: 'observer', label: 'Observer' },
  { value: 'campus_coordinator', label: 'Campus Coordinator' },
  { value: 'org_admin', label: 'Organization Admin' },
]

const ROLE_GLOSSARY = [
  ['Student', 'Completes quests and builds a diploma'],
  ['Parent', "Views linked children's progress"],
  ['Teacher', 'Manages student groups and provides guidance'],
  ['Observer', 'View-only access to linked students'],
  ['Campus Coordinator', 'Org admin tools without the financial data'],
  ['Organization Admin', 'Full organization management'],
  ['Organization Managed', 'Platform role for org users; the real role is the org role below'],
  ['Superadmin', 'Platform-wide access'],
]

const PROFILE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone_number',
  'date_of_birth',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
]

const ADDRESS_FIELDS = ['address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country']

const labelFor = (list, value) => list.find((o) => o.value === value)?.label || value || '—'

const pickProfile = (source = {}) =>
  PROFILE_FIELDS.reduce((acc, key) => ({ ...acc, [key]: source[key] || '' }), {})

const derivedOrgRole = (source = {}) =>
  source.org_role || (source.is_org_admin ? 'org_admin' : 'student')

const fullName = (u) =>
  `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.display_name || u.email

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const Field = ({ id, label, children }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    {children}
  </div>
)

const Stat = ({ label, value }) => (
  <div className="px-3 py-2">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
  </div>
)

const RecordRow = ({ icon: Icon, title, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg border border-gray-100 bg-gray-50/60 hover:border-optio-purple/60 hover:bg-white transition-all"
  >
    <span className="w-9 h-9 rounded-lg bg-optio-purple/10 text-optio-purple flex items-center justify-center flex-shrink-0">
      <Icon className="w-5 h-5" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-gray-900">{title}</span>
      <span className="block text-xs text-gray-500 truncate">{hint}</span>
    </span>
  </button>
)

const UserDetailsModal = ({ user, onClose, onSave }) => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const [profile, setProfile] = useState(() => pickProfile(user))
  const [profileBaseline, setProfileBaseline] = useState(() => pickProfile(user))
  const [access, setAccess] = useState(() => ({
    role: user.role || 'student',
    organization_id: user.organization_id || '',
    org_role: derivedOrgRole(user),
  }))
  const [accessBaseline, setAccessBaseline] = useState(() => ({
    role: user.role || 'student',
    organization_id: user.organization_id || '',
    org_role: derivedOrgRole(user),
  }))

  const [stats, setStats] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [organizations, setOrganizations] = useState([])
  const [orgName, setOrgName] = useState(user.organization_name || user.organization?.name || '')
  const [saving, setSaving] = useState(false)
  const [showAddress, setShowAddress] = useState(false)
  const [showGlossary, setShowGlossary] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [nested, setNested] = useState(null) // 'chat' | 'checkins'
  const menuRef = useRef(null)

  const profileDirty = useMemo(
    () => PROFILE_FIELDS.some((key) => profile[key] !== profileBaseline[key]),
    [profile, profileBaseline]
  )
  const accessChanges = useMemo(() => {
    const changes = []
    if (access.role !== accessBaseline.role) {
      changes.push({
        key: 'role',
        label: 'Platform role',
        from: labelFor(PLATFORM_ROLES, accessBaseline.role),
        to: labelFor(PLATFORM_ROLES, access.role),
      })
    }
    if (access.organization_id !== accessBaseline.organization_id) {
      changes.push({
        key: 'organization',
        label: 'Organization',
        from: orgName || 'None',
        to: organizations.find((o) => o.id === access.organization_id)?.name || 'None',
      })
    }
    if (access.org_role !== accessBaseline.org_role) {
      changes.push({
        key: 'org_role',
        label: 'Organization role',
        from: labelFor(ORG_ROLES, accessBaseline.org_role),
        to: labelFor(ORG_ROLES, access.org_role),
      })
    }
    return changes
  }, [access, accessBaseline, orgName, organizations])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const { data } = await api.get(`/api/admin/users/${user.id}`)
        if (cancelled) return
        const detail = data.user || data
        const nextProfile = pickProfile(detail)
        setProfile(nextProfile)
        setProfileBaseline(nextProfile)
        const nextAccess = {
          role: detail.role || 'student',
          organization_id: detail.organization_id || '',
          org_role: derivedOrgRole(detail),
        }
        setAccess(nextAccess)
        setAccessBaseline(nextAccess)
        setAvatarUrl(detail.avatar_url || '')
        setOrgName(detail.organization_name || detail.organization?.name || '')
        setStats({
          total_xp: data.total_xp || 0,
          quests_completed: data.quests_completed || 0,
          last_active: data.last_active || detail.last_active,
          created_at: detail.created_at || user.created_at,
        })
      } catch {
        if (!cancelled) toast.error('Failed to load user details')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user.id, user.created_at])

  // Only needed by the Access tab's organization picker.
  useEffect(() => {
    if (activeTab !== 'access' || organizations.length) return
    let cancelled = false
    api
      .get('/api/admin/organizations')
      .then(({ data }) => {
        if (!cancelled) setOrganizations(data.organizations || [])
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load organizations')
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, organizations.length])

  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  // --- Unsaved-changes guard --------------------------------------------
  // Editing the profile and switching tabs used to discard the edit silently.

  const guard = useCallback(
    (proceed) => {
      if (!profileDirty) {
        proceed()
        return
      }
      setConfirm({
        title: 'Discard unsaved changes?',
        body: 'The profile edits on this screen have not been saved.',
        confirmLabel: 'Discard',
        destructive: true,
        run: async () => {
          setProfile(profileBaseline)
          proceed()
        },
      })
    },
    [profileDirty, profileBaseline]
  )

  const requestClose = () => guard(onClose)
  const requestTab = (tab) => guard(() => setActiveTab(tab))

  const setProfileField = (e) => setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  // --- Mutations ---------------------------------------------------------

  const saveProfile = async () => {
    setSaving(true)
    try {
      await api.put(`/api/admin/users/${user.id}`, profile)
      setProfileBaseline(profile)
      toast.success('Profile saved')
      onSave()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const applyAccessChanges = async () => {
    // Order matters: the organization must exist on the user before an org
    // role can be set against it.
    for (const change of accessChanges) {
      if (change.key === 'role') {
        await api.put(`/api/admin/users/${user.id}/role`, { role: access.role })
      } else if (change.key === 'organization') {
        await api.put(`/api/admin/users/${user.id}/organization`, {
          organization_id: access.organization_id || null,
        })
        setOrgName(organizations.find((o) => o.id === access.organization_id)?.name || '')
      } else {
        await api.put(`/api/admin/users/${user.id}/org-role`, { org_role: access.org_role })
      }
    }
    setAccessBaseline(access)
    toast.success('Access updated')
    onSave()
  }

  const uploadAvatar = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be under 5MB')
        return
      }
      const body = new FormData()
      body.append('file', file)
      setUploadingAvatar(true)
      try {
        const { data } = await api.post(`/api/admin/users/${user.id}/upload-avatar`, body)
        setAvatarUrl(data.avatar_url)
        toast.success('Photo updated')
        onSave()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to upload photo')
      } finally {
        setUploadingAvatar(false)
      }
    }
    input.click()
  }

  const masquerade = async () => {
    const result = await startMasquerade(user.id, '', api)
    if (!result.success) {
      toast.error(result.error || 'Failed to start masquerade')
      throw new Error('masquerade failed')
    }
    toast.success(`Now masquerading as ${fullName(result.targetUser)}`)
    onClose()
    // Full load so AuthContext re-initialises; navigation stays smooth after.
    window.location.href = result.targetUser.role === 'parent' ? '/parent/dashboard' : '/dashboard'
  }

  const goTo = (path) => guard(() => {
    onClose()
    navigate(path)
  })

  // --- Render ------------------------------------------------------------

  const displayName = fullName({ ...user, ...profile })
  const roleLabel = labelFor(PLATFORM_ROLES, accessBaseline.role)

  const header = (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white/40" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-white/20 ring-2 ring-white/40 flex items-center justify-center">
            <span className="text-lg font-bold">
              {(profile.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={uploadAvatar}
          disabled={uploadingAvatar}
          title="Change photo"
          aria-label="Change photo"
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white text-optio-purple shadow flex items-center justify-center hover:bg-gray-50 disabled:opacity-60"
        >
          {uploadingAvatar ? <Spinner size="sm" className="!h-3 !w-3" /> : <PhotoIcon className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-bold truncate">{displayName}</h2>
        <p className="text-xs sm:text-sm text-white/80 truncate">{user.email}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
            {roleLabel}
          </span>
          {orgName && (
            <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
              {orgName}
            </span>
          )}
        </div>
      </div>

      <div className="relative ml-auto flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <EllipsisVerticalIcon className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-10"
          >
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setMenuOpen(false)
                setConfirm({
                  title: 'Masquerade as this user?',
                  body: `You will browse the platform as ${displayName} until you exit the session.`,
                  confirmLabel: 'Masquerade',
                  run: masquerade,
                })
              }}
            >
              Masquerade as user
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false)
                setConfirm({
                  title: 'Delete this account?',
                  body: `${displayName} and all of their data will be permanently deleted. This cannot be undone.`,
                  confirmLabel: 'Delete account',
                  destructive: true,
                  run: async () => {
                    await api.delete(`/api/admin/users/${user.id}`)
                    toast.success('User deleted')
                    onClose()
                    onSave()
                  },
                })
              }}
            >
              Delete account
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const footer =
    activeTab === 'overview' && profileDirty ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Unsaved changes</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setProfile(profileBaseline)} className="btn-quiet">
            Reset
          </button>
          <button type="button" onClick={saveProfile} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    ) : activeTab === 'access' && accessChanges.length > 0 ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {accessChanges.length} pending change{accessChanges.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAccess(accessBaseline)} className="btn-quiet">
            Reset
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              setConfirm({
                title: 'Apply access changes?',
                node: (
                  <ul className="space-y-1">
                    {accessChanges.map((c) => (
                      <li key={c.key}>
                        <span className="font-medium text-gray-900">{c.label}:</span> {c.from} &rarr; {c.to}
                      </li>
                    ))}
                  </ul>
                ),
                confirmLabel: 'Apply',
                run: applyAccessChanges,
              })
            }
          >
            Apply changes
          </button>
        </div>
      </div>
    ) : null

  return (
    <>
      <Modal
        isOpen
        onClose={requestClose}
        header={header}
        size="md"
        bodyClassName="!p-0"
        footer={footer}
      >
        <div className="sticky top-0 z-10 bg-white px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200">
          <GlassTabBar
            size="md"
            aria-label="User details sections"
            tabs={TABS}
            active={activeTab}
            onSelect={requestTab}
          />
        </div>

        <div className="px-4 sm:px-6 py-5">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                <Stat label="Total XP" value={stats ? stats.total_xp.toLocaleString() : '—'} />
                <Stat label="Quests done" value={stats ? stats.quests_completed : '—'} />
                <Stat label="Last active" value={stats ? formatDate(stats.last_active) : '—'} />
                <Stat label="Joined" value={stats ? formatDate(stats.created_at) : '—'} />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="user-first-name" label="First name">
                    <input
                      id="user-first-name"
                      name="first_name"
                      type="text"
                      value={profile.first_name}
                      onChange={setProfileField}
                      className="input-field !py-2 min-h-[44px]"
                    />
                  </Field>
                  <Field id="user-last-name" label="Last name">
                    <input
                      id="user-last-name"
                      name="last_name"
                      type="text"
                      value={profile.last_name}
                      onChange={setProfileField}
                      className="input-field !py-2 min-h-[44px]"
                    />
                  </Field>
                </div>
                <Field id="user-email" label="Email">
                  <input
                    id="user-email"
                    name="email"
                    type="email"
                    value={profile.email}
                    onChange={setProfileField}
                    className="input-field !py-2 min-h-[44px]"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="user-phone" label="Phone">
                    <input
                      id="user-phone"
                      name="phone_number"
                      type="tel"
                      value={profile.phone_number}
                      onChange={setProfileField}
                      placeholder="(555) 123-4567"
                      className="input-field !py-2 min-h-[44px]"
                    />
                  </Field>
                  <Field id="user-dob" label="Date of birth">
                    <input
                      id="user-dob"
                      name="date_of_birth"
                      type="date"
                      value={profile.date_of_birth}
                      onChange={setProfileField}
                      className="input-field !py-2 min-h-[44px]"
                    />
                  </Field>
                </div>

                <div className="border border-gray-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setShowAddress((v) => !v)}
                    aria-expanded={showAddress}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700"
                  >
                    Mailing address
                    <span className="flex items-center gap-2 text-gray-500">
                      {!showAddress && (
                        <span className="text-xs">
                          {ADDRESS_FIELDS.some((f) => profile[f]) ? 'On file' : 'Not set'}
                        </span>
                      )}
                      <ChevronDownIcon
                        className={`w-4 h-4 transition-transform ${showAddress ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>
                  {showAddress && (
                    <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                      <Field id="user-address1" label="Address line 1">
                        <input
                          id="user-address1"
                          name="address_line1"
                          type="text"
                          value={profile.address_line1}
                          onChange={setProfileField}
                          placeholder="123 Main Street"
                          className="input-field !py-2"
                        />
                      </Field>
                      <Field id="user-address2" label="Address line 2">
                        <input
                          id="user-address2"
                          name="address_line2"
                          type="text"
                          value={profile.address_line2}
                          onChange={setProfileField}
                          placeholder="Apt, suite, unit (optional)"
                          className="input-field !py-2"
                        />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field id="user-city" label="City">
                          <input
                            id="user-city"
                            name="city"
                            type="text"
                            value={profile.city}
                            onChange={setProfileField}
                            className="input-field !py-2"
                          />
                        </Field>
                        <Field id="user-state" label="State / province">
                          <input
                            id="user-state"
                            name="state"
                            type="text"
                            value={profile.state}
                            onChange={setProfileField}
                            className="input-field !py-2"
                          />
                        </Field>
                        <Field id="user-postal" label="Postal code">
                          <input
                            id="user-postal"
                            name="postal_code"
                            type="text"
                            value={profile.postal_code}
                            onChange={setProfileField}
                            className="input-field !py-2"
                          />
                        </Field>
                        <Field id="user-country" label="Country">
                          <input
                            id="user-country"
                            name="country"
                            type="text"
                            value={profile.country}
                            onChange={setProfileField}
                            className="input-field !py-2"
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Records</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <RecordRow
                    icon={ChatBubbleLeftRightIcon}
                    title="Chat logs"
                    hint="AI tutor conversation history"
                    onClick={() => setNested('chat')}
                  />
                  <RecordRow
                    icon={ClipboardDocumentListIcon}
                    title="Teacher check-ins"
                    hint="Confidential check-in log"
                    onClick={() => setNested('checkins')}
                  />
                  <RecordRow
                    icon={DocumentTextIcon}
                    title="Transcript"
                    hint="Formal transcript with planned credits"
                    onClick={() => goTo(`/admin/user/${user.id}/transcript`)}
                  />
                  <RecordRow
                    icon={AcademicCapIcon}
                    title="Transfer credits"
                    hint="Import credits from external transcripts"
                    onClick={() => goTo(`/admin/user/${user.id}/transfer-credits`)}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                User ID <span className="font-mono text-gray-500">{user.id}</span>
              </p>
            </div>
          )}

          {activeTab === 'access' && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="user-role" className="block text-sm font-medium text-gray-700">
                    Platform role
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowGlossary((v) => !v)}
                    aria-expanded={showGlossary}
                    className="text-xs font-medium text-optio-purple hover:underline inline-flex items-center gap-1"
                  >
                    <QuestionMarkCircleIcon className="w-4 h-4" />
                    What do these mean?
                  </button>
                </div>
                <select
                  id="user-role"
                  value={access.role}
                  onChange={(e) => setAccess((prev) => ({ ...prev, role: e.target.value }))}
                  className="input-field !py-2 min-h-[44px]"
                >
                  {PLATFORM_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {showGlossary && (
                  <dl className="mt-2 p-3 bg-optio-purple/5 rounded-lg text-sm text-gray-600 space-y-1">
                    {ROLE_GLOSSARY.map(([name, description]) => (
                      <div key={name}>
                        <dt className="inline font-medium text-gray-900">{name}: </dt>
                        <dd className="inline">{description}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <Field id="user-org" label="Organization">
                <select
                  id="user-org"
                  value={access.organization_id}
                  onChange={(e) => setAccess((prev) => ({ ...prev, organization_id: e.target.value }))}
                  className="input-field !py-2 min-h-[44px]"
                >
                  <option value="">No organization</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Determines which quests the user can see, via the organization's visibility policy.
                </p>
              </Field>

              <Field id="user-org-role" label="Organization role">
                <select
                  id="user-org-role"
                  value={access.org_role}
                  onChange={(e) => setAccess((prev) => ({ ...prev, org_role: e.target.value }))}
                  disabled={!access.organization_id}
                  className="input-field !py-2 min-h-[44px] disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {ORG_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {access.organization_id
                    ? "The user's role inside their organization. Applies when the platform role is Organization Managed."
                    : 'Assign an organization first.'}
                </p>
              </Field>

              <div className="pt-4 border-t border-gray-200 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Account state</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() =>
                      setConfirm({
                        title: 'Verify this email?',
                        body: `${user.email} will be marked verified and can sign in without confirming.`,
                        confirmLabel: 'Verify email',
                        run: async () => {
                          await api.post(`/api/admin/users/${user.id}/verify-email`, {})
                          toast.success('Email verified')
                          onSave()
                        },
                      })
                    }
                  >
                    Verify email
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() =>
                      setConfirm({
                        title: 'Reset password?',
                        node: (
                          <>
                            <p>
                              The password for {displayName} will be set to{' '}
                              <code className="font-mono font-semibold text-gray-900">changeme!</code>
                            </p>
                            <p>Share it with them and have them change it after signing in.</p>
                          </>
                        ),
                        confirmLabel: 'Reset password',
                        destructive: true,
                        run: async () => {
                          const { data } = await api.post(`/api/admin/users/${user.id}/reset-password`, {})
                          toast.success(`Password reset to "${data?.new_password || 'changeme!'}"`)
                          onSave()
                        },
                      })
                    }
                  >
                    Reset password
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'people' && <UserPeopleTab user={user} />}
        </div>
      </Modal>

      {nested === 'chat' && <ChatLogsModal user={user} onClose={() => setNested(null)} />}
      {nested === 'checkins' && (
        <CheckinHistoryModal
          studentId={user.id}
          studentName={displayName}
          onClose={() => setNested(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onConfirm={async () => {
          try {
            await confirm.run()
          } catch (error) {
            if (error?.response) {
              toast.error(error.response?.data?.error || 'Action failed')
            }
            throw error
          }
        }}
      >
        {confirm?.node || <p>{confirm?.body}</p>}
      </ConfirmDialog>
    </>
  )
}

export default memo(UserDetailsModal)
