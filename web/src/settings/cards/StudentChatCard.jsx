import React, { useEffect, useState } from 'react'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * The school's Student Chat switch (the `student_chat` module).
 *
 * Ticket 81cc92e6, from Horizon: "An option to turn off in-app chat would
 * help, because it can pull students away from their work and bury teacher
 * feedback." Off, the school's students lose class Student Chats and friend
 * DMs; every message from a teacher or the school still reaches them
 * (backend/services/student_chat_service.py). Nothing is deleted, so turning
 * it back on brings every chat back.
 *
 * Not gated on the module itself: the card is how a school turns it back on.
 * Org admins only (GET/PUT /api/messages/student-chat/settings is
 * require_org_admin); a campus coordinator's read is a 403 and the card
 * renders nothing rather than an error.
 */
const unwrap = (res) => res.data?.data ?? res.data ?? {}
const params = (orgId) => (orgId ? { organization_id: orgId } : {})

export const getStudentChatSettings = (orgId) =>
  api.get('/api/messages/student-chat/settings', { params: params(orgId) }).then(unwrap)

export const setStudentChatEnabled = (orgId, enabled) =>
  api.put('/api/messages/student-chat/settings', { enabled, ...params(orgId) }).then(unwrap)

export default function StudentChatCard({ orgId }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Promise.resolve first, so a read that throws before it returns a promise
    // lands in the catch too: this card must never break the settings page.
    Promise.resolve()
      .then(() => getStudentChatSettings(orgId))
      .then((s) => { if (!cancelled) setSettings(s) })
      .catch(() => { if (!cancelled) setSettings(false) })
    return () => { cancelled = true }
  }, [orgId])

  if (!settings) return null

  const toggle = async () => {
    setSaving(true)
    try {
      setSettings(await setStudentChatEnabled(orgId, !settings.enabled))
    } catch (error) {
      alert(error.response?.data?.error || 'Could not save the Student chat setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">Student chat</h2>
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-optio-purple/10">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-optio-purple" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-medium text-gray-900">Student chat</span>
              <button
                onClick={toggle}
                disabled={saving}
                role="switch"
                aria-checked={Boolean(settings.enabled)}
                aria-label="Student chat"
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  settings.enabled ? 'bg-optio-purple' : 'bg-gray-300'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  settings.enabled ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              When off, students cannot see or send messages in class or group chats or to
              friends. Messages from teachers and the school still reach them.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
