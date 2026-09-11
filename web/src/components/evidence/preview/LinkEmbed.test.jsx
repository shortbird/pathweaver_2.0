import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LinkEmbed from './LinkEmbed'

describe('LinkEmbed', () => {
  it('frames the page and keeps the original link one click away', () => {
    const { container } = render(
      <LinkEmbed url="https://www.canva.com/design/D1/tok/view?utm=x" title="My poster" />)
    expect(screen.getByText('My poster')).toBeInTheDocument()
    expect(screen.getByText('canva.com')).toBeInTheDocument()
    expect(container.querySelector('iframe').getAttribute('src'))
      .toBe('https://www.canva.com/design/D1/tok/view?embed')
    expect(screen.getByLabelText('Open in new tab').getAttribute('href'))
      .toBe('https://www.canva.com/design/D1/tok/view?utm=x')
  })

  it('sends no referrer and sandboxes the frame', () => {
    const { container } = render(<LinkEmbed url="https://example.com/page" />)
    const iframe = container.querySelector('iframe')
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
  })

  it('can be hidden and shown again', () => {
    const { container } = render(<LinkEmbed url="https://example.com/page" />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(container.querySelector('iframe')).toBeTruthy()
  })

  it('never frames a javascript: URL, and defuses the link', () => {
    const { container } = render(<LinkEmbed url="javascript:alert(1)" title="Trap" />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByLabelText('Open in new tab').getAttribute('href')).toBe('#')
  })
})
