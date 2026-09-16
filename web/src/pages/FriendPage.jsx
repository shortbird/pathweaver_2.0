import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import * as friends from '../services/friendsAPI'
import { observerAPI } from '../services/api'
import FeedCard from '../components/observer/FeedCard'
import { useConfirm } from '../contexts/ConfirmContext'
import CollaborateModal from '../components/connections/CollaborateModal'

/**
 * A friend's page -- their work, through the peer grant (web, 2026-09-16).
 *
 * Mobile has had this since phase 2 (app/(app)/friends/[id].tsx); on web a
 * friend's row on /connections went nowhere, and "friends see each other's
 * work" meant scrolling the mixed feed for their name.
 *
 * What is here, and what is deliberately not: the friend's picture and
 * display name (never a surname, an email or a school); since when, and the
 * classes the two share; the quests the friend is on that this student may
 * see, with the ones they are BOTH on first and marked; then the friend's
 * work, filtered to them. No XP, level or streak -- a friend's page says what
 * they are into, not how they compare. Collaborate invites the friend to one
 * of this student's own quests.
 *
 * /api/connections/friends/<id> refuses anyone who is not an active friend,
 * and the page reads that as a dead end.
 */
const FRIENDS_SINCE = { month: 'short', day: 'numeric', year: 'numeric' }

export default function FriendPage() {
  const { peerId } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [page, setPage] = useState(undefined) // undefined: loading; null: not a friend
  const [items, setItems] = useState([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [collaborating, setCollaborating] = useState(false)

  useEffect(() => {
    let cancelled = false
    friends.getFriendPage(peerId)
      .then((data) => { if (!cancelled) setPage(data?.peer ? data : null) })
      .catch(() => { if (!cancelled) setPage(null) })
    return () => { cancelled = true }
  }, [peerId])

  const loadFeed = useCallback(async (after) => {
    setFeedLoading(true)
    try {
      const res = await observerAPI.getFeed({ studentId: peerId, limit: 20, cursor: after || undefined })
      const next = res.data?.items || []
      setItems((prev) => (after ? [...prev, ...next] : next))
      setHasMore(!!res.data?.has_more)
      setCursor(res.data?.next_cursor || null)
    } catch {
      toast.error('Could not load their work.')
    } finally {
      setFeedLoading(false)
    }
  }, [peerId])

  useEffect(() => { if (page) loadFeed() }, [page, loadFeed])

  const remove = async () => {
    if (!page?.connection_id) return
    if (!(await confirm(`Remove ${page.peer.display_name} as a friend?`))) return
    setBusy(true)
    try {
      await friends.revoke(page.connection_id)
      toast.success('Removed.')
      navigate('/connections')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not remove that friend.')
    } finally {
      setBusy(false)
    }
  }

  if (page === undefined) {
    return <div className="max-w-2xl mx-auto p-6 text-neutral-500">Loading...</div>
  }

  if (page === null) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Link to="/connections" className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline">
          <ArrowLeftIcon className="w-4 h-4" /> Friends
        </Link>
        <p className="mt-6 text-neutral-600">You are not friends with this student.</p>
      </div>
    )
  }

  const { peer, quests = [], my_quests: myQuests = [], shared_classes: sharedClasses = [] } = page
  const name = peer.display_name || 'Friend'
  const context = [
    page.friends_since && `Friends since ${new Date(page.friends_since).toLocaleDateString('en-US', FRIENDS_SINCE)}`,
    sharedClasses.length > 0 && `In ${sharedClasses.join(', ')} with you`,
  ].filter(Boolean)

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link to="/connections" className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline">
        <ArrowLeftIcon className="w-4 h-4" /> Friends
      </Link>

      <header className="mt-4 flex items-center gap-4">
        {peer.avatar_url ? (
          <img src={peer.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-optio-purple/10 text-optio-purple flex items-center justify-center text-2xl font-semibold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-neutral-900 truncate">{name}</h1>
          <p className="text-sm text-neutral-500">{context.join(' · ') || 'Friends'}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {page.can_message && (
            <Link
              to={friends.messagesLinkFor(peer.id)}
              className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1.5 text-sm text-white font-medium"
            >
              Message
            </Link>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </header>

      {/* What they are working on. Shared quests first, marked; nothing
          about progress. Collaborate invites them to one of yours. */}
      <section className="mt-6" aria-label={`${name}'s quests`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Working on</h2>
          {myQuests.length > 0 && (
            <button
              type="button"
              onClick={() => setCollaborating(true)}
              className="rounded-md border border-optio-purple px-3 py-1.5 text-sm font-medium text-optio-purple hover:bg-optio-purple/5"
            >
              Collaborate
            </button>
          )}
        </div>
        {quests.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No quests in progress right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {quests.map((q) => (
              <li key={q.id}>
                <Link
                  to={`/quests/${q.id}`}
                  className={`flex items-center gap-3 rounded-lg border bg-white p-3 hover:bg-neutral-50 ${q.shared ? 'border-optio-purple/40' : 'border-neutral-200'}`}
                >
                  {q.image_url ? (
                    <img src={q.image_url} alt="" className="h-10 w-10 rounded-md object-cover flex-shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-optio-purple/10 flex-shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-neutral-900 truncate">{q.title}</span>
                    {q.shared && <span className="block text-xs text-optio-purple">You are both on this</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-label={`${name}'s work`}>
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-3">Work</h2>
        {items.length === 0 && !feedLoading ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            {name} has not shared any work yet.
          </p>
        ) : (
          <div className="space-y-3 sm:space-y-5">
            {items.map((item) => (
              <FeedCard key={item.id} item={item} showStudentName={false} />
            ))}
          </div>
        )}
        {feedLoading && (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple" />
          </div>
        )}
        {hasMore && !feedLoading && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => loadFeed(cursor)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
            >
              Show more
            </button>
          </div>
        )}
      </section>

      <CollaborateModal
        isOpen={collaborating}
        onClose={() => setCollaborating(false)}
        friend={peer}
        quests={myQuests}
      />
    </div>
  )
}
