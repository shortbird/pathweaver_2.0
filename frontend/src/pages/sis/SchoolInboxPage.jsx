import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  InboxIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { AttachmentList } from '../../components/communication/MessageParts'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * SchoolInboxPage — the shared "{School Name}" inbox.
 *
 * Every org member sees the school as a contact in their Messages and can
 * write to it; those threads land here. The front office (org admins + campus
 * coordinators) reads and answers them AS the school — the member sees the
 * school's name, while the thread here shows which colleague replied
 * (sent_by_name). Read state is shared: one person opening a thread marks it
 * read for the whole office.
 */
const POLL_LIST_MS = 30000
const POLL_THREAD_MS = 15000

const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const listTime = (timestamp) => {
  if (!timestamp) return ''
  const diffHours = Math.floor((Date.now() - new Date(timestamp)) / (1000 * 60 * 60))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const memberName = (convo) =>
  `${convo.other_user?.first_name || ''} ${convo.other_user?.last_name || ''}`.trim() ||
  convo.other_user?.display_name || 'Member'

const SchoolInboxPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [conversations, setConversations] = useState([])
  const [inboxUserId, setInboxUserId] = useState(null)
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  const loadConversations = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    api.get(withOrg('/api/school-inbox/conversations', isSuperadmin ? orgId : null))
      .then((r) => {
        const data = r.data?.data || {}
        setConversations(data.conversations || [])
        setInboxUserId(data.inbox_user_id || null)
        setOrgName(data.organization?.name || '')
      })
      .catch((e) => {
        if (!quiet) toast.error(e?.response?.data?.error || 'Could not load the inbox')
      })
      .finally(() => { if (!quiet) setLoading(false) })
  }, [orgId, isSuperadmin])

  useEffect(() => {
    if (isSuperadmin && !orgId) return
    loadConversations()
    const timer = setInterval(() => loadConversations(true), POLL_LIST_MS)
    return () => clearInterval(timer)
  }, [loadConversations, isSuperadmin, orgId])

  const loadMessages = useCallback((conversationId, quiet = false) => {
    if (!conversationId) return
    if (!quiet) setMessagesLoading(true)
    api.get(withOrg(`/api/school-inbox/conversations/${conversationId}`, isSuperadmin ? orgId : null))
      .then((r) => {
        setMessages(r.data?.data?.messages || [])
        // Opening the thread marked it read for the whole office.
        setConversations((prev) => prev.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c))
      })
      .catch((e) => {
        if (!quiet) toast.error(e?.response?.data?.error || 'Could not load the conversation')
      })
      .finally(() => { if (!quiet) setMessagesLoading(false) })
  }, [orgId, isSuperadmin])

  useEffect(() => {
    if (!selected?.id) return
    loadMessages(selected.id)
    const timer = setInterval(() => loadMessages(selected.id, true), POLL_THREAD_MS)
    return () => clearInterval(timer)
  }, [selected?.id, loadMessages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  // Switching orgs (superadmin) resets the open thread.
  useEffect(() => { setSelected(null); setMessages([]) }, [orgId])

  const handleSend = (e) => {
    e?.preventDefault()
    const content = draft.trim()
    if (!content || !selected?.other_user?.id || sending) return
    setSending(true)
    api.post(
      withOrg(`/api/school-inbox/conversations/${selected.other_user.id}/send`, isSuperadmin ? orgId : null),
      { content }
    )
      .then(() => {
        setDraft('')
        loadMessages(selected.id, true)
        loadConversations(true)
      })
      .catch((e2) => toast.error(e2?.response?.data?.error || 'Could not send the reply'))
      .finally(() => setSending(false))
  }

  const totalUnread = conversations.reduce((n, c) => n + (c.unread_count || 0), 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Inbox</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Messages families and staff send to {orgName ? <span className="font-medium">{orgName}</span> : 'the school'} —
            replies go out under the school&apos;s name.
            {totalUnread > 0 && ` ${totalUnread} unread.`}
          </p>
        </div>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="flex h-[72vh] min-h-[440px] bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Thread list */}
        <div className={`w-full md:w-[300px] lg:w-[340px] flex-shrink-0 border-r border-gray-200 flex flex-col ${
          selected ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
                <InboxIcon className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-neutral-700 mb-1">No messages yet</p>
                <p className="text-xs text-neutral-500">
                  When a family or staff member messages the school, the thread shows up here.
                </p>
              </div>
            ) : (
              conversations.map((convo) => {
                const isSelected = selected?.id === convo.id
                const unread = convo.unread_count || 0
                const name = memberName(convo)
                return (
                  <button
                    key={convo.id}
                    onClick={() => setSelected(convo)}
                    className={`w-full px-4 py-3 flex items-center gap-3 border-l-2 transition-colors text-left ${
                      isSelected ? 'bg-optio-purple/5 border-optio-purple' : 'border-transparent hover:bg-gray-50'}`}
                  >
                    <div className="relative flex-shrink-0">
                      {convo.other_user?.avatar_url ? (
                        <img src={convo.other_user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-optio-purple/10 flex items-center justify-center text-optio-purple font-bold">
                          {name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${unread ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800'}`}>
                          {name}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{listTime(convo.last_message_at)}</span>
                      </div>
                      <p className={`text-sm truncate ${unread ? 'text-neutral-800 font-medium' : 'text-neutral-500'}`}>
                        {convo.last_message_preview || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selected ? 'hidden md:flex' : 'flex'}`}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
              <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-neutral-500">Pick a conversation to read and reply as the school.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-full md:hidden flex-shrink-0"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-neutral-900 truncate">{memberName(selected)}</h2>
                  <p className="text-xs text-neutral-500 flex items-center gap-1">
                    <AcademicCapIcon className="w-3.5 h-3.5" />
                    Replying as {orgName || 'the school'}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3 space-y-2">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-neutral-400 py-8">No messages in this thread yet.</p>
                ) : (
                  messages.map((message) => {
                    const fromSchool = message.sender_id === inboxUserId
                    return (
                      <div key={message.id} className={`flex ${fromSchool ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                          fromSchool
                            ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                            : 'bg-white border border-gray-200 text-neutral-900'}`}>
                          {message.message_content && (
                            <p className="text-sm whitespace-pre-wrap break-words">{message.message_content}</p>
                          )}
                          {message.attachments?.length > 0 && (
                            <AttachmentList attachments={message.attachments} light={fromSchool} />
                          )}
                          <p className={`text-[11px] mt-1 ${fromSchool ? 'text-white/70' : 'text-gray-400'}`}>
                            {formatTime(message.created_at)}
                            {fromSchool && message.sent_by_name && ` · Sent by ${message.sent_by_name}`}
                            {/* A member-side message with an author = forwarded in from Optio Support. */}
                            {!fromSchool && message.sent_by_name && ` · Forwarded by ${message.sent_by_name}`}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={endRef} />
              </div>

              <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  rows={1}
                  placeholder={`Reply as ${orgName || 'the school'}...`}
                  className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple max-h-32"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="p-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white disabled:opacity-40"
                  aria-label="Send reply"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SchoolInboxPage
