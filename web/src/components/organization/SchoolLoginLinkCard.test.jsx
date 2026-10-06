import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
// vi.mock is hoisted above this import, so the mocks below still apply.
import SchoolLoginLinkCard from './SchoolLoginLinkCard'

vi.mock('../../contexts/ConfirmContext', () => ({ usePromptText: () => vi.fn() }))
// The card is on SIS console Settings too. sis.optioeducation.com has no
// /login/<slug>, so the link must name the learning app's host (2026-10-06).
vi.mock('../../utils/appSurface', () => ({ getLearningOrigin: () => 'https://app.example.test' }))


describe('SchoolLoginLinkCard', () => {
  it('shows the learning app login link, not this page’s host', () => {
    render(<SchoolLoginLinkCard slug="apogee" />)
    expect(screen.getByText('https://app.example.test/login/apogee')).toBeInTheDocument()
  })

  it('renders nothing without a slug', () => {
    const { container } = render(<SchoolLoginLinkCard slug="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
