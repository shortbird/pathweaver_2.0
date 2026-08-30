import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import ClassDiscussion from '../discussion/ClassDiscussion'

/**
 * A guardian's read-only view of their child's class discussion boards.
 *
 * Every class quest page carries a board any enrolled student can post on, and
 * until 2026-08-30 no adult surface showed it: Gryffin's students wrote 80
 * posts in two days while their teacher asked whether "teachers and parents
 * see a group chat". Teachers moderate from the class page; this is the
 * parent's window onto the same posts.
 *
 * Same lookup as StudentSchedulePreview (the SIS parent context names the org,
 * the schedule names the classes). Each board is ClassDiscussion, which the
 * backend answers read-only for a guardian (can_post=false) and refuses (403,
 * so the board hides itself) when the teacher has switched it off.
 */
export default function ChildClassDiscussions({ studentId, studentFirstName }) {
  const [classes, setClasses] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/api/sis/parent/context')
      .then(async (r) => {
        const orgs = r.data?.orgs || []
        const org = orgs.find((o) => (o.students || []).some((s) => s.student_id === studentId))
        if (!org) { if (alive) setClasses([]); return }
        const sched = await api.get(`/api/sis/parent/students/${studentId}/schedule?organization_id=${org.organization_id}`)
        if (alive) setClasses(sched.data?.classes || [])
      })
      .catch(() => { if (alive) setClasses([]) })
    return () => { alive = false }
  }, [studentId])

  if (!classes || !classes.length) return null

  const who = studentFirstName || 'your student'
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Class discussions</h2>
        <p className="text-sm text-neutral-500">
          What {who} and their classmates post on each class board. You can read every post; only the class and its teacher can write.
        </p>
      </div>
      {classes.map((c) => (
        <ClassDiscussion key={c.id} classId={c.id} title={c.name} />
      ))}
    </section>
  )
}
