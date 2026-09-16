import { useState } from 'react'
import { bool, func, string } from 'prop-types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import * as friends from '../../services/friendsAPI'
import FriendsHowItWorks from './FriendsHowItWorks'

/**
 * FriendsExplainerModal -- what Friends is, and the switch.
 *
 * The one-tap nudge on the family dashboard turned Friends on before the
 * parent had read anything; the "rules" beside it opened Family Settings,
 * which is every setting for the child and reads nothing like an
 * explanation (owner, 2026-09-16). This is the explanation: what a friend
 * sees, how one is added, what they can do, what the parent sees, and how
 * to end it -- then the switch, at the bottom, after all of that. Turning
 * Friends on is the parent's consent, so the text is the same commitment
 * the privacy policy makes, in the parent's words.
 *
 * Opened from FriendsOffNudge. The text is FriendsHowItWorks, shared with
 * the Friends section of the child's settings. The policy is the same
 * react-query row the nudge reads, so opening it costs no request.
 */
export default function FriendsExplainerModal({ childId, childFirstName, isOpen, onClose, onOpenSettings }) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const { data } = useQuery({
    queryKey: ['connections', 'policy', childId],
    queryFn: () => friends.getChildPolicy(childId),
    enabled: isOpen && !!childId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })
  const policy = data?.policy
  const alreadyOn = !!policy?.enabled
  const canTurnOn = !!policy && !alreadyOn && !!data?.can_set && policy.origin !== 'module_off'
  const name = childFirstName

  const turnOn = async () => {
    setSaving(true)
    try {
      await friends.setChildPolicy(childId, { enabled: true })
      queryClient.invalidateQueries({ queryKey: ['connections', 'policy', childId] })
      toast.success(`Friends is on for ${name}. You can change the rules in Family settings.`)
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not turn Friends on.')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-xs text-gray-500">
        {alreadyOn
          ? `Friends is on for ${name}.`
          : `Turning Friends on is your consent to share ${name}’s work with the friends they make.`}
      </p>
      <div className="flex gap-2 justify-end flex-shrink-0">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          {canTurnOn ? 'Not now' : 'Close'}
        </Button>
        {canTurnOn && (
          <Button variant="primary" size="sm" onClick={turnOn} disabled={saving} loading={saving}>
            Turn on Friends
          </Button>
        )}
        {alreadyOn && onOpenSettings && (
          <Button variant="primary" size="sm" onClick={() => { onClose(); onOpenSettings() }}>
            Friends settings
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How Friends works" size="md" footer={footer}>
      <FriendsHowItWorks name={name} />
    </Modal>
  )
}

FriendsExplainerModal.propTypes = {
  childId: string.isRequired,
  childFirstName: string.isRequired,
  isOpen: bool.isRequired,
  onClose: func.isRequired,
  /** Opens the child's tab of Family Settings. Offered when Friends is already on. */
  onOpenSettings: func,
}
