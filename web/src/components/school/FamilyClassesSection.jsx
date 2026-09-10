import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import StudentClasses from '../parent/StudentClasses'

/**
 * A guardian's children's classes, on the school page.
 *
 * `/school` is where a family goes for school things, and it had a class
 * schedule and a materials list for the STUDENT viewing it — both of which
 * render nothing for a parent, because a parent has no enrollments of their
 * own. So a guardian opening the page their school points them at saw the feed
 * and the rail, and nothing at all about their own children's classes; the
 * answer lived on /parent/dashboard/:id, a different surface reached a
 * different way (iCreate, 2026-09-10: "parents should see classes for their kid
 * in one place").
 *
 * One block per child, because "one place" for a family with three of them
 * means all three. Renders nothing for a student, an observer, or a guardian
 * whose children are not in a SIS school.
 */
const FamilyClassesSection = () => {
  const [students, setStudents] = useState([])

  useEffect(() => {
    let alive = true
    api.get('/api/sis/parent/context')
      .then((r) => {
        if (!alive) return
        const seen = new Map()
        for (const org of (r.data?.orgs || [])) {
          for (const s of (org.students || [])) {
            if (s.student_id && !seen.has(s.student_id)) seen.set(s.student_id, s)
          }
        }
        setStudents([...seen.values()])
      })
      // Not a guardian, or no SIS school. Both are ordinary; render nothing.
      .catch(() => { if (alive) setStudents([]) })
    return () => { alive = false }
  }, [])

  if (!students.length) return null

  return (
    <div className="space-y-4 mb-6">
      {students.map((s) => (
        <div key={s.student_id}>
          <StudentClasses
            studentId={s.student_id}
            title={students.length > 1
              ? `${s.first_name || s.name || 'Student'}'s classes`
              : 'Classes'}
          />
        </div>
      ))}
      {students.length > 0 && (
        <p className="text-xs text-neutral-400 px-1">
          Need to add or drop a class?{' '}
          <Link to="/schedule-builder" className="text-optio-purple hover:underline">
            Schedule Builder
          </Link>
        </p>
      )}
    </div>
  )
}

export default FamilyClassesSection
