import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClassesPage from './ClassesPage'

/**
 * The Classes page offers a tab only when its block is on
 * (docs/MICROSCHOOL_FIRST_PLAN.md part 2; Horizon, 2026-10-07): Optio courses
 * follows `courses`, Attendance follows `attendance`, Submissions follows
 * `submissions`.
 */

let activeOrg = null
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1', name: 'Org' } }) }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'org-1', orgs: [], activeOrg }) }))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null }))
vi.mock('./classesPage/MyClassesPanel', () => ({ default: () => null }))
vi.mock('./classesPage/MySchedulePanel', () => ({ default: () => null }))
vi.mock('./classesPage/CatalogPanel', () => ({ default: () => null, ConflictBanner: () => null }))
vi.mock('./classesPage/AttendancePanel', () => ({ default: () => null }))
vi.mock('./classesPage/SubmissionsPanel', () => ({ default: () => null }))

const tabsFor = (mods) => {
  activeOrg = { id: 'org-1', effective_modules: ['sis', 'classes', ...mods] }
  render(<MemoryRouter><ClassesPage /></MemoryRouter>)
  return screen.getAllByRole('tab').map((t) => t.textContent)
}

describe('ClassesPage tabs follow the modules', () => {
  it('offers Optio courses, Attendance and Submissions with their blocks on', () => {
    const tabs = tabsFor(['courses', 'attendance', 'submissions'])
    expect(tabs).toEqual(expect.arrayContaining(['Optio courses', 'Attendance', 'Submissions']))
  })

  it('drops each with its block off, and keeps the classes tabs', () => {
    const tabs = tabsFor([])
    expect(tabs).not.toContain('Optio courses')
    expect(tabs).not.toContain('Attendance')
    expect(tabs).not.toContain('Submissions')
    expect(tabs).toEqual(expect.arrayContaining(['My classes', 'Org classes']))
  })
})
