import React, { useState } from 'react'
import api from '../../services/api'
import { getProgramForSlug } from '../../programs/registry'

/**
 * Program getting-started video (diploma programs opt in via the program
 * registry's helpVideoConfigurable flag). Parents see the video card on the
 * program landing page; while unset they see a "coming soon" placeholder.
 *
 * Extracted from the legacy SettingsTab (blocks P3, settings unification) so
 * both settings surfaces render the same control. Renders nothing for orgs
 * whose program has no configurable video.
 */
export default function HelpVideoCard({ orgId, org, onUpdate }) {
  const program = getProgramForSlug(org?.slug)
  const [helpVideoUrl, setHelpVideoUrl] = useState(
    org?.feature_flags?.oea_settings?.help_video_url || ''
  )
  const [saving, setSaving] = useState(false)

  if (!program?.helpVideoConfigurable) return null

  const save = async () => {
    const url = helpVideoUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      alert('Enter a full URL starting with http:// or https:// (or leave empty to remove the video).')
      return
    }
    setSaving(true)
    try {
      const flags = org?.feature_flags || {}
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...flags,
          oea_settings: { ...(flags.oea_settings || {}), help_video_url: url || null },
        },
      })
      onUpdate?.()
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save the video URL')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Getting-started video</h2>
      <p className="text-gray-600 mb-4 text-sm">
        Shown to parents on the {program.name} page and course tracker. Until a URL is
        saved, parents see a "video coming soon" placeholder. Paste a link to your hosted
        video (YouTube, Vimeo, Loom, etc.) — leave empty and save to remove it.
      </p>
      <div className="flex gap-3">
        <input
          type="url"
          value={helpVideoUrl}
          onChange={(e) => setHelpVideoUrl(e.target.value)}
          placeholder="https://..."
          aria-label="Getting-started video URL"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
        />
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-primary disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
