import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import { isPathHidden } from './sisModules'
import GlassTabBar from '../../components/ui/GlassTabBar'
import WeeklyGoalsPage from './WeeklyGoalsPage'
import YearGoalsPanel from './goalsPage/YearGoalsPanel'
import GoalsReviewPage from './GoalsReviewPage'

/**
 * Goals -- one page for every kind of goal a school keeps (2026-10-08,
 * docs/sis/SIS_SIMPLIFICATION.md decision 3). It was two sidebar items: Goals
 * (the parents' goal setting, built for registration schools) and Weekly
 * Goals (a coach's Monday goals and Thursday check-in). Each tab shows only
 * when its module is on:
 *
 *   This week     the weekly goals and the check-in        weekly_goals
 *   Year goals    what each student works toward this year weekly_goals
 *   Family goals  goals parents set, for staff to review    goals
 *
 * One student's goals also show on their own page (StudentGoals).
 */

const TABS = [
  ['week', 'This week', '/weekly-goals'],
  ['year', 'Year goals', '/weekly-goals'],
  ['family', 'Family goals', '/family-goals'],
]

const GoalsPage = () => {
  const { activeOrg } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = TABS.filter(([, , gate]) => !isPathHidden(gate, activeOrg))
  const rawTab = searchParams.get('tab')
  const tab = tabs.some(([t]) => t === rawTab) ? rawTab : tabs[0]?.[0]

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === tabs[0]?.[0]) params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-4">Goals</h1>
      {tabs.length > 1 && (
        <GlassTabBar
          align="start" size="md" className="mb-5" aria-label="Goals sections"
          tabs={tabs.map(([id, label]) => ({ id, label }))}
          active={tab} onSelect={setTab}
        />
      )}
      {tab === 'week' && <WeeklyGoalsPage embedded />}
      {tab === 'year' && <YearGoalsPanel />}
      {tab === 'family' && <GoalsReviewPage embedded />}
    </div>
  )
}

export default GoalsPage
