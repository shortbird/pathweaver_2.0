import { useState } from 'react'
import { func, string } from 'prop-types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import * as friends from '../../services/friendsAPI'

/**
 * FriendsOffNudge — "Friends is off for Jane. Turn it on."
 *
 * Three phases of Friends shipped with the switch off for every child and
 * the setting three screens deep. This is the one line on the family
 * dashboard that brings the switch to the parent. One tap turns it on
 * under the default rules; the settings link is beside it for a parent who
 * wants to read the rules first. Renders nothing once Friends is on, when
 * this adult may not set it, or when the school has the module off.
 */
export default function FriendsOffNudge({ childId, childFirstName, onOpenSettings }) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const { data } = useQuery({
    queryKey: ['connections', 'policy', childId],
    queryFn: () => friends.getChildPolicy(childId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })
  const policy = data?.policy
  if (!policy || policy.enabled || !data?.can_set || policy.origin === 'module_off') return null

  const turnOn = async () => {
    setSaving(true)
    try {
      await friends.setChildPolicy(childId, { enabled: true })
      queryClient.invalidateQueries({ queryKey: ['connections', 'policy', childId] })
      toast.success(`Friends is on for ${childFirstName}.`)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not turn Friends on.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-3">
      <p className="text-xs text-gray-700">
        Friends is off for {childFirstName}. Friends see each other&rsquo;s work and encourage it.
        You choose the rules, see everything, and can turn it off any time.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={turnOn}
          disabled={saving}
          className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Turn on Friends
        </button>
        {onOpenSettings && (
          <button type="button" onClick={onOpenSettings} className="text-xs font-medium text-optio-purple hover:underline">
            Read the rules first
          </button>
        )}
      </div>
    </div>
  )
}

FriendsOffNudge.propTypes = {
  childId: string.isRequired,
  childFirstName: string.isRequired,
  onOpenSettings: func,
}
