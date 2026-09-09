/**
 * Answering a double-booking warning.
 *
 * iCreate, 2026-09-05 (8479edee): "The warnings section for teachers and
 * classes is good, but I think I'd like to have a button to hit that allows me
 * to acknowledge I've seen it, but I think it's ok, so clear it from the
 * warnings."
 *
 * The checks are advisory on purpose, so the banner's failure mode is not a
 * false alarm — it is a permanent one. A warning about an arrangement the
 * office made deliberately teaches everybody to scroll past the banner, and the
 * next warning is the accidental one.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { ConflictBanner } from './ClassesPage'

const ROOM = {
  room: 'Spotlight House', class_a: 'Theater Jr.', class_b: 'Brain Games 5-7',
  class_a_id: 'a', class_b_id: 'b',
  key: 'room:spotlight house:a:b:2-11:30-12:30',
}
const SEEN = { ...ROOM, class_b: 'Choir', key: 'room:spotlight house:a:c:2-13:00-14:00' }
const render1 = (props = {}) => {
  const onAcknowledge = vi.fn(async () => {})
  render(
    <ConflictBanner title="Room double-booked" render={(c) => `${c.room}: ${c.class_a} and ${c.class_b}`}
      conflicts={[ROOM]} acknowledged={[]} canAcknowledge onAcknowledge={onAcknowledge}
      {...props} />)
  return onAcknowledge
}

describe('ConflictBanner', () => {
  it('offers a way to wave off each warning', async () => {
    const onAcknowledge = render1()
    fireEvent.click(screen.getByLabelText(/^Dismiss:/))
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledWith(ROOM, true))
  })

  it('keeps what was waved off, behind a toggle', () => {
    render1({ acknowledged: [SEEN] })
    // Not in the way, but not lost either — the office can see its own decision.
    expect(screen.queryByText(/Choir/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/1 marked fine/))
    expect(screen.getByText(/Choir/)).toBeInTheDocument()
  })

  it('can put a waved-off warning back', async () => {
    const onAcknowledge = render1({ conflicts: [], acknowledged: [SEEN] })
    fireEvent.click(screen.getByText(/1 marked fine/))
    fireEvent.click(screen.getByLabelText(/^Warn me again:/))
    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledWith(SEEN, false))
  })

  /**
   * iCreate, 2026-09-08 (04e30fca): "If all the class or teacher warnings are
   * cleared, put the '## marked fine — show' at the bottom of the class list,
   * and mark it as 'teachers double-booked' or whatever the title is."
   *
   * The acknowledgement fixed the false alarm and left a smaller version of the
   * same problem: an amber block at the top of the page that only ever says
   * nothing is wrong teaches the office to scroll past the banner, which is
   * exactly what the next real warning needs them not to do.
   */
  describe('once every warning has been waved off', () => {
    it('names itself, since it no longer sits under a heading', () => {
      render(
        <ConflictBanner title="Teacher double-booked" render={() => 'x'} only="settled"
          conflicts={[]} acknowledged={[SEEN]} canAcknowledge onAcknowledge={vi.fn()} />)
      expect(screen.getByText(/Teacher double-booked/)).toBeInTheDocument()
      expect(screen.getByText(/1 marked fine/)).toBeInTheDocument()
    })

    it('drops the alarm colours', () => {
      const { container } = render(
        <ConflictBanner title="Room double-booked" render={() => 'x'} only="settled"
          conflicts={[]} acknowledged={[SEEN]} canAcknowledge onAcknowledge={vi.fn()} />)
      expect(container.querySelector('.bg-amber-50')).toBeNull()
    })

    it('still opens, and still puts one back', async () => {
      const onAcknowledge = vi.fn(async () => {})
      render(
        <ConflictBanner title="Room double-booked" render={(c) => c.class_b} only="settled"
          conflicts={[]} acknowledged={[SEEN]} canAcknowledge onAcknowledge={onAcknowledge} />)
      fireEvent.click(screen.getByText(/1 marked fine/))
      fireEvent.click(screen.getByLabelText(/^Warn me again:/))
      await waitFor(() => expect(onAcknowledge).toHaveBeenCalledWith(SEEN, false))
    })
  })

  // The two halves are drawn in different places on the page, so each must be
  // able to render without the other.
  it('draws only the live warnings when asked for live', () => {
    render(
      <ConflictBanner title="Room double-booked" render={(c) => c.class_b} only="live"
        conflicts={[ROOM]} acknowledged={[SEEN]} canAcknowledge onAcknowledge={vi.fn()} />)
    expect(screen.getByText(/Brain Games 5-7/)).toBeInTheDocument()
    expect(screen.queryByText(/marked fine/)).not.toBeInTheDocument()
  })

  it('draws nothing for settled while warnings are still live', () => {
    // Otherwise the foot of the class list grows a second empty box on every
    // page that still has a real warning at the top.
    const { container } = render(
      <ConflictBanner title="Room double-booked" render={() => 'x'} only="settled"
        conflicts={[ROOM]} acknowledged={[]} canAcknowledge onAcknowledge={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing at all when there is nothing to say', () => {
    const { container } = render(
      <ConflictBanner title="Room double-booked" render={() => 'x'}
        conflicts={[]} acknowledged={[]} canAcknowledge onAcknowledge={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still shows the warning to somebody who cannot answer it', () => {
    // A campus coordinator sees the schedule and does not set org policy. The
    // warning is the point; the button is the privilege.
    render1({ canAcknowledge: false })
    expect(screen.getByText(/Theater Jr\./)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Dismiss:/)).not.toBeInTheDocument()
  })

  it('never offers to dismiss a warning it cannot name', () => {
    // No key means the server could not identify the overlap, so there is
    // nothing to file the acknowledgement under — showing the button would
    // promise something the POST cannot deliver.
    render1({ conflicts: [{ ...ROOM, key: undefined }] })
    expect(screen.queryByLabelText(/^Dismiss:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Theater Jr\./)).toBeInTheDocument()
  })
})
