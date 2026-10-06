import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { formatMessageTime } from '../communication/MessageParts'
import { Spinner } from '../ui/Spinner'

/**
 * Every class chat at the school, for the office (ticket bbb477db: "Did you
 * remove the class chats? helpful for admins to see in one place").
 *
 * My messages lists only the class chats an admin is a member of, and an
 * admin becomes one only by opening that class's Messages tab. This lists all
 * of them from the server, searched and paged there. Opening one joins the
 * admin (the same join as the class Messages tab) and hands the group to
 * `onOpened`, which shows it in My messages.
 *
 * `search` is the page's search box, as typed.
 */

const KIND_LABEL = { parent: 'Parents', student: 'Students' }
const PER_PAGE = 50

export default function AllClassChatsPanel({ orgId, search = '', onOpened }) {
  const [q, setQ] = useState(search.trim())
  const [page, setPage] = useState(1)
  const [opening, setOpening] = useState(null)

  // A search runs on the server, so wait for the typing to stop.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const listQuery = useQuery({
    queryKey: ['sis', 'messaging', 'classChats', orgId || 'own', q, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) })
      if (q) params.set('q', q)
      return (await api.get(withOrg(`/api/sis/messaging/class-chats?${params}`, orgId))).data || {}
    },
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (listQuery.isError) toast.error('Could not load the class chats')
  }, [listQuery.isError])

  const chats = listQuery.data?.chats || []
  const total = listQuery.data?.total || 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  const open = async (chat) => {
    setOpening(chat.id)
    try {
      const r = await api.post(withOrg(`/api/sis/messaging/class-chats/${chat.id}/open`, orgId), {})
      onOpened?.(r.data?.group || { id: chat.id, name: chat.name })
    } catch {
      toast.error('Could not open that chat')
    } finally {
      setOpening(null)
    }
  }

  if (listQuery.isLoading) {
    return <div className="flex items-center justify-center h-40"><Spinner /></div>
  }

  return (
    <div>
      <p className="px-4 py-3 text-sm text-neutral-500 border-b border-gray-100">
        Every class parent chat and student chat at the school. Opening one adds you to it,
        and it then shows under Class chats in My messages.
      </p>
      {chats.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500">
          {q ? 'No class chats match.' : 'No class chats yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {chats.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => open(c)} disabled={opening === c.id}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 disabled:opacity-60">
                <ChatBubbleLeftRightIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-neutral-800">{c.class_name || c.name}</span>
                  {c.last_message_preview && (
                    <span className="block truncate text-xs text-neutral-500">{c.last_message_preview}</span>
                  )}
                </span>
                <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  {KIND_LABEL[c.kind] || c.kind}
                </span>
                <span className="flex-shrink-0 w-20 text-right text-xs text-neutral-400">
                  {c.last_message_at ? formatMessageTime(c.last_message_at) : 'No messages'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-sm">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="text-optio-purple disabled:text-neutral-300">Previous</button>
          <span className="text-neutral-500">Page {page} of {pages} · {total} chats</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
            className="text-optio-purple disabled:text-neutral-300">Next</button>
        </div>
      )}
    </div>
  )
}
