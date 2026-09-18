import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { UserGroupIcon, UserPlusIcon, PaperAirplaneIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import * as friends from '../../services/friendsAPI'

/**
 * FeedFriendsCard -- the student's friends, at the top of their Feed.
 *
 * The Feed is where a friend's work shows up, so it is where a student with
 * no friends notices they have none. Until 2026-09-18 that student got one
 * line, "Connect with another student", which sent them to the Friends page
 * to discover there that Friends was off and only a parent could change it.
 * The card says what is true and offers the one thing the student can do
 * about it:
 *
 *   - Friends on, none yet: the invitation and the two ways in (a classmate,
 *     a code), with Add a friend going straight there.
 *   - Friends on, some: the friends themselves, Add first in the row, and
 *     the requests waiting on the student counted on the door to Friends.
 *   - Friends off and a parent holds the switch: "Ask my parent", which is
 *     the server's ask_parent -- a push to the parent's phone, a web push
 *     and an email, each landing on the switch (/family?friends=<child>).
 *   - Off with nobody to ask, or a birthday still owed: one line to the
 *     Friends page, where the reason and the next step live.
 *   - The school has the module off: nothing. There is nothing to do.
 *
 * Mirrors mobile's components/feed/FriendsStrip.
 */

const primaryBtn = 'inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1.5 text-sm text-white font-medium disabled:opacity-50'
const doorLink = 'inline-flex items-center gap-1 text-sm text-optio-purple hover:text-optio-pink font-medium'

function Avatar({ peer }) {
  if (peer?.avatar_url) {
    return <img src={peer.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
  }
  return (
    <div className="h-12 w-12 rounded-full bg-optio-purple text-white flex items-center justify-center font-semibold">
      {(peer?.display_name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

/** The one line a student sees while Friends is not yet on for them. */
function offLine(eligibility) {
  if (eligibility.state === 'needs_dob' || eligibility.who_can_enable === 'self') return 'Turn on Friends'
  if (eligibility.who_can_enable === 'org_admin' && eligibility.reason) return eligibility.reason
  return 'Friends is off for you'
}

function AskParentCard({ eligibility }) {
  const [asked, setAsked] = useState(false)
  const [asking, setAsking] = useState(false)
  const ask = async () => {
    setAsking(true)
    try {
      await friends.askParent()
      setAsked(true)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send that.')
    } finally {
      setAsking(false)
    }
  }
  return (
    <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4" data-testid="feed-friends-ask">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-optio-purple/10 flex items-center justify-center">
          <UserGroupIcon className="h-6 w-6 text-optio-purple" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Friends is off for you</p>
          <p className="text-sm text-neutral-600">
            {asked
              ? 'Asked. Your parent will get a notification and an email.'
              : eligibility.reason || 'Ask your parent to turn on Friends for you.'}
          </p>
        </div>
      </div>
      {!asked && (
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={ask} disabled={asking} className={primaryBtn}>
            <PaperAirplaneIcon className="h-4 w-4" />
            Ask my parent
          </button>
          <Link to="/connections" className={doorLink}>
            About Friends
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

export default function FeedFriendsCard() {
  const { data: eligibility } = useQuery({
    queryKey: ['connections', 'eligibility'],
    queryFn: () => friends.getEligibility(),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })
  const eligible = eligibility?.state === 'eligible'
  const { data: connections } = useQuery({
    queryKey: ['connections', 'list'],
    queryFn: () => friends.getConnections(),
    enabled: eligible,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })

  if (!eligibility || eligibility.state === 'module_off') return null

  if (eligibility.state === 'friends_off' && eligibility.who_can_enable === 'parent') {
    return <AskParentCard eligibility={eligibility} />
  }

  if (!eligible) {
    return (
      <Link
        to="/connections"
        data-testid="feed-friends-off"
        className="mb-6 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-200"
      >
        <UserGroupIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{offLine(eligibility)}</span>
        <ArrowRightIcon className="h-4 w-4 shrink-0" />
      </Link>
    )
  }

  if (!connections) return null
  const active = connections.active || []
  const waiting = (connections.incoming || []).length
  const seeAll = (
    <Link to="/connections" className={doorLink} data-testid="feed-friends-see-all">
      {waiting > 0 && (
        <span className="rounded-full bg-optio-pink px-1.5 text-xs font-bold text-white" data-testid="feed-friends-badge">{waiting}</span>
      )}
      {waiting > 0 ? (waiting === 1 ? '1 request' : `${waiting} requests`) : 'See all'}
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  )

  if (active.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4" data-testid="feed-friends-empty">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shrink-0 rounded-full bg-optio-purple/10 flex items-center justify-center">
            <UserGroupIcon className="h-6 w-6 text-optio-purple" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">Add friends to see their work here</p>
            <p className="text-sm text-neutral-600">Add a classmate, or share your code with a friend.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Link to="/connections" className={primaryBtn}>
            <UserPlusIcon className="h-4 w-4" />
            Add a friend
          </Link>
          {seeAll}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6" data-testid="feed-friends-strip">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Friends</h2>
        {seeAll}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1">
        <Link to="/connections" className="flex w-14 shrink-0 flex-col items-center gap-1" aria-label="Add a friend">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-optio-purple/50 bg-optio-purple/5">
            <UserPlusIcon className="h-5 w-5 text-optio-purple" />
          </span>
          <span className="text-xs font-medium text-optio-purple">Add</span>
        </Link>
        {active.map((item) => {
          const name = item.peer?.display_name || '?'
          return (
            <Link
              key={item.id}
              to={`/connections/${item.peer?.id}`}
              className="flex w-14 shrink-0 flex-col items-center gap-1"
              aria-label={name}
            >
              <Avatar peer={item.peer} />
              <span className="w-full truncate text-center text-xs text-neutral-700">{name.split(' ')[0]}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
