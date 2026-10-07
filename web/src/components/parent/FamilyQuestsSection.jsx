import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { AcademicCapIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useFamilyScope } from '../../contexts/FamilyScopeContext'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useEndMemberQuest, useEnrollChildrenInQuest, useFamilyQuests } from '../../hooks/api/useFamilyQuests'
import { useArchiveEnrollment } from '../../hooks/api/useQuests'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../utils/queryKeys'
import { markDoneBlocker } from '../../utils/markDoneRule'
import SaveForLaterDialog, { REASON_FOR } from '../quest/SaveForLaterDialog'
import CreateQuestModal from '../CreateQuestModal'
import QuestListItem from '../quest/QuestListItem'
import RhythmBadge from '../quest/RhythmBadge'
import EmptyState from '../ui/EmptyState'

/**
 * Family quests, on the family dashboard.
 *
 * A quest somebody in the family MADE -- private, owned by the parent (set
 * up here) or by a child (Create quest from inside the child's page), with
 * each enrolled child working through their own copy -- or one the parent
 * is themselves enrolled in (a school's training quest, or one they made on
 * their own account: that is what "New Zealand 101" on Paige's dashboard
 * is). Each card names who is on the quest with their rhythm on it -- the
 * engagement metric, not a progress bar; a member's row opens THEIR copy,
 * in family scope for a child and as the parent for the parent. Children
 * not on it yet can be added from the card and arrive with the quest's task
 * list -- a copy of a sibling's when the quest has no template, which is
 * every parent-made quest (2026-09-18: "can I copy-paste the quest to my
 * other kid?") -- and "New family quest" sets one up for whichever children
 * the parent picks (hooks/api/useFamilyQuests). A quest is listed only
 * while somebody in the family is on it -- the backend drops the rest, so a
 * card always has at least one member row.
 *
 * Until 2026-09-15 this section was MyEnrolledQuests: the parent's own
 * enrollments only, with nothing to say whose quest it was and no way to
 * put a child on it.
 */

function MemberInitial({ member }) {
  if (member.avatar_url) {
    return <img src={member.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <span
      aria-hidden="true"
      className="w-7 h-7 rounded-full bg-optio-purple/10 text-optio-purple flex items-center justify-center flex-shrink-0 text-xs font-semibold"
    >
      {(member.first_name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

function MemberRow({ member, xpThreshold, onOpen, onSaveForLater, onMarkDone, busy }) {
  const done = Boolean(member.completed_at)
  const who = member.is_self ? 'your' : `${member.first_name}'s`
  // The quest page's rule (utils/markDoneRule, ticket e17134c6): at the XP
  // finish line, or with no line, after one finished task.
  const blocker = done ? null : markDoneBlocker({
    xpThreshold, earnedXP: member.earned_xp, completedTasks: member.progress?.completed_tasks,
  })
  return (
    <div>
      <div className="group/row flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-optio-purple/5 transition-colors">
        <button
          type="button"
          onClick={() => onOpen(member)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          aria-label={`Open ${who} copy`}
        >
          <MemberInitial member={member} />
          <span className="text-sm text-gray-900 truncate w-20 flex-shrink-0">{member.is_self ? 'You' : member.first_name}</span>
          <span className="min-w-0 flex-1">
            {done ? (
              <span className="block w-fit text-xs font-semibold text-green-700 bg-green-50 rounded-lg px-2 py-1">Completed</span>
            ) : (
              <RhythmBadge rhythm={member.rhythm} days={member.rhythm?.last_7_days} size="sm" label={false} className="w-fit" />
            )}
          </span>
        </button>
        {/* The quest page's two exits, reachable from here so a parent does
            not have to open each child's copy to tidy up. They replaced one
            "End" (ticket e17134c6). */}
        {!done && (
          <span className="flex-shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSaveForLater(member)}
              disabled={busy}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
              aria-label={`Save ${who} quest for later`}
            >
              Save for later
            </button>
            <button
              type="button"
              onClick={() => onMarkDone(member)}
              disabled={busy || Boolean(blocker)}
              className="text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`Mark ${who} quest done`}
            >
              Mark done
            </button>
          </span>
        )}
      </div>
      {blocker && <p className="px-2 pb-1 text-xs text-gray-500">{blocker}</p>}
    </div>
  )
}

function FamilyQuestCard({ quest, kids, onOpen, onAdd, onSaveForLater, onMarkDone, adding, busy }) {
  const onIt = new Set(quest.members.map((m) => m.user_id))
  const notYet = kids.filter((c) => !onIt.has(c.id))
  // The rows and the Add buttons are the card's footer: full width, under
  // the picture, so each row has room for its rhythm badge.
  const footer = (
    <>
      <div className="mt-3 space-y-0.5">
        {quest.members.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            xpThreshold={quest.xp_threshold}
            onOpen={(member) => onOpen(quest, member)}
            onSaveForLater={(member) => onSaveForLater(quest, member)}
            onMarkDone={(member) => onMarkDone(quest, member)}
            busy={busy}
          />
        ))}
      </div>

      {notYet.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-2">
          {notYet.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={adding}
              onClick={() => onAdd(quest, c)}
              className="btn-ghost px-2.5 py-1 text-xs"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add {c.firstName}
            </button>
          ))}
        </div>
      )}
    </>
  )
  return (
    <QuestListItem as="article" quest={quest} footer={footer} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" />
  )
}

export default function FamilyQuestsSection({ className = '' }) {
  const navigate = useNavigate()
  const { children, enterScope, exitScope } = useFamilyScope()
  const { data: quests, isLoading } = useFamilyQuests()
  const enroll = useEnrollChildrenInQuest()
  const endQuest = useEndMemberQuest()
  const archive = useArchiveEnrollment()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  // { quest, member } while the Save for later question is open.
  const [saving, setSaving] = useState(null)

  const openCopy = (quest, member) => {
    // The quest page renders whichever copy the family scope points at: a
    // child's row enters their scope first, the parent's own leaves it.
    if (member.is_self) exitScope()
    else enterScope(member.user_id)
    navigate(`/quests/${quest.id}`)
  }

  const addChild = (quest, child) => enroll.mutate(
    { questId: quest.id, childIds: [child.id] },
    {
      onSuccess: (res) => {
        const failed = res.data?.failed || []
        if (failed.length) { toast.error(failed[0].error || `Could not add ${child.firstName}`); return }
        // The backend gives the child the quest's task list -- the template,
        // or a copy of a sibling's -- and says how many came across.
        const n = res.data?.enrolled?.[0]?.tasks_copied || 0
        toast.success(n ? `${child.firstName} is on ${quest.title} with ${n} task${n === 1 ? '' : 's'}` : `${child.firstName} is on ${quest.title}`)
      },
      onError: (err) => toast.error(err.response?.data?.error || `Could not add ${child.firstName}`),
    },
  )

  // Save for later: the two answers of the quest page's question, for one
  // member's copy -- a child's by student_id, the parent's own without.
  const chooseSaveForLater = (answer) => {
    const { quest, member } = saving
    archive.mutate(
      { questId: quest.id, studentId: member.is_self ? null : member.user_id, reason: REASON_FOR[answer] },
      {
        onSuccess: () => {
          setSaving(null)
          queryClient.invalidateQueries({ queryKey: queryKeys.family.quests() })
        },
      },
    )
  }

  const markDone = async (quest, member) => {
    const remaining = Math.max((member.progress?.total_tasks || 0) - (member.progress?.completed_tasks || 0), 0)
    const whose = member.is_self ? 'your' : `${member.first_name}'s`
    const unfinished = remaining > 0
      ? ` ${remaining} unfinished task${remaining === 1 ? '' : 's'} will leave the dashboard.`
      : ''
    const ok = await confirm({
      title: `Mark ${whose} "${quest.title}" done?`,
      body: `All work and XP are kept, and the quest moves to Completed. It can be reopened from the quest page.${unfinished}`,
      confirmLabel: 'Mark done',
      destructive: false,
    })
    if (!ok) return
    endQuest.mutate(
      { questId: quest.id, studentId: member.is_self ? null : member.user_id },
      {
        onSuccess: () => toast.success(member.is_self ? `You marked ${quest.title} done` : `${quest.title} marked done for ${member.first_name}`),
        onError: (err) => toast.error(err.response?.data?.message || err.response?.data?.error || 'Could not mark the quest done'),
      },
    )
  }

  if (isLoading) return null
  const list = quests || []

  return (
    <section aria-label="Your family's quests" className={className}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <AcademicCapIcon className="w-4 h-4 text-optio-purple" />
          Your family&apos;s quests
        </h2>
        {children.length > 0 && list.length > 0 && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-sm font-medium text-optio-purple hover:underline flex-shrink-0 flex items-center gap-1"
          >
            <PlusIcon className="w-4 h-4" />
            New family quest
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={AcademicCapIcon}
          title="No family quests yet"
          hint="Set up a quest for your children to work through together, each at their own pace."
          action={children.length > 0 ? (
            <button type="button" onClick={() => setCreating(true)} className="btn-primary">
              <PlusIcon className="w-5 h-5" />
              New family quest
            </button>
          ) : null}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((q) => (
            <FamilyQuestCard
              key={q.id}
              quest={q}
              kids={children}
              onOpen={openCopy}
              onAdd={addChild}
              onSaveForLater={(quest, member) => setSaving({ quest, member })}
              onMarkDone={markDone}
              adding={enroll.isPending}
              busy={endQuest.isPending || archive.isPending}
            />
          ))}
        </div>
      )}

      <SaveForLaterDialog
        isOpen={Boolean(saving)}
        onClose={() => setSaving(null)}
        onChoose={chooseSaveForLater}
        // A child's copy goes to the child's Saved for Later; the parent's own
        // has no such list, so the way back is the quest page.
        hasSavedForLaterList={Boolean(saving && !saving.member.is_self)}
        busy={archive.isPending}
      />

      <CreateQuestModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        familyChildren={children}
        onSuccess={(quest, result) => {
          const n = result?.enrolled?.length || 0
          toast.success(n ? `${quest?.title || 'Quest'} set up for ${n} ${n === 1 ? 'child' : 'children'}` : 'Quest created')
        }}
      />
    </section>
  )
}
