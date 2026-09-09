import React, { useState, useEffect, useCallback } from 'react'
import api, { oeaAPI } from '../../services/api'
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

  // Who has opened the video. The video is hosted off-platform and opens in a
  // new tab, so this counts the click and nothing more — the copy says "opened",
  // never "watched", because playback is not something the platform can see.
  const [videoViews, setVideoViews] = useState(null)
  const [showVideoViewers, setShowVideoViewers] = useState(false)
  const loadVideoViews = useCallback(async () => {
    try {
      const { data } = await oeaAPI.helpVideoViews()
      setVideoViews(data)
    } catch {
      setVideoViews(null)
    }
  }, [])
  useEffect(() => {
    if (program?.helpVideoConfigurable) loadVideoViews()
  }, [program?.helpVideoConfigurable, loadVideoViews])
  // Where the video is hosted, for the "we can't see playback" note. A saved URL
  // is validated as http(s) on the way in, but this renders inside the card, so
  // a bad one must degrade rather than blank the settings page.
  let videoHost = null
  try {
    if (videoViews?.help_video_url) {
      videoHost = new URL(videoViews.help_video_url).hostname.replace(/^www\./, '')
    }
  } catch { /* unparseable URL — fall back to the generic wording */ }

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

      {videoViews?.help_video_url && videoViews.parent_count > 0 && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {videoViews.opened_count} of {videoViews.parent_count} parents have opened it
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Counts parents who clicked through to the video. It plays
                {videoHost ? ` on ${videoHost}` : ' off-platform'}, so we can't tell how
                much of it they watched.
              </p>
            </div>
            <button
              onClick={() => setShowVideoViewers((v) => !v)}
              className="shrink-0 text-sm font-medium text-optio-purple"
            >
              {showVideoViewers ? 'Hide list' : 'See who'}
            </button>
          </div>

          <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-gradient-primary rounded-full"
              style={{ width: `${Math.round((videoViews.opened_count / videoViews.parent_count) * 100)}%` }}
            />
          </div>

          {showVideoViewers && (
            <ul className="mt-3 max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {videoViews.parents.map((pt) => (
                <li key={pt.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900 truncate">{pt.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{pt.email}</span>
                  </span>
                  <span className={`shrink-0 text-xs ${pt.opened ? 'text-gray-500' : 'text-amber-600 font-medium'}`}>
                    {pt.opened
                      ? `Opened ${new Date(pt.first_opened_at).toLocaleDateString()}`
                      : 'Not opened'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
