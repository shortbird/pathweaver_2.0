import React, { useEffect, useState } from 'react'
import { AcademicCapIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import QuestCardSimple from '../quest/QuestCardSimple'

/**
 * The quests on your own account, for the homes that are not the student
 * dashboard.
 *
 * iCreate, 2026-08-17. Schools now set training and orientation quests for
 * their teachers, admins and families, and assign them straight onto those
 * accounts. But a parent, teacher or org admin never sees the student
 * dashboard, and none of the role homes had a quest surface at all — so an
 * assigned quest existed on the account with nowhere in the app to meet it.
 * A teacher could reach theirs through the SIS training page; a parent had
 * only the school card in the family portal; an admin had nothing.
 *
 * Renders nothing at all when there is nothing enrolled, so a home that has
 * never been assigned a quest is unchanged.
 *
 * The card is QuestCardSimple — the same one the student dashboard renders, in
 * the same grid. A quest is a quest whoever is doing it, and a second card
 * design for the same object is how two views of one thing drift apart.
 */

/**
 * /api/quests/my-active returns the quest row with progress attached;
 * QuestCardSimple wants the shape the dashboard builds. Same mapping as
 * DashboardPage so both stay honest about enrollment and completion.
 */
const toCardQuest = (q) => ({
  id: q.id,
  title: q.title,
  description: q.description || q.big_idea,
  image_url: q.image_url,
  header_image_url: q.header_image_url,
  metadata: q.metadata,
  user_enrollment: true,
  completed_enrollment: Boolean(q.completed_at),
  progress: {
    completed_tasks: q.progress?.completed_tasks || 0,
    total_tasks: q.progress?.total_tasks || 0,
    percentage: Math.round(q.progress?.percentage || 0),
  },
  quest_tasks: q.quest_tasks || [],
})

export default function MyEnrolledQuests({ className = '' }) {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.get('/api/quests/my-active')
      .then((r) => { if (alive) setQuests(r.data?.quests || []) })
      // A home must not break because one card could not load.
      .catch(() => { if (alive) setQuests([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading || !quests.length) return null

  return (
    <section aria-labelledby="my-quests-heading" className={className}>
      <div className="flex items-center gap-2 mb-2">
        <AcademicCapIcon aria-hidden="true" className="w-4 h-4 text-optio-purple flex-shrink-0" />
        <h2 id="my-quests-heading" className="text-sm font-semibold text-gray-900">
          Your quests
        </h2>
        <span className="text-xs text-gray-500">
          {quests.length === 1 ? '1 in progress' : `${quests.length} in progress`}
        </span>
      </div>

      {/* Two columns, not the dashboard's three. The role homes are max-w-3xl,
          where a third column leaves each card around 230px and the progress
          strip wraps to "Ready / to / Begin". Same card, room to breathe. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {quests.map((q) => (
          <QuestCardSimple key={q.id} quest={toCardQuest(q)} />
        ))}
      </div>
    </section>
  )
}
