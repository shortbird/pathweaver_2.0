import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

/**
 * ClassDiscussion — threaded discussion board for one SIS class.
 *
 * Pass EITHER `classId` (org_classes.id — SIS class detail / teacher page) OR
 * `questId` (learning-app quest page; the backend resolves the owning class the
 * viewer participates in). Access is enforced by the backend: teacher(s),
 * enrolled students, and org_admin/superadmin only. When the viewer is not a
 * participant (or the quest is not linked to a class) the backend returns 403/404
 * and this component renders nothing.
 *
 * MVP: top-level posts (newest first) each with replies (oldest first),
 * a post composer, per-post reply composer, and delete controls where allowed.
 *
 * The backend also says what the viewer may do: `can_post` is false for a
 * guardian reading their child's board (no composers), `is_moderator` gets the
 * on/off switch, and `discussion_enabled` false means the board is closed --
 * students never reach this state (403 hides the board); a moderator sees the
 * history plus a "Turn on" button.
 */
export default function ClassDiscussion({ classId, questId, className = '', title = 'Discussion' }) {
  const { user } = useAuth()

  const base = questId
    ? `/api/sis/classes/by-quest/${questId}/discussion`
    : `/api/sis/classes/${classId}/discussion`

  const [posts, setPosts] = useState([])
  const [meta, setMeta] = useState({ isModerator: false, canPost: true, enabled: true })
  const [switching, setSwitching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [hidden, setHidden] = useState(false)

  const [newPost, setNewPost] = useState('')
  const [posting, setPosting] = useState(false)
  const [replyFor, setReplyFor] = useState(null)
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)

  const load = useCallback(async () => {
    if (!classId && !questId) return
    setLoading(true)
    setError(false)
    try {
      const { data } = await api.get(base)
      setPosts(data?.posts || [])
      setMeta({
        isModerator: !!data?.is_moderator,
        canPost: data?.can_post !== false,
        enabled: data?.discussion_enabled !== false,
      })
    } catch (err) {
      const status = err?.response?.status
      // Not a participant, or the quest has no class discussion — hide quietly.
      if (status === 403 || status === 404) {
        setHidden(true)
      } else {
        setError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [base, classId, questId])

  useEffect(() => { load() }, [load])

  const submitPost = async (e) => {
    e.preventDefault()
    const body = newPost.trim()
    if (!body) return
    setPosting(true)
    try {
      await api.post(base, { body })
      setNewPost('')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not post your message')
    } finally {
      setPosting(false)
    }
  }

  const submitReply = async (parentId) => {
    const body = replyBody.trim()
    if (!body) return
    setReplying(true)
    try {
      await api.post(base, { body, parent_post_id: parentId })
      setReplyBody('')
      setReplyFor(null)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not post your reply')
    } finally {
      setReplying(false)
    }
  }

  const deletePost = async (postId) => {
    try {
      await api.delete(`${base}/${postId}`)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not delete this post')
    }
  }

  // The switch lives on the class-keyed route; the quest page never shows it.
  const setBoardEnabled = async (enabled) => {
    setSwitching(true)
    try {
      await api.patch(`/api/sis/classes/${classId}/discussion/settings`, { enabled })
      toast.success(enabled ? 'Discussion is on for this class' : 'Discussion is off for this class')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change the discussion setting')
    } finally {
      setSwitching(false)
    }
  }

  if (hidden) return null

  const showSwitch = meta.isModerator && !!classId

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-optio-purple shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 truncate">{title}</h2>
          {!meta.enabled && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">Off</span>
          )}
        </div>
        {showSwitch && (
          <button
            type="button"
            onClick={() => setBoardEnabled(!meta.enabled)}
            disabled={switching}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-neutral-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {meta.enabled ? 'Turn off for this class' : 'Turn on for this class'}
          </button>
        )}
      </div>

      {!meta.enabled && (
        <p className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Discussion is off. Students cannot see this board or post on it. Earlier posts stay here for you.
        </p>
      )}

      {/* Composer (participants who may write; a guardian only reads) */}
      {meta.canPost && (
      <form onSubmit={submitPost} className="mb-6">
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          rows={3}
          maxLength={8000}
          placeholder="Share something with the class..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-optio-purple resize-y"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={posting || !newPost.trim()}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50"
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-6 text-gray-500">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-optio-purple" />
          <span className="text-sm">Loading discussion...</span>
        </div>
      )}

      {!loading && error && (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500">We could not load the discussion.</p>
          <button onClick={load} className="mt-2 text-sm text-optio-purple hover:underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">
          {meta.canPost ? 'No posts yet. Start the conversation.' : 'No posts yet.'}
        </p>
      )}

      {!loading && !error && posts.length > 0 && (
        <ul className="space-y-4">
          {posts.map((post) => (
            <li key={post.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
              <PostHeader post={post} onDelete={deletePost} />
              <p className={`mt-1 text-sm whitespace-pre-wrap break-words ${post.deleted ? 'italic text-gray-400' : 'text-gray-800'}`}>
                {post.body}
              </p>

              {/* Replies */}
              {post.replies?.length > 0 && (
                <ul className="mt-3 space-y-3 border-l-2 border-gray-200 pl-3 sm:pl-4">
                  {post.replies.map((reply) => (
                    <li key={reply.id}>
                      <PostHeader post={reply} onDelete={deletePost} />
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">
                        {reply.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {/* Reply composer (not offered on a deleted/tombstone post, nor
                  to a viewer who only reads) */}
              {!post.deleted && meta.canPost && (
                <div className="mt-3">
                  {replyFor === post.id ? (
                    <div>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={2}
                        maxLength={8000}
                        placeholder="Write a reply..."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-optio-purple resize-y"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => { setReplyFor(null); setReplyBody('') }}
                          className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => submitReply(post.id)}
                          disabled={replying || !replyBody.trim()}
                          className="px-3 py-1.5 rounded-lg bg-optio-purple text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {replying ? 'Replying...' : 'Reply'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setReplyFor(post.id); setReplyBody('') }}
                      className="text-sm font-medium text-optio-purple hover:underline"
                    >
                      Reply
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PostHeader({ post, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className={`text-sm font-semibold ${post.deleted ? 'text-gray-400' : 'text-gray-900'}`}>
          {post.author_name}
        </span>
        {post.created_at && (
          <span className="ml-2 text-xs text-gray-400">{formatWhen(post.created_at)}</span>
        )}
      </div>
      {post.can_delete && (
        <button
          onClick={() => onDelete(post.id)}
          className="shrink-0 p-1 text-gray-400 hover:text-red-500"
          aria-label="Delete post"
          title="Delete"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}
