import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  InboxIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import MessageBubble from '../../components/communication/MessageBubble'
import MessageInput from '../../components/communication/MessageInput'
import ThreadRow from '../../components/communication/ThreadRow'
import GroupChatWindow from '../../components/communication/GroupChatWindow'
import useThreadScroll from '../../components/communication/useThreadScroll'
import {
  useConversations,
  useConversationMessages,
  useSendMessage,
  useMarkConversationAsRead,
  useSetConversationResolved,
  conversationsQueryKey,
} from '../../hooks/api/useDirectMessages'
import useMessagingRealtime from '../../hooks/api/useMessagingRealtime'
import { useGroups } from '../../hooks/api/useGroupMessages'
import ComposeMessageModal from '../../components/sis/ComposeMessageModal'
import MakeTaskModal from '../../components/sis/MakeTaskModal'
import SentMessagesPanel from '../../components/sis/SentMessagesPanel'
import { useGrantedThreads } from '../../hooks/api/useSisMessaging'
import { formatMessageTime } from '../../components/communication/MessageParts'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { useSisOrg } from './useSisOrg'
import { Spinner } from '../../components/ui/Spinner'
import GlassTabBar from '../../components/ui/GlassTabBar'

/**
 * SchoolInboxPage — the console's messages (/inbox).
 *
 * Tabs (messaging and the inbox merged, 2026-08-31):
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
 * - Sent (the office). What went out with Compose, each with "Read by N of
 *   M" and who (iCreate, 2026-09-23, 9b46c748).
 *
 * Announcements are not here any more. They live on the Community page only
 * (9a335881: "announcements should only be in the community page, not in
 * /inbox"); ?tab=announcements forwards there, so an old link still lands.
 *
 * Compose (ComposeMessageModal) is the one way to start a message: staff,
 * families and students in one picker, one thread or a private thread each,
 * push and email as toggles (bf8b754d, 8ee000b6). It replaced "New message"
 * (one person) and "Message a group" (staff or families).
 *
 * "Make a task" turns a school thread, or one message in it, into a task for
 * somebody on staff (bf8b754d). A teacher given one has no school inbox, so
 * the School tab shows THEM just the threads they were handed (d93b24d2):
 * the whole thread, answered as the school, with their name shown to the
 * family. The server decides who may open what
 * (school_inbox_service.thread_access); this page only lists it.
 *
 * Both thread sources go through the same React Query hooks, composer, row
 * and bubble as /messages (useDirectMessages with a `source`, MessageInput,
 * ThreadRow, MessageBubble). This page used to carry its own copy of each,
 * polled on its own timers and had no Realtime; a fix to the messenger
 * shipped to the messenger.
 *
 * Under a teacher preview the threads stay the admin's own. Both thread
 * sources answer for the CALLER and take no ?teacher_id=, so a "faithful"
 * preview would show the admin's own DMs behind the teacher's name — the trap
 * hideInPreview guards on My Tasks.
 */

// A stable empty list, so an effect keyed on `messages` does not re-run on
// every render of a thread that has none.
const NO_MESSAGES = []

const memberName = (convo) =>
  `${convo.other_user?.first_name || ''} ${convo.other_user?.last_name || ''}`.trim() ||
  convo.other_user?.display_name || 'Member'

const SchoolInboxPage = () => {
  const { orgId, isSuperadmin, activeOrg } = useSisOrg()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // Whether this caller has a school inbox to read at all. The backend is the
  // real gate either way: /api/school-inbox/* is ADMIN_ROLES, /api/messages/*
  // answers only for the caller.
  const admin = isSisAdmin(user)
  const [searchParams, setSearchParams] = useSearchParams()
  // Which threads to show. The office's inbox is a work queue: what it needs to
  // know first is who is still waiting on a reply, not what arrived most
  // recently. "A spot for messages to go once they are completed, so that only
  // new messages that haven't been replied to show" (2ca63bde) and "I don't
  // have an outbox really" (7fb34ed4) are the two halves of this one control.
  const [threadView, setThreadView] = useState('open')
  // Three tabs, from ?tab=. Which SOURCE the Messages half reads used to be
  // decided by the caller's role: an admin got the school inbox and nothing
  // else, so an admin or coordinator who was messaged personally -- as a
  // colleague, or as a parent of their own child at the school -- had nowhere
  // in the console to read it. The notification linked to the learning app and
  // the console pretended the thread did not exist. It is a tab now, and both
  // halves are available to whoever the backend lets read them.
  const rawTab = searchParams.get('tab')
  const tab = rawTab === 'mine' ? 'mine'
    : rawTab === 'sent' && admin ? 'sent'
      // Default: My messages, for everyone. The office used to open on the
      // shared school inbox, and a coordinator who pressed Compose there wrote
      // to a colleague as the school, into the inbox the whole office reads
      // (iCreate, 2026-09-25). A bare ?conversation= is a school thread (the
      // office's bell and the People-page Message panel link that way).
      : rawTab === 'school' || (admin && !rawTab && searchParams.get('conversation')) ? 'school' : 'mine'
  const isMessages = tab === 'school' || tab === 'mine'
  // The school inbox is only ever read on the School tab. The office reads
  // all of it; anybody else reads the threads handed to them with a task.
  const viewingSchool = admin && tab === 'school'
  const viewingGranted = !admin && tab === 'school'
  const schoolSide = viewingSchool || viewingGranted
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })
  const [selected, setSelected] = useState(null)
  // An open GROUP thread, in the same pane. A DM and a group are never open
  // together: picking one clears the other.
  const [selectedGroup, setSelectedGroupState] = useState(null)
  const setSelectedGroup = (g) => { setSelectedGroupState(g); if (g) setSelected(null) }
  const selectThread = (c) => { setSelected(c); if (c) setSelectedGroupState(null) }
  // Compose open, and whether it sends as the school (School tab) or as me.
  const [compose, setCompose] = useState(null)
  // "Make a task": {conversationId | groupId, message?, label} or null.
  const [taskFor, setTaskFor] = useState(null)
  const scrollerRef = useRef(null)

  // Which list the hooks read (see useDirectMessages). A superadmin names the
  // org; everyone else is locked to their own by the backend.
  const schoolSource = useMemo(
    () => ({ school: true, orgId: isSuperadmin ? orgId : null }),
    [isSuperadmin, orgId])
  const source = schoolSide ? schoolSource : undefined

  const listEnabled = isMessages && !viewingGranted && !!user?.id
    && !(viewingSchool && isSuperadmin && !orgId)
  const { data: listData, isLoading: listLoading } = useConversations(user?.id, {
    source,
    enabled: listEnabled,
    // The office works the school inbox as a queue, and only the OPEN thread is
    // live over Realtime; a family's new thread has to be noticed by this poll.
    // The messenger's default is deliberately slow (see the hook); this list
    // is one org's, so it can afford to look more often.
    refetchInterval: viewingSchool ? 30000 : 120000,
  })
  // The threads handed to a non-office staff member with a task (d93b24d2).
  // Fetched for them on every tab so the School tab only appears when there
  // is something on it.
  const { data: grantedData, isLoading: grantedLoading } = useGrantedThreads(
    user?.id, isSuperadmin ? orgId : null,
    { enabled: !admin, refetchInterval: viewingGranted ? 30000 : 120000 })
  const hasGranted = ((grantedData?.conversations || []).length + (grantedData?.groups || []).length) > 0
  const loading = viewingGranted ? grantedLoading : listLoading
  const conversations = (viewingGranted ? grantedData?.conversations : listData?.conversations) || []
  const inboxUserId = viewingSchool ? (listData?.inbox_user_id || null)
    : viewingGranted ? (grantedData?.inbox_user_id || null) : null
  // The school's name labels its tab from either tab, so once the school list
  // has loaded, read it back out of the cache rather than only off the list
  // that is on screen.
  const orgName = listData?.organization?.name
    || grantedData?.organization?.name
    || activeOrg?.name
    || queryClient.getQueryData(conversationsQueryKey(user?.id, schoolSource))?.organization?.name
    || ''

  // "Me" in a thread: the school on the School tab, myself on Mine.
  const selfId = schoolSide ? inboxUserId : user?.id

  const threadId = selected?.id || null
  const { data: threadData, isLoading: messagesLoading } = useConversationMessages(
    threadId, user?.id, { source, enabled: !!threadId && isMessages })
  const messages = threadData?.messages || NO_MESSAGES

  // Live updates for the open thread; the query's own poll is the fallback.
  // The rows here are conversation rows, so `id` is also the broadcast topic.
  useMessagingRealtime({ kind: 'dm', id: threadId, source, enabled: !!threadId && isMessages })

  const sendMutation = useSendMessage()
  const markRead = useMarkConversationAsRead()
  const resolveMutation = useSetConversationResolved()

  // The school inbox marks a thread read on GET (shared read state: one
  // colleague reading it reads it for all). A teacher's own thread needs the
  // explicit mark, once per open and again whenever unread messages arrive
  // while it is open -- the same rule as the messenger's ChatWindow.
  const unreadForMe = messages.filter((m) => m.recipient_id === user?.id && !m.read_at).length
  const markToken = `${threadId}:${unreadForMe}`
  const markedRef = useRef(null)
  useEffect(() => {
    if (schoolSide || !threadId || !threadData) return
    if (markedRef.current === markToken) return
    markedRef.current = markToken
    markRead.mutate(threadId)
  }, [schoolSide, threadId, threadData, markToken])

  // The badge on the row clears the moment the thread is on screen, without
  // waiting for the list's next poll to say so.
  useEffect(() => {
    if (!threadId || !threadData) return
    queryClient.setQueryData(conversationsQueryKey(user?.id, source), (old) => {
      if (!old?.conversations) return old
      return {
        ...old,
        conversations: old.conversations.map((c) =>
          c.id === threadId && c.unread_count ? { ...c, unread_count: 0 } : c),
      }
    })
  }, [threadId, threadData, viewingSchool, orgId])

  useThreadScroll(scrollerRef, messages, threadId, selfId)

  // Switching orgs (superadmin) or tabs resets the open thread -- School and
  // Mine are different thread lists, and a conversation id from one is
  // meaningless to the other.
  //
  // Done DURING RENDER, not in an effect. Every effect in one commit sees the
  // same render's state, so an effect-based reset ran alongside the thread
  // effect above, not before it: on the tab change that effect re-fired with
  // the OLD thread id and the NEW tab's loader, and asked /api/messages for a
  // school-inbox thread the caller is not a participant of. Every staff member
  // who switched tabs with a thread open collected a 403 and a "Could not
  // load the conversation" toast (OPTIO-WEB-3 / OPTIO-BACKEND-8T: 45 users in
  // two weeks). Setting state in render makes React re-render before any
  // effect runs -- and React Query only starts a fetch from an effect -- so
  // the thread query only ever sees the reset selection.
  const listKey = `${orgId}:${tab}`
  const [renderedListKey, setRenderedListKey] = useState(listKey)
  if (renderedListKey !== listKey) {
    setRenderedListKey(listKey)
    setSelected(null)
    setSelectedGroupState(null)
  }

  // ?to=<user id> opens a thread with that person straight away, so "Message"
  // on a staff card is one click rather than a page plus a search. The thread
  // may not exist yet, which is the state startThread also leaves it in: no id
  // until the first message lands, and handleSend adopts the id from the reply.
  //
  // Declared AFTER the reset above on purpose. Effects run in source order, so
  // the other way round the reset fired second and cleared the thread this one
  // had just opened -- ?to= appeared to do nothing at all.
  const wantedTo = searchParams.get('to')
  useEffect(() => {
    if (!wantedTo || tab !== 'mine') return
    const existing = conversations.find((c) => c.other_user?.id === wantedTo)
    setSelectedGroupState(null)
    setSelected((current) => {
      if (existing) return existing
      if (current?.other_user?.id === wantedTo) return current
      return { id: null, other_user: { id: wantedTo } }
    })
    if (existing) {
      // Consumed once a real thread is in hand. Leaving it in the URL would
      // re-open this thread on every poll and fight anyone reading another.
      const next = new URLSearchParams(searchParams)
      next.delete('to')
      setSearchParams(next, { replace: true })
    }
  }, [wantedTo, tab, conversations])
  // ?conversation=<id> opens that thread. The People page's Message button
  // sends AS the school, so the answer comes back here rather than to the
  // sender's own Messages -- this link is how staff get from "sent" to the
  // thread it started, which is the half they were never told about.
  //
  // Keyed on the thread id rather than the person, so unlike ?to= it does not
  // need to know which tab the thread lives on: whichever list is loaded, if
  // the id is in it, that is the thread. Same consume-once rule and the same
  // reason -- a param left in the URL re-opens its thread on every poll and
  // fights anyone reading another.
  const wantedConversation = searchParams.get('conversation')
  useEffect(() => {
    if (!wantedConversation || !isMessages) return
    const match = conversations.find((c) => c.id === wantedConversation)
    if (!match) return
    selectThread(match)
    // Consumed only once the thread is in hand, exactly as ?to= is. Dropping
    // the param on the first pass instead would eat it during the load -- the
    // list is empty until the fetch returns, so the effect runs once with
    // nothing to match, and by the time the conversations arrive the param it
    // was looking for is gone and the thread never opens.
    const next = new URLSearchParams(searchParams)
    next.delete('conversation')
    // A bare ?conversation= chose the tab; pin it, or dropping the param
    // would drop the office back onto My messages.
    if (!next.get('tab')) next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }, [wantedConversation, isMessages, conversations])

  const handleSend = async (content, { attachments = [] } = {}) => {
    if (!selected?.other_user?.id) return
    try {
      const sent = await sendMutation.mutateAsync({
        targetUserId: selected.other_user.id,
        content,
        attachments,
        currentUserId: selfId,
        cacheId: selected.id || undefined,
        source,
      })
      const convoId = selected.id || sent?.conversation_id
      if (convoId && convoId !== selected.id) setSelected((c) => ({ ...c, id: convoId }))
    } catch {
      // The mutation already toasted.
    }
  }

  const totalUnread = conversations.reduce((n, c) => n + (c.unread_count || 0), 0)

  // Four piles, from two facts the row carries: who spoke last, and whether
  // this side has marked the thread handled since.
  //
  // - A thread with no messages yet is in no pile but All. Six of iCreate's
  //   "22 needing a reply" were empty threads somebody had opened and never
  //   written in (7ee545c4).
  // - Handled outranks who spoke last, until the other person writes again:
  //   `resolved_at` is compared to `last_message_at`, so a new message reopens
  //   the thread without anything having to clear the mark (5c858931).
  // - Who spoke last is `last_message_sender_id`, stored on send. A row
  //   without it (older payload) still counts as owed a reply — better to show
  //   a thread than to hide one.
  // - "Waiting on them" was labelled "Answered", and half of what sat there
  //   was never answered by anyone: threads the school opened and the member
  //   ignored. Both are the same fact — the last word was ours (4ae1c6d1).
  //
  // `selfId` is the school for the front office, the teacher themself otherwise.
  const hasTraffic = (c) => Boolean(c.last_message_at)
  const isResolved = (c) => Boolean(c.resolved_at)
    && (!c.last_message_at || c.resolved_at >= c.last_message_at)
  const lastWordWasOurs = (c) => Boolean(c.last_message_sender_id) && c.last_message_sender_id === selfId
  const needsReply = (c) => hasTraffic(c) && !isResolved(c) && !lastWordWasOurs(c)
  const waitingOnThem = (c) => hasTraffic(c) && !isResolved(c) && lastWordWasOurs(c)
  const openCount = conversations.filter(needsReply).length
  const shownConversations = conversations.filter((c) => (
    threadView === 'all' ? true
      : threadView === 'open' ? needsReply(c)
        : threadView === 'waiting' ? waitingOnThem(c)
          : isResolved(c)
  ))
  const THREAD_VIEWS = [
    ['open', `Needs a reply${openCount ? ` (${openCount})` : ''}`],
    ['waiting', 'Waiting on them'],
    ['resolved', 'Handled'],
    ['all', 'All'],
  ]

  // Group threads, opened in this page's own pane.
  //
  // "New message" to several staff at once creates a group_conversations row
  // (sis_messaging_service), and this page only ever read the DM list -- so the
  // thread the office had just sent vanished from the screen it was sent on
  // (iCreate, 2026-09-22, 3a189384). The rows that fixed that linked out to
  // /messages, which is a learning-app path: the console handed the reader to
  // app.optioeducation.com and the sidebar was gone ("different page ... left
  // side bar menu is gone", 9284344e). They open here now, in GroupChatWindow.
  //
  // Which groups depends on the tab, like the DM list: the School tab lists the
  // groups the SCHOOL owns (sent from that tab, ac84b6cd), read as the school;
  // My messages lists the caller's own groups, read as a member.
  //
  // Every group the school owns is on the School tab, whoever is in it: since
  // Compose (2026-09-23) a school group can hold families and students too.
  // My messages still lists only staff rooms -- a teacher's class chats have
  // their own page.
  const groupsEnabled = isMessages && !viewingGranted && !!user?.id
    && !(viewingSchool && isSuperadmin && !orgId)
  const { data: groupsData } = useGroups(user?.id, { source, enabled: groupsEnabled })
  const staffGroups = useMemo(() => {
    const rows = viewingGranted ? (grantedData?.groups || [])
      : (groupsData?.groups || (Array.isArray(groupsData) ? groupsData : []) || [])
    return [...rows]
      .filter((g) => schoolSide || (g.audience || 'staff') === 'staff')
      .sort((a, b) => new Date(b.last_message_at || b.created_at || 0)
        - new Date(a.last_message_at || a.created_at || 0))
  }, [groupsData, grantedData, viewingGranted, schoolSide])

  // ?group=<id> opens that group, the same consume-once rule as ?conversation=
  // (the bell's link for a reply in a school group, 11f6ad24).
  const wantedGroup = searchParams.get('group')
  useEffect(() => {
    if (!wantedGroup || !isMessages) return
    const match = staffGroups.find((g) => g.id === wantedGroup)
    if (!match) return
    setSelectedGroup(match)
    const next = new URLSearchParams(searchParams)
    next.delete('group')
    setSearchParams(next, { replace: true })
  }, [wantedGroup, isMessages, staffGroups])

  // The open thread's row as the list has it now -- `selected` is a snapshot
  // from the click, and the resolved mark lands on the list.
  const selectedRow = (selected?.id && conversations.find((c) => c.id === selected.id)) || selected

  // "This one is done" without sending anything. The thread comes off Needs a
  // reply for this side only; the member sees nothing.
  const setResolved = (convo, resolved) => {
    if (!convo?.id || resolveMutation.isPending) return
    resolveMutation.mutate({ conversationId: convo.id, resolved, source, userId: user?.id })
  }

  // Who on staff has opened this thread (9b46c748: the shared read state said
  // somebody had; the office asked who). Me first is noise, so I am left out.
  const openedBy = (threadData?.opened_by || []).filter((r) => r.user_id !== user?.id)

  // Announcements moved to the Community page (9a335881). An old link, a
  // bookmark or the /messaging redirect still carries ?tab=announcements.
  if (rawTab === 'announcements') return <Navigate to="/community?tab=announcements" replace />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Messaging</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {viewingSchool ? (
              <>The shared {orgName ? <span className="font-medium">{orgName}</span> : 'school'} inbox. Everyone in the
                office reads it, and replies go out as {orgName || 'the school'}.</>
            ) : viewingGranted ? (
              <>Threads the office gave you with a task. Your replies go out from {orgName || 'the school'} with your name.</>
            ) : tab === 'mine' ? (
              <>Your own threads. Staff see your name; parents and students always hear from {orgName || 'the school'}.</>
            ) : (
              <>Messages sent with Compose, and who has read them.</>
            )}
            {isMessages && totalUnread > 0 && ` ${totalUnread} unread.`}
          </p>
        </div>
      </div>

      <GlassTabBar
        align="start" size="md" className="mb-4" aria-label="Messaging sections"
        tabs={[
          ...(admin || hasGranted || viewingGranted ? [{ id: 'school', label: `${orgName || 'School'} inbox`,
            badge: tab === 'school' && totalUnread > 0 ? totalUnread : null }] : []),
          { id: 'mine', label: 'My messages', badge: tab === 'mine' && totalUnread > 0 ? totalUnread : null },
          ...(admin ? [{ id: 'sent', label: 'Sent' }] : []),
        ]}
        active={tab} onSelect={setTab}
      />

      <ComposeMessageModal
        isOpen={!!compose}
        orgId={isSuperadmin ? orgId : null}
        orgName={orgName}
        asSchool={compose === 'school'}
        asTeacher={!admin}
        onClose={() => setCompose(null)}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })
        }}
      />

      <MakeTaskModal
        isOpen={!!taskFor}
        orgId={isSuperadmin ? orgId : null}
        conversationId={taskFor?.conversationId || null}
        groupId={taskFor?.groupId || null}
        message={taskFor?.message || null}
        threadLabel={taskFor?.label || ''}
        onClose={() => setTaskFor(null)}
      />

      {tab === 'sent' ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden min-h-[300px]">
          {/* No Compose here: it always wrote as the school, from a tab that
              does not say so. Compose lives with the thread lists. */}
          <SentMessagesPanel key={orgId || 'own'} orgId={isSuperadmin ? orgId : null} />
        </div>
      ) : (
      <div className="flex h-[72vh] min-h-[440px] bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Thread list */}
        <div className={`w-full md:w-[300px] lg:w-[340px] flex-shrink-0 border-r border-gray-200 flex flex-col ${
          selected || selectedGroup ? 'hidden md:flex' : 'flex'}`}>
          {/* One Compose for everything (bf8b754d). From the School tab it
              writes as the school; from My messages, as you (families and
              students always hear from the school -- see the modal). A
              teacher composes as themselves, to staff and their own classes
              (message_compose_service), and not from a granted School tab. */}
          {(admin || !viewingGranted) && (
            <div className="border-b border-gray-100 p-3">
              <button type="button" onClick={() => setCompose(viewingSchool ? 'school' : 'mine')}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-optio-purple/40 px-3 py-2 text-sm font-semibold text-optio-purple hover:bg-optio-purple/5 transition-colors">
                <PencilSquareIcon className="w-4 h-4" /> Compose
              </button>
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
            {/* Group threads first: they are the newest thing the office did,
                and they were the ones that disappeared. */}
            {staffGroups.length > 0 && (
              <div className="border-b border-gray-100 py-1">
                <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Group threads
                </p>
                {staffGroups.map((g) => (
                  <button key={g.id} type="button" onClick={() => setSelectedGroup(g)}
                    aria-pressed={selectedGroup?.id === g.id}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 transition-colors ${
                      selectedGroup?.id === g.id ? 'bg-optio-purple/5' : 'hover:bg-gray-50'}`}>
                    <ChatBubbleLeftRightIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{g.name}</span>
                    {g.member_count > 0 && (
                      <span className="text-xs text-neutral-400 flex-shrink-0">{g.member_count}</span>
                    )}
                    {g.unread_count > 0 && (
                      <span className="flex-shrink-0 rounded-full bg-optio-purple px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        {g.unread_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Spinner />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 p-4 text-center">
                <InboxIcon className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-neutral-700 mb-1">No messages yet</p>
                <p className="text-xs text-neutral-500">
                  {viewingSchool
                    ? 'When a family or staff member messages the school, the thread shows up here.'
                    : viewingGranted
                      ? 'When the office gives you a thread with a task, it shows up here.'
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
                    ? (viewingSchool ? 'No thread is waiting on a reply from the school.' : 'No thread is waiting on a reply from you.')
                    : 'Switch to All to see every thread.'}
                </p>
              </div>
            ) : (
              shownConversations.map((convo) => (
                <ThreadRow
                  key={convo.id}
                  conversation={convo}
                  isSelected={selected?.id === convo.id}
                  onSelect={selectThread}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selected && !selectedGroup ? 'hidden md:flex' : 'flex'}`}>
          {selectedGroup ? (
            // Keyed on the group: a reply or a half-written message belongs to
            // the thread it was started in.
            <GroupChatWindow
              key={selectedGroup.id}
              group={selectedGroup}
              source={source}
              onBack={() => setSelectedGroup(null)}
              onMakeTask={viewingSchool
                ? (msg) => setTaskFor({ groupId: selectedGroup.id, message: msg, label: selectedGroup.name })
                : null}
            />
          ) : !selected ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
              <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-neutral-500">
                {schoolSide
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
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-neutral-900 truncate">{memberName(selectedRow)}</h2>
                  {schoolSide && (
                    <p className="text-xs text-neutral-500 flex items-center gap-1">
                      <AcademicCapIcon className="w-3.5 h-3.5" />
                      {viewingGranted
                        ? `Replying as ${orgName || 'the school'}, with your name`
                        : `Replying as ${orgName || 'the school'}`}
                    </p>
                  )}
                  {schoolSide && openedBy.length > 0 && (
                    <p className="text-xs text-neutral-400 truncate"
                      title={openedBy.map((r) => `${r.name} ${formatMessageTime(r.last_read_at)}`).join(', ')}>
                      Opened by {openedBy.slice(0, 3).map((r) => `${r.name} (${formatMessageTime(r.last_read_at)})`).join(', ')}
                      {openedBy.length > 3 ? ` and ${openedBy.length - 3} more` : ''}
                    </p>
                  )}
                </div>
                {viewingSchool && selectedRow.id && (
                  <button type="button"
                    onClick={() => setTaskFor({ conversationId: selectedRow.id, label: memberName(selectedRow) })}
                    title="Give this thread to somebody on staff as a task"
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600 hover:border-optio-purple hover:text-optio-purple">
                    <ClipboardDocumentCheckIcon className="w-4 h-4" /> Make a task
                  </button>
                )}
                {/* A thread answered somewhere else -- in person, from the
                    other inbox -- has no reply to send and would otherwise sit
                    under Needs a reply forever (iCreate, 5c858931). */}
                {!viewingGranted && selectedRow.id && hasTraffic(selectedRow) && (
                  isResolved(selectedRow) ? (
                    <button type="button" onClick={() => setResolved(selectedRow, false)} disabled={resolveMutation.isPending}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600 hover:bg-gray-50 disabled:opacity-50">
                      <CheckCircleIcon className="w-4 h-4 text-green-600" /> Handled · Reopen
                    </button>
                  ) : (
                    <button type="button" onClick={() => setResolved(selectedRow, true)} disabled={resolveMutation.isPending}
                      title="Take it off Needs a reply without sending anything"
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600 hover:border-optio-purple hover:text-optio-purple disabled:opacity-50">
                      <CheckCircleIcon className="w-4 h-4" /> Mark handled
                    </button>
                  )
                )}
              </div>

              <div ref={scrollerRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 px-4 py-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Spinner />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-neutral-400 py-8">
                    {selected.id
                      ? 'No messages in this thread yet.'
                      : `Write the first message to ${memberName(selected)}.`}
                  </p>
                ) : (
                  // Pinned to the bottom -- see MessageThread for why.
                  <div className="min-h-full flex flex-col justify-end space-y-2">
                  {messages.map((message, i) => {
                    const fromMe = message.sender_id === selfId
                    // A member-side message with an author = forwarded in from
                    // Optio Support.
                    const meta = [
                      schoolSide && fromMe && message.sent_by_name && `Sent by ${message.sent_by_name}`,
                      schoolSide && !fromMe && message.sent_by_name && `Forwarded by ${message.sent_by_name}`,
                    ].filter(Boolean).map((t) => ` · ${t}`).join('')
                    return (
                      <div key={message.id} className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[75%]">
                          <MessageBubble
                            message={message}
                            isOwn={fromMe}
                            meta={meta || null}
                            // The read time, so the receipt says when (9b46c748).
                            seen={fromMe && i === messages.length - 1 && message.read_at ? message.read_at : false}
                          />
                          {/* A family's message is how a request arrives now:
                              the office turns it into a task for whoever should
                              handle it (bf8b754d). */}
                          {viewingSchool && !fromMe && selectedRow.id && !message.isOptimistic && (
                            <button type="button"
                              onClick={() => setTaskFor({ conversationId: selectedRow.id, message, label: memberName(selectedRow) })}
                              className="mt-0.5 text-[11px] text-neutral-400 hover:text-optio-purple">
                              Make a task
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                )}
              </div>

              {/* Keyed on the thread: a pending attachment belongs to the
                  thread it was picked for. */}
              <MessageInput
                key={selected.id || `new:${selected.other_user?.id}`}
                onSendMessage={handleSend}
                disabled={sendMutation.isPending}
                placeholder={schoolSide ? `Reply as ${orgName || 'the school'}...` : 'Write a reply...'}
              />
            </>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

export default SchoolInboxPage
