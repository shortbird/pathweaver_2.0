import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../../services/api'

/**
 * The Blocks panel: superadmin per-org building-block toggles
 * (ARCHITECTURE_BLOCKS section 4.7). Registry-driven -- rows come from
 * GET /api/admin/organizations/:id/modules, writes go through
 * PATCH .../modules (server-side merge into feature_flags.modules only;
 * dependencies validated there with a 409 naming the conflict).
 *
 * Row states: core rows are locked on; AI is controlled by the AI settings
 * (dedicated consent columns); a row whose parent is off is greyed with the
 * reason. "set" marks an explicit entry (vs the registry/legacy default).
 */

const CATEGORY_LABELS = {
  learning: 'Learning',
  credentials: 'Credentials',
  ai: 'AI Tools',
  people: 'People & Enrollment',
  operations: 'School Operations',
  community: 'Community & Communication',
}
const CATEGORY_ORDER = ['learning', 'credentials', 'ai', 'people', 'operations', 'community']

const TIER_BADGES = { finance: 'Finance', hr: 'HR', admin: 'Front office' }

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-optio-purple' : 'bg-gray-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-1'
      }`} />
    </button>
  )
}

export default function OrgBlocksPanel({ organization, onClose, onChanged }) {
  const [modules, setModules] = useState(null)
  const [error, setError] = useState(null)
  const [savingKey, setSavingKey] = useState(null)

  useEffect(() => {
    let alive = true
    api.get(`/api/admin/organizations/${organization.id}/modules`)
      .then(({ data }) => { if (alive) setModules(data.modules) })
      .catch((e) => { if (alive) setError(e.response?.data?.error || 'Failed to load blocks') })
    return () => { alive = false }
  }, [organization.id])

  const toggle = async (key, row) => {
    setSavingKey(key)
    setError(null)
    try {
      const { data } = await api.patch(
        `/api/admin/organizations/${organization.id}/modules`,
        { [key]: !row.effective },
      )
      setModules(data.modules)
      onChanged?.()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update block')
    } finally {
      setSavingKey(null)
    }
  }

  const byCategory = {}
  if (modules) {
    for (const [key, row] of Object.entries(modules)) {
      ;(byCategory[row.category] ||= []).push([key, row])
    }
    for (const rows of Object.values(byCategory)) {
      rows.sort((a, b) => a[1].name.localeCompare(b[1].name))
    }
  }

  // Portaled to document.body so a transformed ancestor can never trap the
  // fixed backdrop (src/tests/modalPortalGuard.test.js).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">Building blocks</h2>
            <p className="text-sm text-gray-500">{organization.name}</p>
          </div>
          <button onClick={onClose} className="btn-quiet px-3 py-1.5">Close</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!modules && !error && (
          <div className="px-6 py-10 text-center text-sm text-gray-500">Loading blocks…</div>
        )}

        {modules && CATEGORY_ORDER.filter((c) => byCategory[c]).map((category) => (
          <div key={category} className="px-6 py-4">
            <div className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {CATEGORY_LABELS[category] || category}
            </div>
            <div className="divide-y divide-gray-50">
              {byCategory[category].map(([key, row]) => {
                const isCore = row.default === 'core'
                const isAi = row.gate === 'ai_columns'
                const blocked = row.blocked_by_parent
                return (
                  <div key={key} className={`flex items-center gap-3 py-2.5 ${blocked ? 'opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{row.name}</span>
                        {TIER_BADGES[row.min_tier] && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {TIER_BADGES[row.min_tier]}
                          </span>
                        )}
                        {row.raw !== null && !isCore && (
                          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-optio-purple">
                            set
                          </span>
                        )}
                      </div>
                      {row.blocks.length > 0 && (
                        <div className="truncate text-xs text-gray-500">
                          Includes: {row.blocks.join(', ')}
                        </div>
                      )}
                      {blocked && (
                        <div className="text-xs text-amber-600">Off with the SIS — turn the SIS block on first</div>
                      )}
                      {row.requires.length > 0 && !blocked && (
                        <div className="text-xs text-gray-400">Requires: {row.requires.join(', ')}</div>
                      )}
                    </div>
                    {isCore ? (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Core</span>
                    ) : isAi ? (
                      <span className="text-[11px] text-gray-400">AI settings</span>
                    ) : (
                      <Toggle
                        checked={row.effective}
                        disabled={savingKey === key || blocked}
                        onChange={() => toggle(key, row)}
                        label={`Toggle ${row.name} for ${organization.name}`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
