import React from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { useDiscardQuestDraft, useQuestDrafts } from '../../../hooks/api/useQuestEditor'

/**
 * Drafts: quests somebody started in the quest editor and has not published.
 *
 * Every screen that makes quests shows its own (P6, owner decision
 * 2026-09-23): a class shows its drafts (a teacher sees their own, the office
 * all of them), a curriculum its drafts, and the library every draft in the
 * school outside training -- so a teacher's abandoned class draft can be
 * found. Training lists its drafts as rows of the catalog, as it always has.
 *
 * Drafts are never deleted automatically. Resume opens the editor where the
 * draft was started; Discard deletes it, after asking.
 */

const WHERE = { library: 'Library', class: 'Class', curriculum: 'Curriculum', training: 'Training' }

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')

export default function QuestDraftsList({ orgId, context, classId, curriculumId, showWhere = false, onResume }) {
  const confirm = useConfirm()
  const { data: drafts = [] } = useQuestDrafts(orgId, { context, classId, curriculumId })
  const discard = useDiscardQuestDraft(orgId)

  if (!drafts.length) return null

  const onDiscard = async (d) => {
    if (!(await confirm({
      title: `Discard "${d.title || 'Untitled draft'}"?`,
      body: 'The draft, its tasks and its attachments are deleted. This cannot be undone.',
      confirmLabel: 'Discard draft',
      cancelLabel: 'Keep it',
    }))) return
    try {
      await discard.mutateAsync({ questId: d.id })
      toast.success('Draft discarded')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not discard the draft')
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-dashed border-gray-300 bg-white p-3" aria-label="Drafts">
      <h3 className="text-sm font-semibold text-neutral-900">
        Drafts <span className="font-normal text-neutral-400">({drafts.length})</span>
      </h3>
      <p className="text-xs text-neutral-500 mb-2">
        Not published yet, so nobody else sees them. They stay here until you publish or discard them.
      </p>
      <ul className="divide-y divide-gray-100">
        {drafts.map((d) => (
          <li key={d.id} className="py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">{d.title || 'Untitled draft'}</p>
              <p className="text-xs text-neutral-400">
                {[
                  showWhere && (d.target_name ? `${WHERE[d.context] || ''}: ${d.target_name}` : WHERE[d.context]),
                  d.created_by_name && `Started by ${d.created_by_name}`,
                  d.updated_at && `last changed ${when(d.updated_at)}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button type="button" onClick={() => onResume?.(d)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-medium hover:bg-optio-purple/5">
              Resume
            </button>
            <button type="button" onClick={() => onDiscard(d)} disabled={discard.isPending}
              className="shrink-0 text-sm text-neutral-400 hover:text-red-600 hover:underline disabled:opacity-50">
              Discard
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
