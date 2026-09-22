import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

import { setReporterPanelOpen } from '../../feedback/reporterOpen'

/**
 * A modal must let go of focus while the issue reporter's panel is open.
 *
 * focus-trap keeps focus inside the dialog on every focusin -- `allowOutsideClick`
 * exempts the click, not the focus -- so the reporter's textarea lost focus
 * the moment it took it, nothing could be typed, and Send refused the empty
 * message. An iCreate org admin hit this trying to report a bug about the
 * composer she had open at the time (2026-09-22).
 *
 * The steal itself cannot be reproduced here: `tabbable` reads element
 * geometry to decide what is focusable, and jsdom reports every element as
 * zero-sized, so the trap finds nothing to pull focus back to. What this pins
 * is the contract that fixes it -- the modal pauses its trap, and unpauses
 * when the panel closes.
 */
const trapProps = []
vi.mock('focus-trap-react', () => ({
  default: ({ children, ...props }) => {
    trapProps.push(props)
    return <div data-testid="focus-trap">{children}</div>
  },
}))

const { Modal } = await import('../Modal')

beforeEach(() => { trapProps.length = 0; setReporterPanelOpen(false) })
afterEach(() => setReporterPanelOpen(false))

const last = () => trapProps[trapProps.length - 1]

describe('Modal and the issue reporter', () => {
  it('holds focus while the reporter is closed', () => {
    render(<Modal isOpen onClose={() => {}} title="New message"><p>hi</p></Modal>)
    expect(last().paused).toBe(false)
  })

  it('stands down while the reporter panel is open, and takes over again after', () => {
    render(<Modal isOpen onClose={() => {}} title="New message"><p>hi</p></Modal>)

    act(() => setReporterPanelOpen(true))
    expect(last().paused).toBe(true)

    act(() => setReporterPanelOpen(false))
    expect(last().paused).toBe(false)
  })

  it('pauses rather than deactivates, so Escape and return-focus still work', () => {
    render(<Modal isOpen onClose={() => {}} title="New message"><p>hi</p></Modal>)
    act(() => setReporterPanelOpen(true))
    expect(last().focusTrapOptions.returnFocusOnDeactivate).toBe(true)
    expect(last().active).not.toBe(false)
  })
})
