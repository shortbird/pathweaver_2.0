import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  InboxIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { AttachmentList } from '../../components/communication/MessageParts'
import { splitUrls, hostLabel } from '../../components/announcements/AnnouncementBody'
import AnnouncementComposer from '../../components/sis/AnnouncementComposer'
import SearchSelect from '../../components/ui/SearchSelect'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * SchoolInboxPage — messages and announcements in one place (/inbox).
 *
 * Two tabs (messaging and the inbox merged, 2026-08-31; /messaging redirects
 * here):
 *
 * - Messages. For the front office (org admins + campus coordinators) this is
 *   the shared "{School Name}" inbox: every org member sees the school as a
 *   contact in their Messages and can write to it; those threads land here,
 *   read and answered AS the school — the member sees the school's name, while
 *   the thread here shows which colleague replied (sent_by_name). Read state
 *   is shared: one person opening a thread marks it read for the whole office.
 *   For a teacher this is their OWN thread list (/api/messages — the same
 *   threads as the learning app's Messages), read and answered as themselves:
 *   the inbox teachers didn't have (iCreate, 2026-08-31).
 * - Announcements. The group send that used to live at /messaging — audiences,
 *   class/teacher/age narrowing, optional email. A teacher's send stays scoped
 *   to their own classes by the backend.
 *
 * Under a teacher preview an admin still gets the admin view here: both thread
 * sources only ever answer for the CALLER (no ?teacher_id=), so a "faithful"
 * preview would show the admin's own DMs behind the teacher's name — the same
 * trap hideInPreview guards on My Tasks.
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

// The picker says who somebody is: two Bennetts in a school are a parent and
// a teacher, and only the label tells them apart.
const ROLE_LABELS = {
  student: 'student', parent: 'parent', advisor: 'teacher',
  org_admin: 'admin', campus_coordinator: 'coordinator', observer: 'observer',
}

const memberName = (convo) =>
  `${convo.other_user?.first_name || ''} ${convo.other_user?.last_name || ''}`.trim() ||
  convo.other_user?.display_name || 'Member'

/** Message text with its URLs as short, clickable links (labeled by host).
 * `light` = on the gradient (own-message) bubble. */
const LinkifiedText = ({ text, light }) => (
  <p className="text-sm whitespace-pre-wrap break-words">
    {splitUrls(text).map((s, i) => (s.url ? (
      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}
        className={`underline font-medium ${light ? 'text-white' : 'text-optio-purple'}`}>
        {hostLabel(s.url)}
      </a>
    ) : (
      <React.Fragment key={i}>{s.text}</React.Fragment>
    )))}
  </p>
)

const SchoolInboxPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const { user } = useAuth()
  // Which thread source this caller reads (see the header comment). The
  // backend is the real gate either way: /api/school-inbox/* is ADMIN_ROLES,
  // /api/messages/* answers only for the caller.
  const admin = isSisAdmin(user)
  const [searchParams, setSearchParams] = useSearchParams()
  // Which threads to show. The office's inbox is a work queue: what it needs to
  // know first is who is still waiting on a reply, not what arrived most
  // recently. "A spot for messages to go once they are completed, so that only
  // new messages that haven't been replied to show" (2ca63bde) and "I don't
  // have an outbox really" (7fb34ed4) are the two halves of this one control.
  const [threadView, setThreadView] = useState('open')
  const tab = searchParams.get('tab') === 'announcements' ? 'announcements' : 'messages'
  const setTab = (t) => setSearchParams(t === 'messages' ? {} : { tab: t }, { replace: true })
  const [conversations, setConversations] = useState([])
  const [inboxUserId, setInboxUserId] = useState(null)
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [uploadingAtt, setUploadingAtt] = useState(false)
  // Starting a thread, rather than answering one. The inbox could only ever
  // reply, so reaching ONE family meant an announcement to everybody or a
  // phone call (iCreate, 2026-09-02: "allow us to message an individual person
  // here too").
  const [composing, setComposing] = useState(false)
  const [people, setPeople] = useState([])
  const [pickedPerson, setPickedPerson] = useState('')
  const fileRef = useRef(null)
  const endRef = useRef(null)
  const draftRef = useRef(null)

  // The reply box grows with what is being written. It was a single fixed line
  // with resize turned off, so a long reply — which is most of what the office
  // writes back to a parent — was composed through a one-line window (iCreate,
  // 2026-09-04: "it would be nice to be able to make the 'reply as' field
  // expandable!"). Capped, so a very long reply never pushes the conversation
  // it is answering off the screen; past the cap the box scrolls.
  useEffect(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  // "Me" in a thread: the school for the front office, the teacher themself
  // otherwise.
  const selfId = admin ? inboxUserId : user?.id

  const loadConversations = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    const req = admin
      ? api.get(withOrg('/api/school-inbox/conversations', isSuperadmin ? orgId : null))
      : api.get('/api/messages/conversations')
    req
      .then((r) => {
        const data = r.data?.data || {}
        setConversations(data.conversations || [])
        if (admin) {
          setInboxUserId(data.inbox_user_id || null)
          setOrgName(data.organization?.name || '')
        }
      })
      .catch((e) => {
        if (!quiet) toast.error(e?.response?.data?.error || 'Could not load the inbox')
      })
      .finally(() => { if (!quiet) setLoading(false) })
  }, [orgId, isSuperadmin, admin])

  useEffect(() => {
    if (tab !== 'messages') return
    if (admin && isSuperadmin && !orgId) return
    loadConversations()
    const timer = setInterval(() => loadConversations(true), POLL_LIST_MS)
    return () => clearInterval(timer)
  }, [loadConversations, isSuperadmin, orgId, admin, tab])

  useEffect(() => {
    if (!composing || !admin || people.length) return
    api.get(withOrg('/api/sis/roster', isSuperadmin ? orgId : null))
      .then((r) => setPeople(r.data?.roster || []))
      .catch(() => toast.error('Could not load the school directory'))
  }, [composing, admin, isSuperadmin, orgId, people.length])

  // Open a thread with somebody who has never written in. It has no
  // conversation id until the first message lands, which handleSend adopts
  // from the response.
  const startThread = (person) => {
    setSelected({
      id: null,
      other_user: {
        id: person.student_id,
        first_name: person.first_name,
        last_name: person.last_name,
        display_name: person.name,
        avatar_url: person.avatar_url,
      },
    })
    setMessages([])
    setComposing(false)
    setPickedPerson('')
  }

  const loadMessages = useCallback((conversationId, quiet = false) => {
    if (!conversationId) return
    if (!quiet) setMessagesLoading(true)
    const url = admin
      ? withOrg(`/api/school-inbox/conversations/${conversationId}`, isSuperadmin ? orgId : null)
      : `/api/messages/conversations/${conversationId}`
    api.get(url)
      .then((r) => {
        setMessages(r.data?.data?.messages || [])
        // The school inbox marks the thread read on GET; a teacher's own
        // thread needs the explicit mark (same as the learning app).
        if (!admin) {
          api.post(`/api/messages/conversations/${conversationId}/read`, {}).catch(() => {})
        }
        setConversations((prev) => prev.map((c) =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c))
      })
      .catch((e) => {
        if (!quiet) toast.error(e?.response?.data?.error || 'Could not load the conversation')
      })
      .finally(() => { if (!quiet) setMessagesLoading(false) })
  }, [orgId, isSuperadmin, admin])

  useEffect(() => {
    if (!selected?.id || tab !== 'messages') return
    loadMessages(selected.id)
    const timer = setInterval(() => loadMessages(selected.id, true), POLL_THREAD_MS)
    return () => clearInterval(timer)
  }, [selected?.id, loadMessages, tab])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages])

  // Switching orgs (superadmin) resets the open thread.
  useEffect(() => { setSelected(null); setMessages([]) }, [orgId])
  // A pending attachment belongs to the thread it was picked for.
  useEffect(() => { setAttachments([]) }, [selected?.id])

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // allow re-selecting the same file
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 25MB)`)
        continue
      }
      setUploadingAtt(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const r = await api.post('/api/messages/attachments', formData)
        const att = (r.data?.data || r.data)?.attachment
        if (att) setAttachments((prev) => [...prev, att])
      } catch (err) {
        toast.error(err.response?.data?.error || `Failed to upload ${file.name}`)
      } finally {
        setUploadingAtt(false)
      }
    }
  }

  const handleSend = (e) => {
    e?.preventDefault()
    const content = draft.trim()
    if ((!content && !attachments.length) || !selected?.other_user?.id || sending) return
    setSending(true)
    const url = admin
      ? withOrg(`/api/school-inbox/conversations/${selected.other_user.id}/send`, isSuperadmin ? orgId : null)
      : `/api/messages/conversations/${selected.other_user.id}/send`
    api.post(url, {
      content,
      // Durable pointers only — never the signed display twins.
      attachments: attachments.map(({ url: u, type, name, size }) => ({ url: u, type, name, size })),
    })
      .then((r) => {
        setDraft('')
        setAttachments([])
        const convoId = selected.id || r?.data?.data?.conversation_id
        if (convoId && convoId !== selected.id) setSelected((c) => ({ ...c, id: convoId }))
        if (convoId) loadMessages(convoId, true)
        loadConversations(true)
      })
      .catch((e2) => toast.error(e2?.response?.data?.error || 'Could not send the reply'))
      .finally(() => setSending(false))
  }

  const totalUnread = conversations.reduce((n, c) => n + (c.unread_count || 0), 0)

  // A thread whose last message came from the other person is still owed a
  // reply. A thread we have not annotated (an older payload, or the lookup
  // failing) counts as needing one — better to show it than to hide it.
  // `selfId` is the school for the front office, the teacher themself otherwise.
  const needsReply = (c) => !c.last_message_sender_id || c.last_message_sender_id !== selfId
  const openCount = conversations.filter(needsReply).length
  const shownConversations = conversations.filter((c) => (
    threadView === 'all' ? true
      : threadView === 'open' ? needsReply(c)
        : !needsReply(c)
  ))
  const THREAD_VIEWS = [
    ['open', `Needs a reply${openCount ? ` (${openCount})` : ''}`],
    ['answered', 'Answered'],
    ['all', 'All'],
  ]

  const tabClass = (t) => `px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
    tab === t
      ? 'bg-optio-purple text-white border-optio-purple'
      : 'bg-white text-neutral-600 border-gray-300 hover:border-optio-purple'}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Messaging</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {admin ? (
              <>Messages families and staff send to {orgName ? <span className="font-medium">{orgName}</span> : 'the school'} —
                replies go out under the school&apos;s name.</>
            ) : (
              <>Your message threads, and announcements to the families of your classes.</>
            )}
            {tab === 'messages' && totalUnread > 0 && ` ${totalUnread} unread.`}
          </p>
        </div>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => setTab('messages')} className={tabClass('messages')}>
          Conversations{totalUnread > 0 ? ` (${totalUnread})` : ''}
        </button>
        <button type="button" onClick={() => setTab('announcements')} className={tabClass('announcements')}>
          Announcements
        </button>
      </div>

      {tab === 'announcements' ? (
        <AnnouncementComposer />
      ) : (
      <div className="flex h-[72vh] min-h-[440px] bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Thread list */}
        <div className={`w-full md:w-[300px] lg:w-[340px] flex-shrink-0 border-r border-gray-200 flex flex-col ${
          selected ? 'hidden md:flex' : 'flex'}`}>
          {admin && (
            <div className="border-b border-gray-100 p-3">
              {composing ? (
                <div>
                  <label className="block text-xs text-neutral-500 mb-1" htmlFor="inbox-new-message">
                    Message one person
                  </label>
                  <SearchSelect
                    value={pickedPerson}
                    onChange={(id) => {
                      const person = people.find((p) => p.student_id === id)
                      if (person) startThread(person)
                    }}
                    options={people.filter((p) => p.student_id !== inboxUserId)}
                    getId={(p) => p.student_id}
                    getLabel={(p) => (p.role ? `${p.name} (${ROLE_LABELS[p.role] || p.role})` : p.name)}
                    placeholder="Search families and staff…"
                  />
                  <button type="button" onClick={() => { setComposing(false); setPickedPerson('') }}
                    className="mt-2 text-xs text-neutral-500 hover:underline">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setComposing(true)}
                  className="w-full rounded-lg border border-optio-purple/40 px-3 py-2 text-sm font-semibold text-optio-purple hover:bg-optio-purple/5 transition-colors">
                  New message
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100" role="group"
            aria-label="Filter threads">
            {THREAD_VIEWS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setThreadView(value)}
                aria-pressed={threadView === value}
                className={`px-2 py-1 rounded-lg text-xs ${threadView === value
                  ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                  : 'text-neutral-500 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
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
                  {admin
                    ? 'When a family or staff member messages the school, the thread shows up here.'
                    : 'When someone messages you, the thread shows up here.'}
                </p>
              </div>
            ) : shownConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
                <InboxIcon className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-neutral-700 mb-1">
                  {threadView === 'open' ? 'Everything has been answered' : 'Nothing here'}
                </p>
                <p className="text-xs text-neutral-500">
                  {threadView === 'open'
                    ? 'No thread is waiting on a reply from the school.'
                    : 'Switch to All to see every thread.'}
                </p>
              </div>
            ) : (
              shownConversations.map((convo) => {
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
              <p className="text-sm text-neutral-500">
                {admin
                  ? 'Pick a conversation to read and reply as the school.'
                  : 'Pick a conversation to read and reply.'}
              </p>
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
                  {admin && (
                    <p className="text-xs text-neutral-500 flex items-center gap-1">
                      <AcademicCapIcon className="w-3.5 h-3.5" />
                      Replying as {orgName || 'the school'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3 space-y-2">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-neutral-400 py-8">
                    {selected.id
                      ? 'No messages in this thread yet.'
                      : `Write the first message to ${memberName(selected)}.`}
                  </p>
                ) : (
                  messages.map((message) => {
                    const fromMe = message.sender_id === selfId
                    return (
                      <div key={message.id} className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                          fromMe
                            ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                            : 'bg-white border border-gray-200 text-neutral-900'}`}>
                          {message.message_content && (
                            <LinkifiedText text={message.message_content} light={fromMe} />
                          )}
                          {message.attachments?.length > 0 && (
                            <AttachmentList attachments={message.attachments} light={fromMe} />
                          )}
                          <p className={`text-[11px] mt-1 ${fromMe ? 'text-white/70' : 'text-gray-400'}`}>
                            {formatTime(message.created_at)}
                            {admin && fromMe && message.sent_by_name && ` · Sent by ${message.sent_by_name}`}
                            {/* A member-side message with an author = forwarded in from Optio Support. */}
                            {admin && !fromMe && message.sent_by_name && ` · Forwarded by ${message.sent_by_name}`}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-gray-200 bg-white">
                {(attachments.length > 0 || uploadingAtt) && (
                  <div className="px-3 pt-2 flex flex-wrap items-center gap-1.5">
                    {attachments.map((att, i) => (
                      <span key={att.url || i}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-neutral-700">
                        <span className="truncate max-w-[160px]">{att.name}</span>
                        <button type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, x) => x !== i))}
                          aria-label={`Remove ${att.name}`}
                          className="text-neutral-400 hover:text-red-600">
                          ×
                        </button>
                      </span>
                    ))}
                    {uploadingAtt && <span className="text-xs text-neutral-400">Uploading…</span>}
                  </div>
                )}
                <form onSubmit={handleSend} className="p-3 flex items-end gap-2">
                  <input ref={fileRef} type="file" multiple hidden
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    onChange={handleFiles} aria-label="Attach files" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingAtt}
                    className="p-2.5 rounded-lg text-neutral-500 hover:text-optio-purple hover:bg-optio-purple/5 disabled:opacity-40"
                    aria-label="Attach a file"
                  >
                    <PaperClipIcon className="w-5 h-5" />
                  </button>
                  <textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={1}
                    placeholder={admin ? `Reply as ${orgName || 'the school'}...` : 'Write a reply...'}
                    // resize-y, not resize-none: the auto-grow handles the
                    // common case, and the drag handle is there for the reply
                    // somebody wants a bigger window on regardless.
                    className="flex-1 resize-y overflow-y-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                  />
                  <button
                    type="submit"
                    disabled={sending || (!draft.trim() && !attachments.length)}
                    className="p-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white disabled:opacity-40"
                    aria-label="Send reply"
                  >
                    <PaperAirplaneIcon className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

export default SchoolInboxPage
