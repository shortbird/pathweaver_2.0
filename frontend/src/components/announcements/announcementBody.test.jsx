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

describe('links render as buttons, not URLs', () => {
  it('turns a URL pasted into a plain body into a hostname-labeled button', () => {
    const { container } = render(
      <AnnouncementBody text={'Sign up here: https://www.signupgenius.com/go/abc123. Thanks!'} />,
    )
    const a = container.querySelector('a')
    expect(a).toHaveAttribute('href', 'https://www.signupgenius.com/go/abc123')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveTextContent('signupgenius.com')
    // The trailing period stays with the sentence, not the link.
    expect(container).toHaveTextContent('. Thanks!')
  })

  it('keeps the text the author wrote on an editor link', () => {
    const { container } = render(
      <AnnouncementBody text={'<p>Please <a href="https://forms.example.com/x">fill out the form</a>.</p>'} />,
    )
    const a = container.querySelector('a')
    expect(a).toHaveTextContent('fill out the form')
    expect(a.className).toContain('bg-optio-purple/10')
  })

  it('relabels an editor link whose text is just its own URL', () => {
    const { container } = render(
      <AnnouncementBody text={'<p>See <a href="https://docs.google.com/document/d/1">https://docs.google.com/document/d/1</a></p>'} />,
    )
    expect(container.querySelector('a')).toHaveTextContent('docs.google.com')
    // The external-link icon must survive the render site's re-sanitize
    // (LINK_BUTTON_CONFIG admits exactly it).
    expect(container.querySelector('a svg path')).not.toBeNull()
  })

  it('turns a bare URL typed as editor text into a button too', () => {
    const { container } = render(
      <AnnouncementBody text={'<p>Details at https://acme-school.org/handbook</p>'} />,
    )
    const a = container.querySelector('a')
    expect(a).toHaveAttribute('href', 'https://acme-school.org/handbook')
    expect(a).toHaveTextContent('acme-school.org')
  })

  it('heals an auto-linker truncation — the stranded URL tail rejoins the href', () => {
    // The real iCreate case: the editor closed the anchor before ".html",
    // leaving a button that pointed at the wrong URL with ".html" dangling.
    const { container } = render(
      <AnnouncementBody
        text={'<p>More camps too. <a href="https://www.icreatecollab.com/camps--workshops">https://www.icreatecollab.com/camps--workshops</a>.html</p>'}
      />,
    )
    const a = container.querySelector('a')
    expect(a).toHaveAttribute('href', 'https://www.icreatecollab.com/camps--workshops.html')
    expect(a).toHaveTextContent('icreatecollab.com')
    expect(container).not.toHaveTextContent('.html')
  })

  it('leaves sentence punctuation after a link alone', () => {
    const { container } = render(
      <AnnouncementBody text={'<p>See <a href="https://x.com">https://x.com</a>. Thanks!</p>'} />,
    )
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://x.com')
    expect(container).toHaveTextContent('. Thanks!')
  })

  it('never linkifies a javascript: href', () => {
    const { container } = render(
      <AnnouncementBody text={'<p><a href="javascript:alert(1)">click</a></p>'} />,
    )
    // DOMPurify strips the href; whatever remains must not be executable.
    const a = container.querySelector('a')
    expect(a?.getAttribute('href') || '').not.toContain('javascript:')
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
