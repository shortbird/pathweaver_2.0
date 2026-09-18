import React from 'react'
import { toast } from 'react-hot-toast'
import {
  AcademicCapIcon, CheckCircleIcon, LinkIcon, ArrowTopRightOnSquareIcon, TrashIcon,
} from '@heroicons/react/24/outline'
import { switchSurfaceInApp } from '../../utils/appSurface'
import { useSetTrainingDone } from '../../hooks/api/useTraining'
import { progressLabel, progressStyle, xpLabel, xpStyle, words } from '../../pages/sis/trainingCopy'

/**
 * One row of the Training page's list, whatever kind the training is (M18).
 *
 * A quest row shows the person's progress and opens the quest on the web
 * platform, where it is completed; a link row opens the link in a new tab and
 * is completed here, by pressing done. The done button is a toggle, because
 * the wrong row gets pressed sometimes and a mark nobody can undo is a report
 * nobody trusts. Admin actions differ by kind: a quest can be assigned,
 * published and have its finish line moved; a link is edited or removed.
 */

const Pill = ({ className, children, title }) => (
  <span className={`text-[11px] px-2 py-0.5 rounded-full ${className}`} title={title}>{children}</span>
)

const LinkRow = ({ item, orgId, admin, onEdit, onRemove, onChanged }) => {
  const setDone = useSetTrainingDone(orgId, { onSuccess: onChanged })
  const done = !!item.my_done

  const toggleDone = async () => {
    try {
      await setDone.mutateAsync({ id: item.id, done: !done })
      toast.success(done ? 'Marked as not done' : `"${item.title}" marked done`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update it')
    }
  }

  return (
    <div className="p-4 flex items-start gap-3">
      {done
        ? <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        : <LinkIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-neutral-900">{item.title}</span>
          <Pill className="bg-gray-100 text-neutral-500">Link</Pill>
          {item.is_required && <Pill className="bg-optio-purple/10 text-optio-purple">Required</Pill>}
          <Pill className={done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-500'}>
            {done ? 'Done' : 'Not done'}
          </Pill>
        </div>
        {item.description && (
          <p className="text-sm text-neutral-500 mt-0.5 whitespace-pre-wrap line-clamp-3">{item.description}</p>
        )}
        <div className="flex items-center gap-4 mt-1">
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline">
            Open <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          </a>
          <button type="button" onClick={toggleDone} disabled={setDone.isPending}
            className="text-sm text-neutral-600 hover:text-optio-purple hover:underline disabled:opacity-50">
            {done ? 'Mark as not done' : 'Mark as done'}
          </button>
        </div>
      </div>
      {admin && (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit}
            className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50">
            Edit
          </button>
          <button type="button" onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500"
            aria-label={`Remove ${item.title}`}>
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

const QuestRow = ({
  item: t, audience, admin, assigning, onAssign, onPick, onPublish, onEdit, onRemove, onSaveXp,
}) => (
  <div className="p-4 flex items-start gap-3">
    {t.my_progress?.completed
      ? <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
      : <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-neutral-900">{t.title}</span>
        {t.is_required && <Pill className="bg-optio-purple/10 text-optio-purple">Required</Pill>}
        {t.is_draft && (
          <Pill className="bg-amber-100 text-amber-800" title="Only admins can see this">Draft</Pill>
        )}
        {/* "On everyone's accounts" read as a claim that it was already live
            for everyone. It is a setting, not a state: what it means is that
            new arrivals get it too. */}
        {admin && t.auto_assign && !t.is_draft && (
          <Pill className="bg-blue-50 text-blue-700"
            title={`Any ${words(audience).one} who joins later gets this automatically`}>
            Auto-assigns to new {words(audience).joiners}
          </Pill>
        )}
        <Pill className={progressStyle(t.my_progress)}>{progressLabel(t.my_progress)}</Pill>
        {xpLabel(t) && <Pill className={xpStyle(t)}>{xpLabel(t)}</Pill>}
      </div>
      {t.description && <p className="text-sm text-neutral-500 mt-0.5 line-clamp-2">{t.description}</p>}
      {admin && t.quest_is_ours && (
        <label className="flex items-center gap-2 text-xs text-neutral-500 mt-1.5">
          XP to finish
          <input type="number" min={0} step={25} defaultValue={t.xp_threshold || ''}
            onBlur={(e) => onSaveXp(t, e.target.value)}
            placeholder="Any"
            aria-label={`XP required to finish ${t.title}`}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
        </label>
      )}
      <button
        onClick={() => switchSurfaceInApp('learning', `/quests/${t.quest_id}`)}
        className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline mt-1"
      >
        {t.my_progress?.started ? 'Continue' : 'Start this Quest'}
        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
      </button>
    </div>
    {admin && (
      <div className="flex items-center gap-1 shrink-0">
        {/* A quest built here can be picked back up; a library one belongs
            to every school, so it is not ours to rewrite. */}
        {t.quest_is_ours && (
          <button onClick={onEdit}
            className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50">
            Edit
          </button>
        )}
        <button onClick={onPick}
          className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50">
          Choose people
        </button>
        {t.is_draft ? (
          <button onClick={onPublish}
            className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-semibold">
            Publish
          </button>
        ) : (
          <button onClick={onAssign} disabled={assigning}
            className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
            {assigning ? 'Assigning…' : 'Assign to everyone'}
          </button>
        )}
        <button onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500"
          aria-label={`Remove ${t.title}`}>
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
)

export default function TrainingRow({ item, ...rest }) {
  return item.kind === 'link' ? <LinkRow item={item} {...rest} /> : <QuestRow item={item} {...rest} />
}
