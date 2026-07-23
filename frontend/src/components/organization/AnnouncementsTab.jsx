import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { MegaphoneIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import TemplateControls from '../announcements/TemplateControls'

const ROLE_OPTIONS = [
  { value: 'students', label: 'Students' },
  { value: 'advisors', label: 'Teachers' },
  { value: 'parents', label: 'Parents' },
]

/**
 * AnnouncementsTab - org admin sends a broadcast notification to everyone in the
 * org (students, advisors, and/or parents). Delivery is via Optio notifications.
 */
export default function AnnouncementsTab({ orgId }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [audiences, setAudiences] = useState(['students', 'advisors', 'parents'])
  const [sending, setSending] = useState(false)

  const toggleAudience = (value) => {
    setAudiences((prev) =>
      prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]
    )
  }
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [orgId])

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/api/announcements', { params: { organization_id: orgId } })
      if (data.success) setAnnouncements(data.announcements || [])
    } catch (e) {
      // Silent: history is supplementary.
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and message are required')
      return
    }
    if (audiences.length === 0) {
      toast.error('Select at least one audience')
      return
    }
    try {
      setSending(true)
      const { data } = await api.post('/api/announcements', {
        organization_id: orgId,
        title: title.trim(),
        content: content.trim(),
        audiences,
      })
      if (data.success) {
        toast.success(`Sent to ${data.sent} ${data.sent === 1 ? 'person' : 'people'}`)
        setTitle('')
        setContent('')
        setAudiences(['students', 'advisors', 'parents'])
        load()
      } else {
        toast.error(data.error || 'Failed to send')
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Composer */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MegaphoneIcon className="w-5 h-5 text-optio-purple" />
            New announcement
          </h3>
          <TemplateControls
            orgId={orgId}
            title={title}
            body={content}
            onApply={({ title: t, body: b }) => {
              setTitle(t)
              setContent(b)
            }}
          />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="Write your announcement…"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-y"
        />
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-gray-600">Send to</span>
          {ROLE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={audiences.includes(o.value)}
                onChange={() => toggleAudience(o.value)}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
              {o.label}
            </label>
          ))}
          <button
            onClick={send}
            disabled={sending || !title.trim() || !content.trim() || audiences.length === 0}
            className="ml-auto px-5 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send announcement'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Recipients get an in-app notification, a push notification on mobile, and an email copy.
        </p>
      </div>

      {/* History */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent announcements</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-gray-400">No announcements yet.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-medium text-gray-900">{a.title}</h4>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.content}</p>
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-optio-purple/10 text-optio-purple rounded capitalize">
                  {a.target_audience}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
