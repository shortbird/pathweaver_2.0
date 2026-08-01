import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * A body that may or may not be formatted.
 *
 * iCreate, 2026-08-01: "A rich text editor would be nice on the announcements
 * and on the messages." Everything already in the table was typed plain, so
 * both kinds live side by side forever — and rendering one as the other is the
 * visible failure (raw <p> tags on a family's screen, or a wall of text).
 */

import AnnouncementBody from './AnnouncementBody'
import { isHtml, htmlToText, isBlank } from '../../utils/richText'

describe('AnnouncementBody', () => {
  it('renders a formatted body as formatting, not as tags', () => {
    const { container } = render(
      <AnnouncementBody text="<p>Early dismissal <strong>Friday</strong>.</p>" />,
    )
    expect(container.querySelector('strong')).toHaveTextContent('Friday')
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument()
  })

  it('keeps the line breaks of a body typed before the editor existed', () => {
    const { container } = render(<AnnouncementBody text={'Line one\nLine two'} />)
    const p = container.querySelector('p')
    expect(p.className).toContain('whitespace-pre-wrap')
    expect(p).toHaveTextContent('Line one Line two')
  })

  it('drops a script that somehow reached the table', () => {
    const { container } = render(
      <AnnouncementBody text="<p>Hi</p><script>alert(1)</script>" />,
    )
    expect(container.querySelector('script')).toBeNull()
  })

  it('renders nothing for an empty body', () => {
    const { container } = render(<AnnouncementBody text="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('richText helpers', () => {
  it('tells a formatted body from a typed one', () => {
    expect(isHtml('<p>Hi</p>')).toBe(true)
    expect(isHtml('Pickup is < 10 minutes after the bell')).toBe(false)
  })

  it('reads the text of a formatted body, one line per block', () => {
    expect(htmlToText('<p>Early dismissal</p><ul><li>Buses at noon</li></ul>'))
      .toBe('Early dismissal\nBuses at noon')
  })

  it('knows an empty editor is empty', () => {
    // The reason `!content.trim()` is not the check: an empty editor still
    // emits markup, so a blank announcement would sail past validation.
    expect(isBlank('<p></p>')).toBe(true)
    expect(isBlank('<p><br></p>')).toBe(true)
    expect(isBlank('<p>Something</p>')).toBe(false)
  })
})
