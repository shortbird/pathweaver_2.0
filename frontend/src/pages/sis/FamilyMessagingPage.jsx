import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * Compose an announcement to families/students/advisors. Reuses the existing
 * /api/announcements endpoint (in-app bell + push + the durable announcements
 * row); no new backend needed. "Families" maps to the parents audience.
 */
const AUDIENCES = [
  { key: 'parents', label: 'Families' },
  { key: 'students', label: 'Students' },
  { key: 'advisors', label: 'Teachers' },
]

const FamilyMessagingPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audiences, setAudiences] = useState(['parents'])
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const toggle = (key) => {
    setAudiences((a) => (a.includes(key) ? a.filter((x) => x !== key) : [...a, key]))
  }

  const loadHistory = useCallback(() => {
    if (!orgId) { setLoadingHistory(false); return }
    setLoadingHistory(true)
    api.get('/api/announcements', { params: { organization_id: orgId } })
      .then((r) => { if (r.data?.success) setHistory(r.data.announcements || []) })
      .catch(() => { /* history is supplementary; stay silent */ })
      .finally(() => setLoadingHistory(false))
  }, [orgId])

  useEffect(() => { loadHistory() }, [loadHistory])

  const send = async () => {
    if (!title.trim() || !message.trim()) { toast.error('Title and message are required'); return }
    if (!audiences.length) { toast.error('Pick at least one audience'); return }
    if (!orgId) { toast.error('No organization selected'); return }
    setSending(true)
    try {
      await api.post('/api/announcements', {
        title: title.trim(),
        message: message.trim(),
        audiences,
        organization_id: orgId,
      })
      toast.success('Announcement sent')
      setTitle('')
      setMessage('')
      loadHistory()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Messaging</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <p className="text-sm text-neutral-500 mb-5">
          Send an announcement to your school. It is delivered in-app (notification bell)
          and via push to everyone in the selected audiences.
        </p>

        <label className="block text-xs font-medium text-neutral-500 mb-1">Audience</label>
        <div className="flex gap-2 mb-4">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              onClick={() => toggle(a.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                audiences.includes(a.key)
                  ? 'bg-optio-purple text-white border-optio-purple'
                  : 'bg-white text-neutral-600 border-gray-300 hover:border-optio-purple'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-neutral-500 mb-1">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mb-4`} placeholder="Subject line" />

        <label className="block text-xs font-medium text-neutral-500 mb-1">Message</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className={`${field} mb-5`} placeholder="Write your announcement…" />

        <Button onClick={send} loading={sending}>Send announcement</Button>
      </div>

      <div className="max-w-2xl mt-8">
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Recent announcements</h2>
        {loadingHistory ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-neutral-400">No announcements yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((a) => (
              <div key={a.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-neutral-900">{a.title}</h3>
                  <span className="text-xs text-neutral-400 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-neutral-600 mt-1 whitespace-pre-wrap">{a.content}</p>
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-optio-purple/10 text-optio-purple rounded capitalize">
                  {(a.target_audience || '').replace(/,/g, ', ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FamilyMessagingPage
