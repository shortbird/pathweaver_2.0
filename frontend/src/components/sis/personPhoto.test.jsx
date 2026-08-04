import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * iCreate, 2026-08-04, twice: "It'd be really helpful if we could click on the
 * image of the person and make it bigger so we could actually see what they look
 * like", and on a class roster, "this would help teachers remember who is in
 * their class."
 *
 * The two properties that matter beyond "it gets bigger": the click must not
 * also fire the row/card underneath (that would open a modal on top of the
 * photo), and initials must stay inert — there's nothing to enlarge, so
 * suggesting otherwise is a dead end.
 */

import PersonPhoto from './PersonPhoto'

const inRow = (props, onRowClick) => render(
  <div onClick={onRowClick} data-testid="row">
    <PersonPhoto {...props} />
  </div>
)

describe('PersonPhoto', () => {
  it('enlarges the photo on click', () => {
    inRow({ src: 'https://cdn.example/kid.jpg', name: 'Robin Scott' }, () => {})
    expect(screen.queryByAltText('Robin Scott')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /See Robin Scott's photo/ }))

    expect(screen.getByAltText('Robin Scott')).toBeInTheDocument()
    expect(screen.getByText('Robin Scott')).toBeInTheDocument()
  })

  it('does not trigger the surrounding row when the photo is clicked', () => {
    let rowClicks = 0
    inRow({ src: 'https://cdn.example/kid.jpg', name: 'Robin Scott' }, () => { rowClicks += 1 })

    fireEvent.click(screen.getByRole('button', { name: /See Robin Scott's photo/ }))
    expect(rowClicks).toBe(0)
  })

  it('closes the lightbox again', () => {
    inRow({ src: 'https://cdn.example/kid.jpg', name: 'Robin Scott' }, () => {})
    fireEvent.click(screen.getByRole('button', { name: /See Robin Scott's photo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByAltText('Robin Scott')).not.toBeInTheDocument()
  })

  it('falls back to inert initials when there is no photo', () => {
    inRow({ name: 'Robin Scott' }, () => {})
    expect(screen.getByText('RS')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
