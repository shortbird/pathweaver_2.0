import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import { isPathHidden } from './sisModules'
import BackToDashboard from '../../components/sis/BackToDashboard'
import GlassTabBar from '../../components/ui/GlassTabBar'
import StudentsPanel from './studentsPage/StudentsPanel'
import SubmissionsPanel from './classesPage/SubmissionsPanel'

/**
 * Students -- the individual_work module's own page (2026-10-08).
 *
 * Some schools teach in classes; some, like Apogee Cache Valley, work with
 * each student one at a time. Until this page the only way to a student's
 * individual page was a tab on Classes, so a school with classes switched off
 * had none (docs/sis/SIS_SIMPLIFICATION.md, decision 1). Two tabs: every
 * student, and the submissions inbox, which follows its own module. Classes
 * keeps its own Submissions tab for schools that teach in classes; the inbox
 * is one component and one queue either way.
 */

const TABS = [
  ['students', 'Students'],
  ['submissions', 'Submissions', '/submissions'],
]

const StudentsPage = () => {
  const { activeOrg } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = TABS.filter(([, , gate]) => !gate || !isPathHidden(gate, activeOrg))
  const rawTab = searchParams.get('tab')
  const tab = tabs.some(([t]) => t === rawTab) ? rawTab : 'students'

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'students') params.delete('tab')
    else params.set('tab', next)
    // A submission deep link belongs to its tab.
    if (next !== 'submissions') { params.delete('completion_id'); params.delete('class_id'); params.delete('from') }
    setSearchParams(params, { replace: true })
  }

  return (
    <div>
      <BackToDashboard className="mb-1" />
      <h1 className="text-2xl font-bold text-neutral-900 mb-4">Students</h1>
      {tabs.length > 1 && (
        <GlassTabBar
          align="start" size="md" className="mb-5" aria-label="Students sections"
          tabs={tabs.map(([id, label]) => ({ id, label }))}
          active={tab} onSelect={setTab}
        />
      )}
      {tab === 'students' && <StudentsPanel />}
      {tab === 'submissions' && <SubmissionsPanel />}
    </div>
  )
}

export default StudentsPage
