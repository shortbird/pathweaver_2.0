import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * TemplateControls - unobtrusive template picker + "Save as template" for the
 * announcement composers (AnnouncementsTab, SIS FamilyMessagingPage).
 *
 * Templates live in organizations.feature_flags.sis_settings.message_templates
 * via GET/PUT /api/announcements/templates (org_admin + superadmin).
 *
 * Props:
 *   orgId    - organization id (passed through to the API)
 *   title    - current composer title (for Save as template)
 *   body     - current composer body (for Save as template)
 *   onApply  - ({ title, body }) => void, fills the composer
 */
export default function TemplateControls({ orgId, title, body, onApply }) {
  const [templates, setTemplates] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/announcements/templates', {
        params: orgId ? { organization_id: orgId } : {},
      })
      if (data.success) {
        setTemplates(data.templates || [])
        setAllowed(true)
      }
    } catch (e) {
      // Advisors (403) or errors: hide template controls entirely.
      setAllowed(false)
    } finally {
      setLoaded(true)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const applyTemplate = (id) => {
    const t = templates.find((x) => x.id === id)
    if (t) onApply({ title: t.title || '', body: t.body || '' })
  }

  const saveAsTemplate = async () => {
    if (!title?.trim() && !body?.trim()) {
      toast.error('Write a title or message first')
      return
    }
    const name = window.prompt('Template name:', title?.trim()?.slice(0, 60) || '')
    if (!name || !name.trim()) return
    try {
      setSaving(true)
      const next = [
        ...templates,
        { name: name.trim(), title: title?.trim() || '', body: body || '' },
      ]
      const { data } = await api.put('/api/announcements/templates', {
        organization_id: orgId,
        templates: next,
      })
      if (data.success) {
        setTemplates(data.templates || next)
        toast.success('Template saved')
      } else {
        toast.error(data.error || 'Failed to save template')
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded || !allowed) return null

  return (
    <div className="flex flex-wrap items-center gap-3">
      {templates.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => {
            applyTemplate(e.target.value)
            e.target.value = ''
          }}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-optio-purple max-w-[14rem]"
          aria-label="Use a template"
        >
          <option value="" disabled>
            Use a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={saveAsTemplate}
        disabled={saving}
        className="text-sm text-optio-purple hover:underline disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save as template'}
      </button>
    </div>
  )
}
