/**
 * TeacherVerificationPage at a SIS school. iCreate, ticket aa7c8e19
 * (2026-09-30), from a teacher: "I'm seeing submissions from classes and
 * students I'm not responsible for." The backend now scopes this queue to the
 * teacher's own classes; a SIS school also reviews in the console's
 * Submissions tab, so a bookmark or an old link to this page goes there
 * instead of showing a second, different queue.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import api from '../services/api'
import { switchSurfaceInApp } from '../utils/appSurface'
import TeacherVerificationPage, { SIS_SUBMISSIONS_PATH } from './TeacherVerificationPage'

// vi.mock is hoisted above the imports.

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../contexts/ConfirmContext', () => ({ useConfirm: () => async () => true }))
vi.mock('../components/verification/VerificationModal', () => ({ default: () => null }))
vi.mock('../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const renderPage = () => render(
  <MemoryRouter><TeacherVerificationPage /></MemoryRouter>
)

describe('TeacherVerificationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { pending_verifications: [] } })
  })

  it('sends a SIS school to the console Submissions tab and never reads this queue', async () => {
    authState = { user: { id: 't', organization: { feature_flags: { sis_enabled: true } } } }
    renderPage()
    await waitFor(() =>
      expect(switchSurfaceInApp).toHaveBeenCalledWith('sis', SIS_SUBMISSIONS_PATH))
    expect(SIS_SUBMISSIONS_PATH).toBe('/classes?tab=submissions')
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.queryByText('Task Verification')).toBeNull()
  })

  it('shows the queue at a school without the SIS', async () => {
    authState = { user: { id: 't', organization: { feature_flags: {} } } }
    renderPage()
    expect(await screen.findByText('Task Verification')).toBeTruthy()
    expect(api.get).toHaveBeenCalledWith('/api/teacher/pending-verifications')
    expect(switchSurfaceInApp).not.toHaveBeenCalled()
  })
})
