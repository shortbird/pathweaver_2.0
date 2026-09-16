import { useState } from 'react'
import { array, bool, func, object } from 'prop-types'
import { toast } from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import * as friends from '../../services/friendsAPI'

/**
 * CollaborateModal -- invite a friend to do a quest alongside you.
 *
 * Two doors, one modal. From a friend's page the friend is fixed and the
 * student picks one of their own quests in progress; from a quest page the
 * quest is fixed and the student picks a friend. Either way the server
 * sends one notification with the quest a tap away, and the two pages show
 * "You are both on this" once the friend starts it. Each student does their
 * own tasks and earns their own XP -- the invite is the whole feature, on
 * purpose (2026-09-16); joint evidence waits until this shows use.
 */
export default function CollaborateModal({ isOpen, onClose, friend, quests, quest, friendList }) {
  const [sending, setSending] = useState(null)
  const pickingQuest = !!friend
  const options = pickingQuest ? (quests || []) : (friendList || [])

  const invite = async (option) => {
    const peerId = pickingQuest ? friend.id : option.id
    const questId = pickingQuest ? option.id : quest.id
    const who = pickingQuest ? friend.display_name : option.display_name
    setSending(option.id)
    try {
      const out = await friends.collaborate(peerId, questId)
      toast.success(out?.already_on_quest
        ? `${who} is on it too. They have been told.`
        : `Invited ${who}.`)
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send that invite.')
    } finally {
      setSending(null)
    }
  }

  const title = pickingQuest ? `Collaborate with ${friend.display_name}` : `Collaborate on ${quest?.title || 'this quest'}`
  const lead = pickingQuest
    ? `Pick one of your quests. ${friend.display_name} gets an invite with the quest one tap away.`
    : 'Pick a friend. They get an invite with this quest one tap away.'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-base text-gray-700">{lead}</p>
      {options.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          {pickingQuest ? 'Start a quest first, then invite a friend to it.' : 'No friends yet. Add one from the Friends page.'}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {options.map((o) => {
            const label = pickingQuest ? o.title : o.display_name
            const already = pickingQuest ? o.shared : o.on_quest
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-base text-gray-900 truncate">{label}</span>
                  {already && <span className="block text-xs text-optio-purple">Already on this quest</span>}
                </span>
                <Button size="sm" variant={already ? 'secondary' : 'primary'} onClick={() => invite(o)} disabled={sending !== null} loading={sending === o.id}>
                  {already ? 'Nudge' : 'Invite'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

CollaborateModal.propTypes = {
  isOpen: bool.isRequired,
  onClose: func.isRequired,
  /** From a friend's page: the friend, and the student's own quests in progress. */
  friend: object,
  quests: array,
  /** From a quest page: the quest, and the student's friends (`on_quest` marks those already on it). */
  quest: object,
  friendList: array,
}

CollaborateModal.defaultProps = {
  friend: null,
  quests: [],
  quest: null,
  friendList: [],
}
