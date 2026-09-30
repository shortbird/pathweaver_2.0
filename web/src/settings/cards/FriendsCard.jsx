import React, { useEffect, useState } from 'react'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { getOrgFriendsSettings, setOrgFriendsSettings } from '../../services/friendsAPI'

/**
 * Friends for students the school answers for: the org's default for every
 * student with no parent linked (peer_policy_service.effective_policy, step
 * 3). A linked parent's own choice always wins, so this card never reaches a
 * child whose family has a say.
 *
 * The API (GET/PUT /api/connections/org/settings) shipped with Friends on
 * 2026-09-16 with no screen in front of it, so a school whose students have
 * no parent accounts had no way to turn Friends on. Apogee Odessa found that
 * on 2026-09-29, wanting two students to share a project with Collaborate.
 *
 * Org admins only (require_org_admin): a campus coordinator's read is a 403,
 * and the card renders nothing rather than an error.
 */
function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-optio-purple' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-1'
      }`} />
    </button>
  )
}

export default function FriendsCard({ orgId }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Promise.resolve first, so a read that throws before it returns a promise
    // lands in the catch too: this card must never break the settings page.
    Promise.resolve()
      .then(() => getOrgFriendsSettings(orgId))
      .then((s) => { if (!cancelled) setSettings(s) })
      .catch(() => { if (!cancelled) setSettings(false) })
    return () => { cancelled = true }
  }, [orgId])

  if (!settings) return null

  const save = async (patch) => {
    setSaving(true)
    try {
      setSettings(await setOrgFriendsSettings(orgId, patch))
    } catch (error) {
      alert(error.response?.data?.error || 'Could not save the Friends setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Friends</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <UserGroupIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-medium text-gray-900">Turn on Friends for students</span>
              <Switch
                checked={settings.default_enabled}
                onChange={() => save({ default_enabled: !settings.default_enabled })}
                disabled={saving}
                label="Turn on Friends for students"
              />
            </div>
            <p className="text-xs text-gray-500">
              Students can add each other as friends, see each other&apos;s work, and use
              Collaborate to invite a friend onto a quest they built. Applies to students
              without a parent account; a parent&apos;s own setting always wins.
            </p>
          </div>
        </div>
        {settings.default_enabled && (
          <div className="flex items-start gap-3 pl-12">
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-gray-900">Find anyone at the school</span>
                <Switch
                  checked={settings.school_pool}
                  onChange={() => save({ school_pool: !settings.school_pool })}
                  disabled={saving}
                  label="Find anyone at the school"
                />
              </div>
              <p className="text-xs text-gray-500">
                Off, students add classmates or share a friend code. On, they can also pick
                anyone at the school from a list.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
