import React from 'react'
import { useChildSummary } from '../../hooks/api/useFamilyChildren'
import WeeklyXpGoalCard from '../overview/WeeklyXpGoalCard'
import RhythmBadge from '../quest/RhythmBadge'
import ChildAvatarUpload from './ChildAvatarUpload'
import { forChild, useConnectionApprovals } from '../../hooks/api/useConnectionApprovals'
import FriendsOffNudge from './FriendsOffNudge'
import { timeAgo } from '../../utils/timeFormat'

/**
 * One child on the family dashboard (pages/home/FamilyHome.jsx).
 *
 * The card answers "how is this child doing" without opening them: their
 * picture (click it to set one -- ChildAvatarUpload), the numbers that move (XP, streak, when they were last active),
 * the quests they are on with the child's RHYTHM on each (not a progress
 * bar -- the process is the goal, and "In Flow" says more about a week than
 * "3/7 tasks"), and the weekly goal as one line. The summary is
 * /api/parent/dashboard/:id via useChildSummary -- the same read the mobile
 * Family tab makes -- and until it lands, or if it fails, the card still
 * stands: name, picture, and Open.
 *
 * "Open" enters family scope and takes the parent to the child's dashboard;
 * a quest row does the same and lands on that quest, so the parent is
 * working WITH that child on it; the child's name lands on their full
 * profile (/overview). The child's own pages are the full version
 * of everything summarised here. A child's settings are a tab of Family
 * Settings, reached from the page header, not from the card -- except that a
 * friend request waiting on the parent is announced here as one line that
 * opens that tab, because the answer is wanted this week and the card is
 * where the parent looks.
 */

const MAX_QUESTS = 3

/** "1,250 XP · 3 quests · 4-day streak · Active 2d ago" */
function StatLine({ summary }) {
  if (!summary) return null
  const parts = []
  const xp = summary.student?.total_xp ?? summary.stats?.total_xp
  if (typeof xp === 'number') parts.push(`${xp.toLocaleString()} XP`)
  const quests = summary.stats?.active_quests_count
  if (typeof quests === 'number') parts.push(`${quests} active quest${quests === 1 ? '' : 's'}`)
  const streak = summary.student?.streak_days
  if (streak > 0) parts.push(`${streak}-day streak`)
  const last = summary.learning_rhythm?.last_activity_date
  parts.push(last ? `Active ${timeAgo(last)}` : 'No activity yet')
  return <p className="text-xs text-gray-500 truncate">{parts.join(' · ')}</p>
}

function ActiveQuests({ quests, onOpenQuest }) {
  if (!quests?.length) return null
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quests</h4>
      <ul className="mt-1.5 space-y-1">
        {quests.slice(0, MAX_QUESTS).map((q) => (
          <li key={q.quest_id}>
            <button
              type="button"
              onClick={() => onOpenQuest(q.quest_id)}
              className="w-full rounded-lg px-1.5 py-1 -mx-1.5 text-left hover:bg-optio-purple/5 transition-colors"
            >
              <span className="block text-sm text-gray-900 truncate">{q.title}</span>
              {/* The class that set it, when one did. A class quest sits on
                  the child's list like any other, and a parent could not tell
                  Language Studio B's vocab quest from a quest the child picked
                  (Marika Connole, iCreate, ticket 55ef3acf). */}
              {q.class_assignment?.class_name && (
                <span className="block text-xs text-gray-500 truncate">{q.class_assignment.class_name}</span>
              )}
              <RhythmBadge rhythm={q.rhythm} days={q.rhythm?.last_7_days} size="sm" className="mt-1" />
            </button>
          </li>
        ))}
        {quests.length > MAX_QUESTS && (
          <li className="text-xs text-gray-400">and {quests.length - MAX_QUESTS} more</li>
        )}
      </ul>
    </div>
  )
}

/** "1 friend request waiting" -> the child's Friends settings. */
function PendingRequestsLine({ childId, onOpenSettings }) {
  const { data } = useConnectionApprovals()
  const { pending } = forChild(data, childId)
  if (pending.length === 0) return null
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className="mt-3 w-full text-left text-xs font-medium text-optio-purple hover:underline flex items-center gap-1.5"
    >
      <span className="rounded-full bg-optio-pink px-1.5 text-[10px] font-bold leading-4 text-white">
        {pending.length}
      </span>
      {pending.length === 1 ? 'Friend request waiting for you' : `${pending.length} friend requests waiting for you`}
    </button>
  )
}

export default function ChildCard({ child, onOpen, onOpenQuest, onOpenProfile, onOpenSettings }) {
  const { data: summary } = useChildSummary(child.id)
  const quiet = summary && !summary.active_quests?.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col">
      <div className="flex items-center gap-3">
        <ChildAvatarUpload
          childId={child.id}
          name={child.name}
          avatarUrl={summary?.student?.avatar_url || child.avatarUrl}
        />
        <div className="min-w-0 flex-1">
          {/* The name opens the child's full profile (/overview, in their scope). */}
          <button
            type="button"
            onClick={() => onOpenProfile(child)}
            className="block max-w-full text-sm font-semibold text-gray-900 truncate hover:text-optio-purple hover:underline text-left"
          >
            {child.name}
          </button>
          <StatLine summary={summary} />
        </div>
        <button
          type="button"
          onClick={() => onOpen(child)}
          className="btn-primary px-3 py-1.5 flex-shrink-0"
        >
          Open
        </button>
      </div>

      <ActiveQuests quests={summary?.active_quests} onOpenQuest={(questId) => onOpenQuest(child, questId)} />
      {quiet && (
        <p className="mt-3 text-xs text-gray-400">No quests yet. Open {child.firstName} to start one.</p>
      )}

      <WeeklyXpGoalCard
        studentId={child.id}
        studentFirstName={child.firstName}
        className="mt-3"
        compact
      />

      {onOpenSettings && (
        <PendingRequestsLine childId={child.id} onOpenSettings={() => onOpenSettings(child)} />
      )}
      <FriendsOffNudge
        childId={child.id}
        childFirstName={child.firstName || child.name}
        onOpenSettings={onOpenSettings ? () => onOpenSettings(child) : undefined}
      />
    </div>
  )
}
