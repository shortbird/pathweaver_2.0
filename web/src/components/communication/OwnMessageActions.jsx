import React, { useState } from 'react'
import { useEditMessage, useDeleteMessage } from '../../hooks/api/useDirectMessages'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * Edit and delete your own DMs from a page that renders bare MessageBubbles
 * (the SIS inbox) rather than MessageThread.
 *
 * Ticket ecc73d0e (iCreate campus coordinator): "I would like to delete a
 * message that I sent by mistake." On My messages the ordinary DM rules apply
 * (you are the sender). On the School tab the sender is the school, so only
 * delete is offered, and only on a message the server marks can_delete -- the
 * ones this colleague wrote as the school. School group messages have no
 * record of which colleague wrote them, so they stay undeletable.
 */
export const useOwnMessageActions = ({ conversationId, source }) => {
  const editMutation = useEditMessage()
  const deleteMutation = useDeleteMessage()
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState(null)

  const permissions = (message, { fromMe, asSchool }) => {
    const live = !message.isOptimistic && !message.is_deleted
    const canEdit = live && !asSchool && fromMe
    const canDelete = live && (asSchool ? !!message.can_delete : fromMe)
    return { canEdit, canDelete, isEditing: canEdit && editingId === message.id }
  }

  const remove = async (message) => {
    if (!(await confirm('Delete this message?'))) return
    deleteMutation.mutate({ conversationId, messageId: message.id, source })
  }

  /** Props for MessageBubble's edit form. */
  const editProps = (message, isEditing) => ({
    isEditing,
    onSaveEdit: (content) => editMutation.mutate(
      { conversationId, messageId: message.id, content },
      { onSuccess: () => setEditingId(null) }),
    onCancelEdit: () => setEditingId(null),
    savingEdit: editMutation.isPending,
  })

  /** Props for OwnMessageLinks. */
  const linkProps = (message, { canEdit, canDelete, isEditing }) => ({
    canEdit: canEdit && !isEditing,
    canDelete: canDelete && !isEditing,
    onEdit: () => setEditingId(message.id),
    onDelete: () => remove(message),
    deleting: deleteMutation.isPending,
  })

  return { permissions, editProps, linkProps }
}

/** The quiet Edit / Delete links under an own message. */
export const OwnMessageLinks = ({ canEdit, canDelete, onEdit, onDelete, deleting = false }) => {
  if (!canEdit && !canDelete) return null
  return (
    <div className="mt-0.5 flex justify-end gap-2">
      {canEdit && (
        <button type="button" onClick={onEdit}
          className="text-[11px] text-neutral-400 hover:text-optio-purple">
          Edit
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={onDelete} disabled={deleting}
          className="text-[11px] text-neutral-400 hover:text-red-600 disabled:opacity-50">
          Delete
        </button>
      )}
    </div>
  )
}
