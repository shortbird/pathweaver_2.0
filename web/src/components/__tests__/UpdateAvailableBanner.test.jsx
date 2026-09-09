import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let hookValue
vi.mock('../../hooks/useVersionCheck', () => ({
  default: () => hookValue,
}))

import UpdateAvailableBanner from '../UpdateAvailableBanner'

beforeEach(() => { hookValue = { updateAvailable: false, reload: vi.fn() } })

describe('UpdateAvailableBanner', () => {
  it('renders nothing when no update is available', () => {
    const { container } = render(<UpdateAvailableBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the banner and reloads on click when an update is available', () => {
    const reload = vi.fn()
    hookValue = { updateAvailable: true, reload }
    render(<UpdateAvailableBanner />)
    expect(screen.getByText(/new version of Optio is available/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Reload'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('can be dismissed', () => {
    hookValue = { updateAvailable: true, reload: vi.fn() }
    render(<UpdateAvailableBanner />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText(/new version of Optio is available/i)).not.toBeInTheDocument()
  })
})
