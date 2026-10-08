/**
 * Settings cards name the building block they need
 * (docs/MICROSCHOOL_FIRST_PLAN.md part 2; Horizon, 2026-10-07).
 *
 * Rooms and time blocks are the classes block's; incident reports land as
 * tasks, so they need tasks or onboarding (the pair /api/sis/incident-reports
 * answers for); calendar categories need the calendar. Quick links and step
 * printing (which prints a quest task's steps, not an office task) stay.
 */
import { describe, expect, it } from 'vitest'
import { settingsCardsFor } from './settingsRegistry'

const keys = (mods) => settingsCardsFor({
  surface: 'console', seesFinance: true,
  org: { id: 'org-1', effective_modules: ['sis', ...mods] },
}).map((c) => c.key)

describe('settingsCardsFor follows the modules', () => {
  it('shows rooms, time blocks, incident reports and calendar categories with their blocks on', () => {
    const got = keys(['classes', 'tasks', 'calendar'])
    for (const k of ['rooms', 'time-blocks', 'incident-reports', 'calendar-categories']) {
      expect(got).toContain(k)
    }
  })

  it('drops rooms and time blocks without classes', () => {
    const got = keys(['tasks', 'calendar'])
    expect(got).not.toContain('rooms')
    expect(got).not.toContain('time-blocks')
  })

  it('keeps incident reports while either tasks or onboarding is on', () => {
    expect(keys(['onboarding'])).toContain('incident-reports')
    expect(keys(['tasks'])).toContain('incident-reports')
    expect(keys([])).not.toContain('incident-reports')
  })

  it('drops calendar categories without the calendar', () => {
    expect(keys(['classes'])).not.toContain('calendar-categories')
  })

  it('keeps quick links and step printing for every school', () => {
    const got = keys([])
    expect(got).toContain('quick-links')
    expect(got).toContain('step-printing')
  })
})
