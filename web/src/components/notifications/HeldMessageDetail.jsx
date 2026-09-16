import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getHold } from '../../services/friendsAPI'
import { AttachmentList } from '../communication/MessageParts'

/**
 * What a peer_text_held notification is about, inside the notification
 * modal: the words the child wrote, the pictures the message carried, where
 * it was going, and why the screen held it.
 *
 * The notification's "View Details" used to be a link to /family, and a
 * parent reading it FROM /family clicked and nothing happened (2026-09-15).
 * The detail is fetched by hold id from the notification's metadata; a
 * notification from before the id was recorded shows the message text it
 * already carries, which quotes the words.
 */

const SURFACE_LABEL = {
  group_message: 'a class chat message',
  message: 'a message',
  peer_comment: "a comment on a friend's work",
  upload: 'a picture',
}

export function holdWhere(hold) {
  if (hold?.group?.name) return `in ${hold.group.name}`
  if (hold?.peer?.display_name) return `to ${hold.peer.display_name}`
  return ''
}

/**
 * `fallback` is the notification's own message, shown when the hold cannot
 * be loaded: it quotes the words, so the parent is never left with nothing.
 */
export default function HeldMessageDetail({ holdId, fallback }) {
  const { data: hold, error, isLoading } = useQuery({
    queryKey: ['held-message', holdId],
    queryFn: () => getHold(holdId),
    enabled: !!holdId,
    staleTime: 60_000,
    retry: false,
  })

  if (!holdId) return null
  if (error) {
    return (
      <div className="space-y-2">
        {fallback && <p className="text-gray-700">{fallback}</p>}
        <p className="text-sm text-gray-500">
          {error?.response?.data?.error || 'Could not load the held message'}
        </p>
      </div>
    )
  }
  if (isLoading || !hold) {
    return (
      <div className="animate-pulse space-y-2" data-testid="held-message-loading">
        <div className="h-3 w-40 bg-gray-100 rounded" />
        <div className="h-16 w-full bg-gray-100 rounded" />
      </div>
    )
  }

  // One sentence, then the message. The notification's own text already
  // said "wrote a message that our safety check held" and quoted the words;
  // repeating both here read as a stutter (2026-09-15).
  const what = SURFACE_LABEL[hold.surface] || 'a message'
  const verb = hold.surface === 'upload' ? 'uploaded' : 'wrote'
  const when = hold.surface === 'upload'
    ? 'It was held before it was saved, so nobody else saw it.'
    : hold.stage === 'refused'
      ? 'It was held before it was sent, so nobody else saw it.'
      : 'It posted while our check was unavailable and was hidden afterwards.'
  const where = holdWhere(hold)

  return (
    <div className="space-y-3" data-testid="held-message-detail">
      <p className="text-sm text-gray-600">
        {hold.author?.display_name || 'Your child'} {verb} {what}{where ? ` ${where}` : ''}. {when}
      </p>
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        {hold.text && <p className="text-sm text-gray-900 whitespace-pre-wrap">{hold.text}</p>}
        <AttachmentList attachments={hold.attachments} />
        {!hold.text && !(hold.attachments?.length) && (
          <p className="text-sm text-gray-500">(empty)</p>
        )}
      </div>
      {hold.reasons?.length > 0 && (
        <p className="text-xs text-gray-500">
          Why: {hold.reasons.join('; ')}
        </p>
      )}
    </div>
  )
}
