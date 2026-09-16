import { useEffect, useState } from 'react'
import { bool, object } from 'prop-types'
import { Link } from 'react-router-dom'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import * as friends from '../../services/friendsAPI'
import CollaborateModal from '../connections/CollaborateModal'

/**
 * QuestFriendsCard -- the friends on this quest, and the door to inviting one.
 *
 * "Sam is on this quest too" with Message beside it, for a student whose
 * friend is doing the same quest; and Collaborate, which invites a friend
 * to it. Students only: a parent in family scope is on the child's copy of
 * the quest, and the invite is the child's to send. Renders nothing for a
 * student with no friends, so the page is unchanged for the many who have
 * none yet. Both reads fail quietly: a friends line is not worth an error
 * banner on a quest page.
 */
export default function QuestFriendsCard({ quest, isEnrolled, hidden = false }) {
  const [onQuest, setOnQuest] = useState(null)
  const [allFriends, setAllFriends] = useState([])
  const [collaborating, setCollaborating] = useState(false)

  useEffect(() => {
    if (hidden || !quest?.id) return undefined
    let cancelled = false
    Promise.all([
      friends.friendsOnQuest(quest.id).catch(() => []),
      friends.getConnections().then((c) => c?.active || []).catch(() => []),
    ]).then(([here, conns]) => {
      if (cancelled) return
      setOnQuest(here)
      const hereIds = new Set(here.map((f) => f.id))
      setAllFriends(conns.map((c) => ({ ...c.peer, on_quest: hereIds.has(c.peer?.id) })))
    })
    return () => { cancelled = true }
  }, [quest?.id, hidden])

  if (hidden || onQuest === null || allFriends.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <UserGroupIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
        {onQuest.length === 0 ? (
          <p className="text-sm text-gray-600">Doing this with a friend? Invite them.</p>
        ) : (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {onQuest.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <Link to={`/connections/${f.id}`} className="flex items-center gap-2 hover:underline">
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-optio-purple/10 text-optio-purple text-xs font-semibold flex items-center justify-center">
                      {(f.display_name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium text-gray-900">{f.display_name}</span>
                </Link>
                <span className="text-gray-500">is on this too</span>
                {f.can_message && (
                  <Link to={friends.messagesLinkFor(f.id)} className="text-optio-purple font-medium hover:underline">Message</Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {isEnrolled && (
        <button
          type="button"
          onClick={() => setCollaborating(true)}
          className="flex-shrink-0 rounded-md border border-optio-purple px-3 py-1.5 text-sm font-medium text-optio-purple hover:bg-optio-purple/5"
        >
          Collaborate
        </button>
      )}
      <CollaborateModal
        isOpen={collaborating}
        onClose={() => setCollaborating(false)}
        quest={quest}
        friendList={allFriends}
      />
    </div>
  )
}

QuestFriendsCard.propTypes = {
  quest: object.isRequired,
  isEnrolled: bool,
  /** True for a parent in family scope, whose child sends their own invites. */
  hidden: bool,
}
