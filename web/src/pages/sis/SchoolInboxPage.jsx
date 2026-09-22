import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  InboxIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import MessageBubble from '../../components/communication/MessageBubble'
import MessageInput from '../../components/communication/MessageInput'
import ThreadRow from '../../components/communication/ThreadRow'
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
import BoardAnnouncementsTab from '../../components/sis/BoardAnnouncementsTab'
import SearchSelect from '../../components/ui/SearchSelect'
import StaffComposeModal from '../../components/sis/StaffComposeModal'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { useSisOrg, withOrg } from './useSisOrg'
import { Spinner } from '../../components/ui/Spinner'
import GlassTabBar from '../../components/ui/GlassTabBar'

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
 * Both thread sources go through the same React Query hooks, composer, row
 * and bubble as /messages (useDirectMessages with a `source`, MessageInput,
 * ThreadRow, MessageBubble). This page used to carry its own copy of each,
 * polled on its own timers and had no Realtime; a fix to the messenger
 * shipped to the messenger.
 *
 * Under a teacher preview the two halves differ, because only one of them CAN
 * be faithful:
 *   - Threads stay the admin's own. Both thread sources answer for the CALLER
 *     and take no ?teacher_id=, so a "faithful" preview would show the admin's
 *     own DMs behind the teacher's name — the trap hideInPreview guards on My
 *     Tasks.
 *   - Announcements are the previewed teacher's. GET /api/announcements does
 *     take ?teacher_id=, and answering as the admin meant the preview showed
 *     every announcement in the school — a send addressed to five named
 *     teachers, read as a teacher who was not one of them (iCreate,
 *     2026-08-31, 0a10f2ae). Where the preview can be honest it is.
 */

// The picker says who somebody is: two Bennetts in a school are a parent and
// a teacher, and only the label tells them apart.
const ROLE_LABELS = {
  student: 'student', parent: 'parent', advisor: 'teacher',
  org_admin: 'admin', campus_coordinator: 'coordinator', observer: 'observer',
}

// A stable empty list, so an effect keyed on `messages` does not re-run on
// every render of a thread that has none.
const NO_MESSAGES = []

const memberName = (convo) =>
  `${convo.other_user?.first_name || ''} ${convo.other_user?.last_name || ''}`.trim() ||
  convo.other_user?.display_name || 'Member'

const SchoolInboxPage = () => {
  const { orgId, isSuperadmin } = useSisOrg()
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
  const tab = rawTab === 'announcements' ? 'announcements'
    : rawTab === 'mine' ? 'mine'
      // Default: the office opens on the queue it works, a teacher on their own
      // threads (they have no school inbox to open).
      : rawTab === 'school' ? 'school' : (admin ? 'school' : 'mine')
  const isMessages = tab === 'school' || tab === 'mine'
  // The school inbox is only ever read on the School tab.
  const viewingSchool = admin && tab === 'school'
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })
  const [selected, setSelected] = useState(null)
  // Starting a thread, rather than answering one. The inbox could only ever
  // reply, so reaching ONE family meant an announcement to everybody or a
  // phone call (iCreate, 2026-09-02: "allow us to message an individual person
  // here too").
  const [composing, setComposing] = useState(false)
  const [people, setPeople] = useState([])
  const [pickedPerson, setPickedPerson] = useState('')
  // Writing to several people at once: 'staff' or 'families', or null when
  // closed. Separate from `composing`, which starts a thread with ONE family
  // or student as the school. Families was the gap Molly named from this very
  // tab (iCreate, 2026-09-17, b32b2fca: "Right now we can only send to one
  // person. I'm needing to message all the elementary school parents").
  const [staffCompose, setStaffCompose] = useState(null)
  const scrollerRef = useRef(null)

  // Which list the hooks read (see useDirectMessages). A superadmin names the
  // org; everyone else is locked to their own by the backend.
  const schoolSource = useMemo(
    () => ({ school: true, orgId: isSuperadmin ? orgId : null }),
    [isSuperadmin, orgId])
  const source = viewingSchool ? schoolSource : undefined

  const listEnabled = isMessages && !!user?.id && !(viewingSchool && isSuperadmin && !orgId)
  const { data: listData, isLoading: loading } = useConversations(user?.id, {
    source,
    enabled: listEnabled,
    // The office works the school inbox as a queue, and only the OPEN thread is
    // live over Realtime; a family's new thread has to be noticed by this poll.
    // The messenger's default is deliberately slow (see the hook); this list
    // is one org's, so it can afford to look more often.
    refetchInterval: viewingSchool ? 30000 : 120000,
  })
  const conversations = listData?.conversations || []
  const inboxUserId = viewingSchool ? (listData?.inbox_user_id || null) : null
  // The school's name labels its tab from either tab, so once the school list
  // has loaded, read it back out of the cache rather than only off the list
  // that is on screen.
  const orgName = listData?.organization?.name
    || queryClient.getQueryData(conversationsQueryKey(user?.id, schoolSource))?.organization?.name
    || ''

  // "Me" in a thread: the school on the School tab, myself on Mine.
  const selfId = viewingSchool ? inboxUserId : user?.id

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

  useEffect(() => {
    if (!composing || !viewingSchool || people.length) return
    api.get(withOrg('/api/sis/roster', isSuperadmin ? orgId : null))
      .then((r) => setPeople(r.data?.roster || []))
      .catch(() => toast.error('Could not load the school directory'))
  }, [composing, viewingSchool, isSuperadmin, orgId, people.length])

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
    setComposing(false)
    setPickedPerson('')
  }

  // The school inbox marks a thread read on GET (shared read state: one
  // colleague reading it reads it for all). A teacher's own thread needs the
  // explicit mark, once per open and again whenever unread messages arrive
  // while it is open -- the same rule as the messenger's ChatWindow.
  const unreadForMe = messages.filter((m) => m.recipient_id === user?.id && !m.read_at).length
  const markToken = `${threadId}:${unreadForMe}`
  const markedRef = useRef(null)
  useEffect(() => {
    if (viewingSchool || !threadId || !threadData) return
    if (markedRef.current === markToken) return
    markedRef.current = markToken
    markRead.mutate(threadId)
  }, [viewingSchool, threadId, threadData, markToken])

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
    setSelected(match)
    // Consumed only once the thread is in hand, exactly as ?to= is. Dropping
    // the param on the first pass instead would eat it during the load -- the
    // list is empty until the fetch returns, so the effect runs once with
    // nothing to match, and by the time the conversations arrive the param it
    // was looking for is gone and the thread never opens.
    const next = new URLSearchParams(searchParams)
    next.delete('conversation')
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
    } catch (error) {
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

  // Group threads sent from this very page.
  //
  // "New message" to several staff at once creates a group_conversations row
  // (sis_messaging_service._send_as_group), and this page only ever read the
  // DM list -- so the thread the office had just sent vanished from the screen
  // it was sent on, while the sidebar badge went on counting its unread
  // (iCreate, 2026-09-22, 3a189384). The group chat itself lives on
  // /messages and is good; what was missing was any way back to it from here.
  // These rows are that way back, not a second group reader: the thread pane
  // on this page is DM-shaped down to its realtime topic and its resolve mark.
  const { data: groupsData } = useGroups(user?.id, { enabled: isMessages && tab === 'mine' })
  const staffGroups = useMemo(() => {
    const rows = groupsData?.groups || (Array.isArray(groupsData) ? groupsData : []) || []
    return [...rows]
      .filter((g) => (g.audience || 'staff') === 'staff')
      .sort((a, b) => new Date(b.last_message_at || b.created_at || 0)
        - new Date(a.last_message_at || a.created_at || 0))
  }, [groupsData])

  // The open thread's row as the list has it now -- `selected` is a snapshot
  // from the click, and the resolved mark lands on the list.
  const selectedRow = (selected?.id && conversations.find((c) => c.id === selected.id)) || selected

  // "This one is done" without sending anything. The thread comes off Needs a
  // reply for this side only; the member sees nothing.
  const setResolved = (convo, resolved) => {
    if (!convo?.id || resolveMutation.isPending) return
    resolveMutation.mutate({ conversationId: convo.id, resolved, source, userId: user?.id })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Messaging</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {viewingSchool ? (
              <>Messages families and staff send to {orgName ? <span className="font-medium">{orgName}</span> : 'the school'} —
                replies go out under the school&apos;s name.</>
            ) : tab === 'mine' ? (
              <>Your own threads — replies come from you, not the school.</>
            ) : (
              <>Announcements to the families of your classes.</>
            )}
            {isMessages && totalUnread > 0 && ` ${totalUnread} unread.`}
          </p>
        </div>
      </div>

      <GlassTabBar
        align="start" size="md" className="mb-4" aria-label="Messaging sections"
        tabs={[
          ...(admin ? [{ id: 'school', label: orgName || 'School',
            badge: tab === 'school' && totalUnread > 0 ? totalUnread : null }] : []),
          { id: 'mine', label: 'My messages', badge: tab === 'mine' && totalUnread > 0 ? totalUnread : null },
          { id: 'announcements', label: 'Announcements' },
        ]}
        active={tab} onSelect={setTab}
      />

      <StaffComposeModal
        isOpen={!!staffCompose}
        initialAudience={staffCompose || 'staff'}
        orgId={isSuperadmin ? orgId : null}
        onClose={() => setStaffCompose(null)}
        onSent={() => queryClient.invalidateQueries({ queryKey: ['conversations'] })}
      />

      {tab === 'announcements' ? (
        // The same board composer /community mounts. It used to be a second,
        // different composer here -- a targeted SEND that could pick classes,
        // teachers and age bands, next to a BOARD post that could not. Two
        // composers for one act, and the office had to choose between them
        // before writing anything. Reaching a chosen set of people is what the
        // messaging tabs beside this one are for now.
        //
        // The tab gets the real orgId, not the withOrg-style "null for own org"
        // idiom: it is a data gate there (useCommunityAnnouncements is enabled
        // only with one), and null left every non-superadmin on "Loading…" for
        // good (iCreate, 2026-09-15, 72dabff8 / 83092eae / 83c94d73). The
        // server pins a non-superadmin to their own org whatever is sent.
        <BoardAnnouncementsTab orgId={orgId} admin={admin} />
      ) : (
      <div className="flex h-[72vh] min-h-[440px] bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Thread list */}
        <div className={`w-full md:w-[300px] lg:w-[340px] flex-shrink-0 border-r border-gray-200 flex flex-col ${
          selected ? 'hidden md:flex' : 'flex'}`}>
          {viewingSchool && (
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
                <div className="flex gap-2">
                  <button type="button" onClick={() => setComposing(true)}
                    className="flex-1 rounded-lg border border-optio-purple/40 px-3 py-2 text-sm font-semibold text-optio-purple hover:bg-optio-purple/5 transition-colors">
                    New message
                  </button>
                  {/* "Message families" promised one audience and opened a
                      composer with a Staff | Families toggle, so an org admin
                      reported the label as wrong (2026-09-22). The composer is
                      right; the button was describing half of it. */}
                  <button type="button" onClick={() => setStaffCompose('families')}
                    className="flex-1 rounded-lg border border-optio-purple/40 px-3 py-2 text-sm font-semibold text-optio-purple hover:bg-optio-purple/5 transition-colors">
                    Message a group
                  </button>
                </div>
              )}
            </div>
          )}
          {admin && tab === 'mine' && (
            <div className="border-b border-gray-100 p-3">
              <button type="button" onClick={() => setStaffCompose('staff')}
                className="w-full rounded-lg border border-optio-purple/40 px-3 py-2 text-sm font-semibold text-optio-purple hover:bg-optio-purple/5 transition-colors">
                New message
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
            {tab === 'mine' && staffGroups.length > 0 && (
              <div className="border-b border-gray-100 py-1">
                <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Group threads
                </p>
                {staffGroups.map((g) => (
                  <Link key={g.id} to={`/messages?group=${g.id}`}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors">
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
                  </Link>
                ))}
                <p className="px-3 pt-1 pb-1 text-[11px] text-neutral-400">
                  Group threads open in Messages, where everyone sees the replies.
                </p>
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
                  onSelect={setSelected}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selected ? 'hidden md:flex' : 'flex'}`}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
              <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-neutral-500">
                {viewingSchool
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
                  {viewingSchool && (
                    <p className="text-xs text-neutral-500 flex items-center gap-1">
                      <AcademicCapIcon className="w-3.5 h-3.5" />
                      Replying as {orgName || 'the school'}
                    </p>
                  )}
                </div>
                {/* A thread answered somewhere else -- in person, from the
                    other inbox -- has no reply to send and would otherwise sit
                    under Needs a reply forever (iCreate, 5c858931). */}
                {selectedRow.id && hasTraffic(selectedRow) && (
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
                      viewingSchool && fromMe && message.sent_by_name && `Sent by ${message.sent_by_name}`,
                      viewingSchool && !fromMe && message.sent_by_name && `Forwarded by ${message.sent_by_name}`,
                    ].filter(Boolean).map((t) => ` · ${t}`).join('')
                    return (
                      <div key={message.id} className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[75%]">
                          <MessageBubble
                            message={message}
                            isOwn={fromMe}
                            meta={meta || null}
                            seen={fromMe && i === messages.length - 1 && Boolean(message.read_at)}
                          />
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
                placeholder={viewingSchool ? `Reply as ${orgName || 'the school'}...` : 'Write a reply...'}
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
