import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// The three staff roles a link can be narrowed to. No checkboxes ticked =
// everyone with the dashboard sees it.
const ROLE_OPTIONS = [
  ['org_admin', 'Admins'],
  ['campus_coordinator', 'Coordinators'],
  ['advisor', 'Teachers'],
]

/**
 * Quick links — the coordinator dashboard's obvious-links area (iCreate,
 * 2026-08-09: "configurable by role so we can change them without
 * programming"). Stored in feature_flags.sis_settings.quick_links as
 * [{label, url, roles}]; the dashboard filters by the viewer's roles.
 */
const QuickLinksCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [links, setLinks] = useState(settings.quick_links || [])
  const [saving, setSaving] = useState(false)

  const setLink = (i, patch) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const toggleRole = (i, role) => setLinks((ls) => ls.map((l, j) => {
    if (j !== i) return l
    const roles = new Set(l.roles || [])
    if (roles.has(role)) roles.delete(role); else roles.add(role)
    return { ...l, roles: [...roles] }
  }))

  const save = async () => {
    const cleaned = links
      .map((l) => ({
        label: (l.label || '').trim(),
        url: (l.url || '').trim(),
        roles: (l.roles || []).length ? l.roles : undefined,
      }))
      .filter((l) => l.label && l.url)
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, quick_links: cleaned.length ? cleaned : null },
        },
      })
      setLinks(cleaned)
      toast.success('Quick links saved')
      onUpdate && onUpdate()
    } catch {
      toast.error('Could not save the quick links')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-neutral-900">Dashboard quick links</h2>
      <p className="text-xs text-neutral-500 mt-0.5 mb-3">
        Links shown at the top of the staff dashboard (e.g. Opening Checklist, Emergency
        Procedures). Tick roles to narrow who sees a link; no ticks means everyone.
      </p>
      <div className="space-y-3">
        {links.map((l, i) => (
          <div key={i} className="rounded-lg border border-gray-100 p-2 space-y-2">
            <div className="flex items-center gap-2">
              <input className={`${field} flex-1`} value={l.label || ''}
                onChange={(e) => setLink(i, { label: e.target.value })} placeholder="Label" />
              <input className={`${field} flex-1`} value={l.url || ''}
                onChange={(e) => setLink(i, { url: e.target.value })} placeholder="/resources or https://…" />
              <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                className="text-neutral-400 hover:text-red-500 text-lg leading-none px-1" aria-label="Remove link">×</button>
            </div>
            <div className="flex items-center gap-4 pl-1">
              {ROLE_OPTIONS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" checked={(l.roles || []).includes(value)}
                    onChange={() => toggleRole(i, value)}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => setLinks((ls) => [...ls, { label: '', url: '', roles: [] }])}
          className="text-sm font-medium text-optio-purple hover:underline">+ Add link</button>
        <button onClick={save} disabled={saving}
          className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default QuickLinksCard
