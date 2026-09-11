import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { storiesApi } from '../../../services/storiesApi'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { CONSENT_SCOPES, CONSENT_SOURCES } from './storyEditorState'

/**
 * Read a consent row in either shape the API uses: the normalized
 * `{ active, scope: {...} }` the eligibility endpoint returns, or a raw row
 * with `scope_work` style columns. Returns the granted scope keys in display
 * order, and nothing when the consent is not active.
 */
export const grantedScopes = (consent) => {
  if (!consent) return []
  const active = consent.active ?? !consent.revoked_at
  if (!active) return []
  const scope = consent.scope || {}
  return CONSENT_SCOPES
    .filter(({ key }) => scope[key] ?? consent[`scope_${key}`])
    .map(({ key }) => key)
}

const scopeLabel = (key) => CONSENT_SCOPES.find(s => s.key === key)?.label.toLowerCase() || key

const sourceLabel = (value) => CONSENT_SOURCES.find(s => s.value === value)?.label || value

/**
 * The consent chip and the inline record-consent form, shared by the grader
 * panel and the story editor so the two never disagree on what "consent on
 * file" means.
 *
 * Two tiers, and the chip is the reader's only warning which one applies:
 * green means the story may use what the listed scopes allow; grey means it
 * publishes fully anonymized. Recording is a superadmin acting on a parent's
 * or adult student's word, so the source and its reference are required --
 * the row must say where the permission came from, not just that it exists.
 */
const StoryConsentPanel = ({ studentUserId, consent, onChange, disabled = false }) => {
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    work: true, first_name: false, image_voice: false, age: false,
    source: 'written', source_ref: '', notes: '',
  })

  const scopes = grantedScopes(consent)
  const active = scopes.length > 0

  const save = async (e) => {
    e?.preventDefault?.()
    if (!studentUserId) { toast.error('No student to record consent for'); return }
    if (!form.source_ref.trim()) { toast.error('Say where the consent came from (source reference)'); return }
    setSaving(true)
    try {
      const res = await storiesApi.recordConsent({
        studentUserId,
        scope: {
          work: form.work, first_name: form.first_name,
          image_voice: form.image_voice, age: form.age,
        },
        source: form.source,
        sourceRef: form.source_ref.trim(),
        notes: form.notes.trim() || null,
      })
      onChange?.(res?.consent || null)
      setOpen(false)
      toast.success('Consent recorded')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record consent')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async () => {
    const id = consent?.id
    if (!id) return
    const ok = await confirm({
      title: 'Revoke this consent?',
      body: 'Every published story that names this student is unpublished and the site is rebuilt.',
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    setSaving(true)
    try {
      const res = await storiesApi.revokeConsent(id)
      onChange?.(res?.consent || null)
      toast.success('Consent revoked')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not revoke consent')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2" data-testid="story-consent-panel">
      <div className="flex items-center gap-2 flex-wrap">
        {active ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1">
            Consent on file: {scopes.map(scopeLabel).join(', ')}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1">
            No consent recorded. The story publishes anonymized.
          </span>
        )}
        {active && consent?.id && !disabled && (
          <button
            type="button"
            onClick={revoke}
            disabled={saving}
            className="text-xs font-medium text-gray-500 hover:text-red-700 disabled:opacity-50 min-h-[32px] md:min-h-0 touch-manipulation"
          >
            Revoke
          </button>
        )}
        {!active && !disabled && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 touch-manipulation"
          >
            {open ? 'Cancel' : 'Record consent'}
          </button>
        )}
      </div>

      {active && (consent?.source || consent?.granted_at) && (
        <p className="text-[11px] text-gray-400">
          {[
            consent.source && `Source: ${sourceLabel(consent.source)}`,
            consent.approver_kind && `by ${String(consent.approver_kind).replace(/_/g, ' ')}`,
            consent.granted_at && new Date(consent.granted_at).toLocaleDateString(),
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {open && !active && (
        <form
          onSubmit={save}
          aria-label="Record consent"
          className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3"
        >
          <fieldset>
            <legend className="text-xs font-medium text-gray-700 mb-1.5">Scope granted</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {CONSENT_SCOPES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="rounded text-optio-purple focus:ring-optio-purple"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="consent-source" className="block text-xs font-medium text-gray-700 mb-1">Source</label>
              <select
                id="consent-source"
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
              >
                {CONSENT_SOURCES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="consent-source-ref" className="block text-xs font-medium text-gray-700 mb-1">Source reference</label>
              <input
                id="consent-source-ref"
                type="text"
                value={form.source_ref}
                onChange={e => setForm(f => ({ ...f, source_ref: e.target.value }))}
                placeholder="Email date, form id, agreement version"
                className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
              />
            </div>
          </div>

          <div>
            <label htmlFor="consent-notes" className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              id="consent-notes"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-quiet">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save consent'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default StoryConsentPanel
