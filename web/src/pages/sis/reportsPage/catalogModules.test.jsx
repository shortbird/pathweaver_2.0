/**
 * Each report names the building block it reads, and hides without it
 * (docs/MICROSCHOOL_FIRST_PLAN.md part 2).
 *
 * Horizon, 2026-10-07: turning the console on handed every school a
 * sixteen-report page built for iCreate -- payments, waitlists, registration
 * answers -- whether or not the school billed or registered through Optio.
 */
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { REPORTS, visibleReports } from './catalog'
import ReportNav from './ReportNav'

const keys = (seesMoney, org) => visibleReports(seesMoney, org).map((r) => r.key)
const org = (mods) => ({ id: 'org-1', effective_modules: ['sis', 'reports', ...mods] })
const EVERYTHING = org(['classes', 'attendance', 'registration', 'billing', 'tasks', 'onboarding'])

describe('visibleReports filters by module', () => {
  it('lists every report for a school with every block on', () => {
    expect(keys(true, EVERYTHING)).toEqual(REPORTS.map((r) => r.key))
  })

  it('a null org hides nothing but money for a non-finance caller (as before)', () => {
    expect(keys(true, null)).toEqual(REPORTS.map((r) => r.key))
    expect(keys(false, null)).not.toContain('payments')
  })

  it('billing off drops Payments even for a finance caller', () => {
    expect(keys(true, org(['classes', 'attendance', 'registration']))).not.toContain('payments')
  })

  it('classes off drops the roster and class reports', () => {
    const got = keys(true, org(['attendance', 'registration', 'billing']))
    for (const k of ['rosters', 'day-rosters', 'block-rosters', 'student-schedule', 'classes']) {
      expect(got).not.toContain(k)
    }
  })

  it('attendance off drops daily attendance and who took roll', () => {
    const got = keys(true, org(['classes', 'registration', 'billing']))
    expect(got).not.toContain('daily-attendance')
    expect(got).not.toContain('roll-call')
  })

  it('registration off drops registration answers and media release', () => {
    const got = keys(true, org(['classes', 'attendance', 'billing', 'tasks']))
    expect(got).not.toContain('question')
    expect(got).not.toContain('media-release')
    expect(got).toContain('checklist-completion')
  })

  it('task completion needs tasks or onboarding, either one', () => {
    expect(keys(true, org(['onboarding']))).toContain('checklist-completion')
    expect(keys(true, org(['tasks']))).toContain('checklist-completion')
    expect(keys(true, org([]))).not.toContain('checklist-completion')
  })

  it('reports on people and households stay for every school', () => {
    const got = keys(true, org([]))
    for (const k of ['overview', 'medications', 'allergies', 'emergency-contacts', 'family-locations']) {
      expect(got).toContain(k)
    }
  })
})

describe('ReportNav hides a group left empty', () => {
  it('drops the Money, Attendance and Registration headings with their blocks off', () => {
    const reports = visibleReports(true, org(['classes']))
    render(<ReportNav reports={reports} activeKey="overview" onPick={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Reports' })
    expect(nav).toHaveTextContent('Rosters & schedules')
    expect(nav).not.toHaveTextContent('Money')
    expect(nav).not.toHaveTextContent('Attendance')
    expect(nav).not.toHaveTextContent('Registration')
  })

  it('keeps them with the blocks on', () => {
    render(<ReportNav reports={visibleReports(true, EVERYTHING)} activeKey="overview" onPick={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Reports' })
    expect(nav).toHaveTextContent('Money')
    expect(nav).toHaveTextContent('Attendance')
    expect(nav).toHaveTextContent('Registration')
  })
})
