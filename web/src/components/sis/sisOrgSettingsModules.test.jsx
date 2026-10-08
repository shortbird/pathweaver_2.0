import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SisOrgSettings from './SisOrgSettings'

/**
 * The org card's money rows follow billing (docs/MICROSCHOOL_FIRST_PLAN.md
 * part 2; Horizon, 2026-10-07): "Optio course tuition" and "Materials
 * allowance per student" are prices, and a school that does not bill through
 * Optio has nothing to price.
 */

vi.mock('../../services/api', () => ({ default: { put: vi.fn(), post: vi.fn(), get: vi.fn() } }))
vi.mock('../../hooks/api/useSisSettings', () => ({ patchSisSettings: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const renderFor = (mods) => render(
  <SisOrgSettings orgId="org-1" orgData={{ organization: {
    id: 'org-1', name: 'Test Academy', feature_flags: { sis_enabled: true },
    effective_modules: ['sis', 'classes', ...mods],
  } }} />,
)

describe('SisOrgSettings money rows', () => {
  it('shows Optio course tuition and the materials allowance with billing on', () => {
    renderFor(['billing'])
    expect(screen.getByLabelText('Optio course tuition')).toBeInTheDocument()
    expect(screen.getByLabelText('Materials allowance per student')).toBeInTheDocument()
  })

  it('drops both with billing off, and keeps the Optio courses switch', () => {
    renderFor([])
    expect(screen.queryByLabelText('Optio course tuition')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Materials allowance per student')).not.toBeInTheDocument()
    expect(screen.getByText('Optio courses')).toBeInTheDocument()
  })
})
