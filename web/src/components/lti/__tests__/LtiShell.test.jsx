/**
 * LtiShell tests — loading/error/content branching + title gating.
 * The frame-resize postMessage is exercised at runtime but not asserted
 * here (window.parent === window under jsdom → branch is a no-op).
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LtiShell from '../LtiShell'

describe('LtiShell', () => {
  it('renders the spinner when loading (not children)', () => {
    render(
      <LtiShell loading>
        <span>hidden while loading</span>
      </LtiShell>,
    )
    expect(screen.getByTestId('lti-shell-loading')).toBeInTheDocument()
    expect(screen.queryByText('hidden while loading')).not.toBeInTheDocument()
  })

  it('renders the error message (not children) when error is set', () => {
    render(
      <LtiShell error="Launch token exchange failed.">
        <span>hidden on error</span>
      </LtiShell>,
    )
    expect(screen.getByTestId('lti-shell-error')).toBeInTheDocument()
    expect(screen.getByText('Launch token exchange failed.')).toBeInTheDocument()
    expect(screen.queryByText('hidden on error')).not.toBeInTheDocument()
  })

  it('renders children when neither loading nor error', () => {
    render(
      <LtiShell>
        <span>quest content here</span>
      </LtiShell>,
    )
    expect(screen.getByText('quest content here')).toBeInTheDocument()
    expect(screen.queryByTestId('lti-shell-loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lti-shell-error')).not.toBeInTheDocument()
  })

  it('shows title/subtitle only in the content state', () => {
    const { rerender } = render(
      <LtiShell title="Build Something" subtitle="Jane Doe">
        <span>body</span>
      </LtiShell>,
    )
    expect(screen.getByText('Build Something')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()

    rerender(
      <LtiShell title="Build Something" subtitle="Jane Doe" loading>
        <span>body</span>
      </LtiShell>,
    )
    expect(screen.queryByText('Build Something')).not.toBeInTheDocument()
  })
})
