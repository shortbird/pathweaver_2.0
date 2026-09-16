import { useState } from 'react'
import { func, string } from 'prop-types'
import { useQuery } from '@tanstack/react-query'
import * as friends from '../../services/friendsAPI'
import FriendsExplainerModal from './FriendsExplainerModal'

/**
 * FriendsOffNudge — "Friends is off for Jane. Turn it on."
 *
 * Three phases of Friends shipped with the switch off for every child and
 * the setting three screens deep. This is the one line on the family
 * dashboard that brings the switch to the parent. The button opens
 * FriendsExplainerModal -- what Friends is, then the switch -- rather than
 * flipping it on the spot: the first version did, with a "Read the rules
 * first" link beside it that opened Family Settings, and a parent who
 * wanted to know what they were agreeing to found every other setting
 * instead (owner, 2026-09-16). Renders nothing once Friends is on, when
 * this adult may not set it, or when the school has the module off.
 */
export default function FriendsOffNudge({ childId, childFirstName, onOpenSettings }) {
  const [explaining, setExplaining] = useState(false)
  const { data } = useQuery({
    queryKey: ['connections', 'policy', childId],
    queryFn: () => friends.getChildPolicy(childId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })
  const policy = data?.policy
  if (!policy || policy.enabled || !data?.can_set || policy.origin === 'module_off') return null

  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-3">
      <p className="text-xs text-gray-700">
        Friends is off for {childFirstName}. Friends see each other&rsquo;s work and encourage it.
        You choose the rules, see everything, and can turn it off any time.
      </p>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setExplaining(true)}
          className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1.5 text-xs font-medium text-white"
        >
          Turn on Friends
        </button>
      </div>
      <FriendsExplainerModal
        childId={childId}
        childFirstName={childFirstName}
        isOpen={explaining}
        onClose={() => setExplaining(false)}
        onOpenSettings={onOpenSettings}
      />
    </div>
  )
}

FriendsOffNudge.propTypes = {
  childId: string.isRequired,
  childFirstName: string.isRequired,
  onOpenSettings: func,
}
