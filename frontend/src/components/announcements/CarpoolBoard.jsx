import React, { useState } from 'react'
import { TruckIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { FeedSection } from './SchoolCommunity'

/**
 * Carpool board (iCreate, 2026-08-06) — families post ride offers and needs,
 * then arrange between themselves over IN-APP messaging: every post has
 * "Message {name}", addressed by POST id (the author's account id never
 * reaches the client), and the reply lands in Messages on web or the mobile
 * app. No phone numbers on the board, on purpose.
 *
 * Students see the board (it may explain their own ride) but cannot post or
 * message — the backend enforces both; `canPost` only hides the buttons.
 */

const dateLabel = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return '' }
}

const TYPE_BADGE = {
  offer: { label: 'Offering seats', cls: 'bg-optio-purple/10 text-optio-purple' },
  need: { label: 'Looking for a ride', cls: 'bg-optio-pink/10 text-optio-pink' },
}

const EMPTY_FORM = { type: 'offer', message: '', area: '', days: '' }

export default function CarpoolBoard({ posts = [], canPost = false, canModerate = false, onChanged = () => {} }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [composerFor, setComposerFor] = useState(null) // post id with the message box open
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [sentFor, setSentFor] = useState(() => new Set()) // posts already messaged this visit

  if (!posts.length && !canPost) return null

  const submitPost = async (e) => {
    e.preventDefault()
    if (!form.message.trim()) { toast.error('Say what you are offering or looking for'); return }
    setSaving(true)
    try {
      await api.post('/api/sis/community/feed/carpool', form)
      toast.success('Posted to the board')
      setForm(EMPTY_FORM)
      setShowForm(false)
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not post')
    } finally {
      setSaving(false)
    }
  }

  const removePost = async (id) => {
    try {
      await api.delete(`/api/sis/community/feed/carpool/${id}`)
      toast.success('Post removed')
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the post')
    }
  }

  const sendMessage = async (id) => {
    if (!messageText.trim()) { toast.error('Write a message first'); return }
    setSending(true)
    try {
      await api.post(`/api/sis/community/feed/carpool/${id}/message`, { content: messageText.trim() })
      setSentFor((prev) => new Set(prev).add(id))
      setComposerFor(null)
      setMessageText('')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send the message')
    } finally {
      setSending(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent'

  return (
    <FeedSection
      id="board-carpool" title="Carpool" Icon={TruckIcon}
      intro="Offer seats or find a ride with other families. Arranging happens over Messages — right here or in the mobile app."
    >
      {canPost && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-4 px-3.5 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-colors"
        >
          Post a ride offer or need
        </button>
      )}

      {canPost && showForm && (
        <form onSubmit={submitPost} className="mb-4 border border-gray-200 rounded-lg p-4 space-y-3">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            aria-label="Post type"
            className={inputCls}
          >
            <option value="offer">I can offer seats</option>
            <option value="need">We need a ride</option>
          </select>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={3} maxLength={500} required
            placeholder="What are you offering or looking for?"
            aria-label="Carpool message"
            className={inputCls}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="Neighborhood or area" aria-label="Area"
              className={inputCls}
            />
            <input
              value={form.days}
              onChange={(e) => setForm({ ...form, days: e.target.value })}
              placeholder="Days and times (e.g. Tue & Thu mornings)" aria-label="Days"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="btn-primary">
              {saving ? 'Posting…' : 'Post'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-gray-400">No rides posted yet — be the first.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => {
            const badge = TYPE_BADGE[p.type] || TYPE_BADGE.offer
            const firstName = (p.author_name || '').split(' ')[0] || 'them'
            return (
              <article key={p.id} className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{p.author_name}</span>
                  <time className="text-xs text-gray-400 ml-auto">{dateLabel(p.created_at)}</time>
                </div>
                <p className="text-sm text-gray-700 mt-2">{p.message}</p>
                {(p.area || p.days) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {[p.area, p.days].filter(Boolean).join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-3">
                  {!p.mine && canPost && !sentFor.has(p.id) && composerFor !== p.id && (
                    <button
                      onClick={() => { setComposerFor(p.id); setMessageText('') }}
                      className="text-sm font-medium text-optio-purple hover:underline"
                    >
                      Message {firstName}
                    </button>
                  )}
                  {sentFor.has(p.id) && (
                    <span className="text-sm text-gray-500">
                      Sent — replies land in{' '}
                      <Link to="/messages" className="text-optio-purple hover:underline">Messages</Link>.
                    </span>
                  )}
                  {(p.mine || canModerate) && (
                    <button
                      onClick={() => removePost(p.id)}
                      className="text-sm font-medium text-gray-400 hover:text-red-600 ml-auto"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {composerFor === p.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={2} maxLength={2000} autoFocus
                      placeholder={`Write to ${firstName} about this ride…`}
                      aria-label={`Message ${firstName}`}
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendMessage(p.id)} disabled={sending}
                        className="btn-primary"
                      >
                        {sending ? 'Sending…' : 'Send'}
                      </button>
                      <button
                        onClick={() => setComposerFor(null)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </FeedSection>
  )
}
