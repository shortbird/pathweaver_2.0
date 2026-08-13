import React, { useEffect, useMemo, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useConversations } from '../../hooks/api/useDirectMessages'
import { useGroups } from '../../hooks/api/useGroupMessages'
import ChatWindow from '../communication/ChatWindow'
import GroupChatWindow from '../communication/GroupChatWindow'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * ClassMessagesTab — the full platform messenger, scoped to one class.
 *
 * Left rail: the class chat (the roster-synced group) and everyone in the class
 * the teacher can message one-to-one. Right pane: the same GroupChatWindow and
 * ChatWindow the Learning app messages page uses, so replies, attachments,
 * reactions, edit/delete, pins and announcement-only all work here with no
 * second implementation to keep in sync.
 *
 * Students reach the same conversations from their own /messages page — the
 * class chat is in their group list and their teachers are messaging contacts.
 */
const ClassMessagesTab = ({ classId, orgId, className }) => {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  // Unread badges reuse the lists that already power the messages page.
  const { data: conversationsData } = useConversations(user?.id, { enabled: !!user?.id })
  const { data: groupsData } = useGroups(user?.id, { enabled: !!user?.id })

  useEffect(() => {
    if (!classId || !orgId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get(withOrg(`/api/sis/teacher/classes/${classId}/messaging`, orgId))
      .then((r) => {
        if (cancelled) return
        setData(r.data)
        // Open the class chat first — it is what most teachers came for.
        if (r.data?.group?.id) {
          setSelected({ kind: 'group', id: r.data.group.id })
        }
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.response?.data?.error || 'Could not load messages for this class')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [classId, orgId])

  const group = data?.group || null
  const students = data?.students || []
  const teachers = data?.teachers || []

  const unreadByUser = useMemo(() => {
    const map = {}
    for (const c of conversationsData?.conversations || []) {
      if (c.other_user?.id) map[c.other_user.id] = c.unread_count || 0
    }
    return map
  }, [conversationsData])

  const groupUnread = useMemo(() => {
    const groups = groupsData?.groups || []
    return groups.find((g) => g.id === group?.id)?.unread_count || 0
  }, [groupsData, group?.id])

  const matches = (person) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return `${person.name} ${person.preferred_name || ''}`.toLowerCase().includes(q)
  }
  const shownStudents = students.filter(matches)
  const shownTeachers = teachers.filter(matches)

  // ChatWindow works off { id, other_user } — the backend accepts a user id in
  // place of a conversation id and opens (or creates) the DM.
  const selectedPerson = selected?.kind === 'dm'
    ? [...students, ...teachers].find((p) => p.id === selected.id)
    : null

  const conversation = selectedPerson ? {
    id: selectedPerson.id,
    type: selectedPerson.relationship === 'teacher' ? 'advisor' : 'student',
    other_user: {
      id: selectedPerson.id,
      display_name: selectedPerson.name,
      first_name: selectedPerson.name.split(' ')[0],
      last_name: selectedPerson.name.split(' ').slice(1).join(' '),
      avatar_url: selectedPerson.avatar_url,
      role: selectedPerson.relationship === 'teacher' ? 'advisor' : 'student',
    },
  } : null

  if (loading) {
    return <p className="text-neutral-500">Loading messages…</p>
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-neutral-600">{error}</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-3">
        Message the whole class at once, or a student one-to-one. Students see these in
        the Optio app under Messages, and parents can see their own student&apos;s messages.
      </p>

      <div className="flex h-[70vh] min-h-[420px] bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Left rail — class chat + people */}
        <div className={`w-full md:w-[280px] lg:w-[320px] flex-shrink-0 border-r border-gray-200 flex flex-col ${
          selected ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people"
                aria-label="Search people in this class"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {group && (
              <button
                onClick={() => setSelected({ kind: 'group', id: group.id })}
                className={`w-full px-4 py-3 flex items-center gap-3 border-l-2 transition-colors ${
                  selected?.kind === 'group'
                    ? 'bg-purple-50 border-optio-purple'
                    : 'border-transparent hover:bg-gray-50'}`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
                    <UsersIcon className="w-5 h-5 text-white" />
                  </div>
                  {groupUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                      {groupUnread > 9 ? '9+' : groupUnread}
                    </span>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-neutral-900 truncate">Class chat</p>
                  <p className="text-xs text-neutral-500 truncate">
                    Everyone in {className || 'this class'}
                    {group.announcement_only ? ' · Announcement-only' : ''}
                  </p>
                </div>
              </button>
            )}

            {!group && (
              <p className="px-4 py-3 text-xs text-neutral-500">
                The class chat starts once a student is enrolled.
              </p>
            )}

            <PersonSection
              title={`Students (${students.length})`}
              people={shownStudents}
              selectedId={selected?.kind === 'dm' ? selected.id : null}
              unreadByUser={unreadByUser}
              onSelect={(p) => setSelected({ kind: 'dm', id: p.id })}
              emptyLabel={search ? 'No match.' : 'No students enrolled yet.'}
            />

            {teachers.length > 0 && (
              <PersonSection
                title="Co-teachers"
                people={shownTeachers}
                selectedId={selected?.kind === 'dm' ? selected.id : null}
                unreadByUser={unreadByUser}
                onSelect={(p) => setSelected({ kind: 'dm', id: p.id })}
                emptyLabel="No match."
              />
            )}
          </div>
        </div>

        {/* Right pane — the real chat windows */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selected ? 'hidden md:flex' : 'flex'}`}>
          {selected?.kind === 'group' && group ? (
            <GroupChatWindow
              group={{ ...group, name: group.name || `${className} Class Chat` }}
              onBack={() => setSelected(null)}
            />
          ) : conversation ? (
            <ChatWindow conversation={conversation} onBack={() => setSelected(null)} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
              <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-neutral-500">
                Pick the class chat or a student to start a conversation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const PersonSection = ({ title, people, selectedId, unreadByUser, onSelect, emptyLabel }) => (
  <div>
    <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      {title}
    </p>
    {people.length === 0 && (
      <p className="px-4 py-2 text-xs text-neutral-400">{emptyLabel}</p>
    )}
    {people.map((p) => {
      const unread = unreadByUser[p.id] || 0
      const isSelected = selectedId === p.id
      return (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className={`w-full px-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
            isSelected ? 'bg-purple-50 border-optio-purple' : 'border-transparent hover:bg-gray-50'}`}
        >
          <div className="relative flex-shrink-0">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-neutral-600">
                {p.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <span className="min-w-0 text-left">
            <span className={`block text-sm truncate ${unread > 0 ? 'font-bold text-neutral-900' : 'font-medium text-neutral-800'}`}>
              {p.name}
            </span>
            {p.preferred_name && !p.name.toLowerCase().includes(p.preferred_name.toLowerCase()) && (
              <span className="block text-xs text-neutral-400 truncate">Goes by {p.preferred_name}</span>
            )}
          </span>
        </button>
      )
    })}
  </div>
)

export default ClassMessagesTab
