import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * CreditFeedbackThread - two-way conversation on a credit submission. Used on both
 * the student's view of their work and the reviewer's Credit Review dashboard.
 * Reviewer messages are shown to students as coming from "Optio".
 */
export default function CreditFeedbackThread({ completionId }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (completionId) load()
  }, [completionId])

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await api.get(`/api/credit/${completionId}/messages`)
      if (data.success) setMessages(data.messages || [])
    } catch (e) {
      // Silent: thread is supplementary.
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    const text = body.trim()
    if (!text) return
    try {
      setSending(true)
      const { data } = await api.post(`/api/credit/${completionId}/messages`, { body: text })
      if (data.success) {
        setBody('')
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

  if (!completionId) return null

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Feedback conversation</h4>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-400 mb-2">No messages yet. Ask a question or leave a note.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.is_mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.is_mine ? 'bg-optio-purple text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className={`text-xs mb-0.5 ${m.is_mine ? 'text-white/70' : 'text-gray-500'}`}>
                  {m.author_name}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Write a reply…"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-y"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity disabled:opacity-40 self-end"
        >
          Send
        </button>
      </div>
    </div>
  )
}
