import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import QuestResourceList from './QuestResourceList'

/**
 * Files, links and videos a teacher attached to a quest or one of its tasks.
 *
 * The one that matters is the last block: an unrecognised URL must render as a
 * LINK, never as an iframe src. IframeEmbed and LessonBlockEditor both fall back
 * to `?? url` — put whatever was pasted straight into the frame — and copying
 * that here would let a school's paste frame itself inside a page a student has
 * open.
 */

const link = { id: 'r1', kind: 'link', title: 'Reading list', url: 'https://example.com/a' }
const file = { id: 'r2', kind: 'file', title: 'Worksheet.pdf', url: 'https://signed/x.pdf' }
const video = { id: 'r3', kind: 'video', title: 'Demo', url: 'https://youtube.com/watch?v=abcdefghijk' }

describe('QuestResourceList', () => {
  it('renders nothing when there is nothing attached', () => {
    const { container } = render(<QuestResourceList resources={[]} />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing when resources are absent entirely', () => {
    const { container } = render(<QuestResourceList />)
    expect(container.textContent).toBe('')
  })

  it('shows a link', () => {
    render(<QuestResourceList resources={[link]} />)
    const anchor = screen.getByText('Reading list').closest('a')
    expect(anchor).toHaveAttribute('href', 'https://example.com/a')
  })

  it('opens links in a new tab without handing over the opener', () => {
    render(<QuestResourceList resources={[link]} />)
    const anchor = screen.getByText('Reading list').closest('a')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor.getAttribute('rel')).toContain('noopener')
  })

  it('shows a file by its title', () => {
    render(<QuestResourceList resources={[file]} />)
    expect(screen.getByText('Worksheet.pdf')).toBeInTheDocument()
  })

  it('embeds a recognised video', () => {
    const { container } = render(<QuestResourceList resources={[video]} />)
    const iframe = container.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe.getAttribute('src')).toContain('youtube-nocookie.com/embed/')
  })

  it('sandboxes the embed and does not let it navigate the page away', () => {
    const { container } = render(<QuestResourceList resources={[video]} />)
    const sandbox = container.querySelector('iframe').getAttribute('sandbox')
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-top-navigation')
  })

  it('renders an unrecognised video URL as a link, not an iframe', () => {
    /* The whole point. `?? url` — what IframeEmbed does — would put a school's
       paste into the frame src on a page a student has open. */
    const odd = { id: 'r4', kind: 'video', title: 'Somewhere else',
                  url: 'https://videos.example.com/watch/1' }
    const { container } = render(<QuestResourceList resources={[odd]} />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByText('Somewhere else').closest('a'))
      .toHaveAttribute('href', 'https://videos.example.com/watch/1')
  })

  it('shows several resources in the order given', () => {
    render(<QuestResourceList resources={[link, file]} />)
    const titles = screen.getAllByRole('link').map((a) => a.textContent)
    expect(titles).toEqual(['Reading list', 'Worksheet.pdf'])
  })

  it('takes a heading, so a task list and a quest list read differently', () => {
    render(<QuestResourceList resources={[link]} title="For this task" />)
    expect(screen.getByText('For this task')).toBeInTheDocument()
  })
})
