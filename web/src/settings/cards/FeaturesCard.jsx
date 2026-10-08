import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import * as orgStore from '../../pages/sis/sisOrgStore'
import { useConfirm } from '../../contexts/ConfirmContext'
import { getSchoolFeatures, requestSchoolFeature, setSchoolFeatures } from '../../hooks/api/schoolFeatures'

export { getSchoolFeatures, setSchoolFeatures }

/**
 * The school's own feature switches (docs/MICROSCHOOL_FIRST_PLAN.md part 3).
 *
 * Horizon had every office feature on, used none of them, and only Optio could
 * turn them off. This card lists what a school may decide for itself, each
 * with one plain sentence; the list, the words and the rules come from
 * backend/services/school_features_service.py (GET/PUT /api/school-features).
 *
 * Since 2026-10-08 it lists every option a school has, so a new school that
 * starts small can see the rest (docs/sis/SIS_SIMPLIFICATION.md). What only
 * Optio turns on (Bloomy, AI, credits, prior learning ...) has no switch: it
 * says On when it is, and otherwise an "Ask Optio" button files a ticket.
 *
 * A feature that needs another one says so and stays disabled until that one
 * is on. Turning off a feature that others still use asks first and turns
 * them off with it: Registration used to refuse silently while Tuition was on,
 * because the server's "turn that off first" landed at the top of the card,
 * out of sight (found on localhost, 2026-10-07). Org admins only: a campus coordinator's read is a 403 and the card
 * renders nothing. After a save the org is re-read everywhere it is cached,
 * so the console's sidebar and the other Settings cards follow at once.
 */
// A superadmin's console reads the selected org from the shared picker list;
// an org admin's reads OrganizationContext (refreshed through onLogoChange).
function reloadPickerOrgs() {
  if (!orgStore.getSnapshot().fetched) return
  api.get('/api/admin/organizations')
    .then((r) => orgStore.setOrgs(r.data?.organizations || r.data?.data || (Array.isArray(r.data) ? r.data : [])))
    .catch(() => {})
}

function Switch({ label, checked, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={Boolean(checked)}
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

export default function FeaturesCard({ orgId, onUpdate, onLogoChange }) {
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(null)
  const [problem, setProblem] = useState(null)
  // Features this school has asked Optio for during this visit.
  const [asked, setAsked] = useState({})
  const confirm = useConfirm()

  useEffect(() => {
    let cancelled = false
    // Promise.resolve first, so a read that throws before it returns a promise
    // lands in the catch too: this card must never break the settings page.
    Promise.resolve()
      .then(() => getSchoolFeatures(orgId))
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(false) })
    return () => { cancelled = true }
  }, [orgId])

  if (!data || !Array.isArray(data.features)) return null

  const byKey = Object.fromEntries(data.features.map((f) => [f.key, f]))

  // Every feature that is on and needs `key`, directly or through another.
  const dependentsOf = (key) => {
    const out = []
    const visit = (k) => data.features.forEach((f) => {
      if (f.enabled && (f.requires || []).includes(k) && !out.includes(f)) { out.push(f); visit(f.key) }
    })
    visit(key)
    return out
  }

  const ask = async (feature) => {
    setSaving(feature.key)
    setProblem(null)
    try {
      await requestSchoolFeature(orgId, feature.key)
      setAsked((a) => ({ ...a, [feature.key]: true }))
    } catch (error) {
      setProblem({ key: feature.key, text: error.response?.data?.error || 'Could not send the request. Please try again.' })
    } finally {
      setSaving(null)
    }
  }

  const toggle = async (feature) => {
    const changes = { [feature.key]: !feature.enabled }
    if (feature.enabled) {
      const dependents = dependentsOf(feature.key)
      if (dependents.length) {
        const names = dependents.map((f) => f.name).join(' and ')
        const ok = await confirm({
          title: `Turn off ${feature.name}?`,
          body: `${names} needs ${feature.name}, so it turns off too. Nothing is deleted; turn them back on any time.`,
          confirmLabel: 'Turn off',
          cancelLabel: 'Keep them on',
          destructive: false,
        })
        if (!ok) return
        dependents.forEach((f) => { changes[f.key] = false })
      }
    }
    setSaving(feature.key)
    setProblem(null)
    try {
      setData(await setSchoolFeatures(orgId, changes))
      onUpdate?.()
      onLogoChange?.()
      reloadPickerOrgs()
    } catch (error) {
      setProblem({ key: feature.key, text: error.response?.data?.error || 'Could not save that change. Please try again.' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-1">Features</h2>
      <p className="text-sm text-gray-500 mb-4">
        Turn on what your school uses. Anything you turn off is hidden, not deleted, and comes back when you turn it on.
        Optio turns on the few marked Ask Optio; ask and we will set it up with you.
      </p>
      <div className="space-y-6">
        {data.groups.map((group) => {
          const rows = data.features.filter((f) => f.group === group.key)
          if (!rows.length) return null
          return (
            <section key={group.key}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{group.name}</h3>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {rows.map((f) => {
                  const missing = (f.requires || []).filter((r) => !byKey[r]?.enabled)
                  const needs = missing.map((r) => byKey[r]?.name || r)
                  // A feature that is already on may always be turned off.
                  const blocked = !f.enabled && missing.length > 0
                  return (
                    <li key={f.key} className="flex items-start justify-between gap-3 p-3">
                      <div>
                        <span className="block text-sm font-medium text-gray-900">{f.name}</span>
                        <span className="block text-xs text-gray-500">{f.description}</span>
                        {blocked && (
                          <span className="block text-xs text-amber-700 mt-1">Needs {needs.join(' and ')}</span>
                        )}
                        {problem?.key === f.key && (
                          <span role="alert" className="block text-xs text-red-600 mt-1">{problem.text}</span>
                        )}
                      </div>
                      {f.switchable === false ? (
                        f.enabled ? (
                          <span className="shrink-0 text-xs font-semibold text-optio-purple">On</span>
                        ) : asked[f.key] ? (
                          <span className="shrink-0 text-xs text-gray-500">Asked</span>
                        ) : (
                          <button type="button" onClick={() => ask(f)} disabled={saving !== null}
                            className="shrink-0 rounded-lg border border-optio-purple/40 px-2.5 py-1 text-xs font-semibold text-optio-purple hover:bg-optio-purple/5 disabled:opacity-50"
                            aria-label={`Ask Optio to turn on ${f.name}`}>
                            Ask Optio
                          </button>
                        )
                      ) : (
                        <Switch
                          label={f.name}
                          checked={f.enabled}
                          disabled={blocked || saving !== null}
                          onClick={() => toggle(f)}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
