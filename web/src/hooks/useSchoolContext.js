import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * The school this user is in, for the school-wide pages (calendar, resources,
 * directory).
 *
 * Those pages used to bootstrap from /api/sis/parent/context, which answers
 * "where am I a GUARDIAN" and is empty for a student or a teacher who guards
 * nobody — so a child at iCreate opening the school calendar was told their
 * account wasn't linked to a school. /api/sis/school/context resolves
 * membership instead, and reports guardianship separately.
 *
 * Guardian-only pages (billing, absences, portal, requests, schedule) keep
 * using the parent context: for them, "not a guardian" is the correct answer.
 *
 * Returns `orgs: null` while loading, `[]` once it's known there are none.
 */
export default function useSchoolContext() {
  const [orgs, setOrgs] = useState(null)
  const [isGuardian, setIsGuardian] = useState(false)

  useEffect(() => {
    let active = true
    api.get('/api/sis/school/context')
      .then(({ data }) => {
        if (!active) return
        setOrgs(data?.orgs || [])
        setIsGuardian(Boolean(data?.is_guardian))
      })
      .catch(() => { if (active) setOrgs([]) })
    return () => { active = false }
  }, [])

  return { orgs, isGuardian, loading: orgs === null }
}
