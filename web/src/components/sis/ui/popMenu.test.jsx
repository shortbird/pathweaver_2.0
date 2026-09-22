import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PopMenu from './PopMenu'

/**
 * PopMenu, including the floating mode the quest library's row kebab uses: a
 * menu inside a table with overflow-x-auto is clipped on the last rows unless
 * it is positioned against the viewport.
 */

const items = (spy) => [
  { label: 'Edit', onClick: spy },
  { label: 'Duplicate', onClick: vi.fn(), disabled: true },
]

describe('PopMenu', () => {
  it('runs an item and closes', () => {
    const onClose = vi.fn()
    const edit = vi.fn()
    render(<PopMenu open onClose={onClose} trigger={<button>Menu</button>} items={items(edit)} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(edit).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not run a disabled item', () => {
    render(<PopMenu open onClose={vi.fn()} trigger={<button>Menu</button>} items={items(vi.fn())} />)
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeDisabled()
  })

  it('closes on click-away', () => {
    const onClose = vi.fn()
    render(<PopMenu open onClose={onClose} trigger={<button>Menu</button>} items={items(vi.fn())} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders a floating panel outside its scrolling box, fixed to the viewport', () => {
    const { container } = render(
      <div style={{ overflow: 'auto' }}>
        <PopMenu floating open onClose={vi.fn()} trigger={<button>Menu</button>} items={items(vi.fn())} />
      </div>,
    )
    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
  })

  it('closes a floating panel when the page scrolls, instead of leaving it behind', () => {
    const onClose = vi.fn()
    render(<PopMenu floating open onClose={onClose} trigger={<button>Menu</button>} items={items(vi.fn())} />)
    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the plain panel inside its wrapper', () => {
    const { container } = render(
      <PopMenu open onClose={vi.fn()} trigger={<button>Menu</button>} items={items(vi.fn())} />)
    expect(container.contains(screen.getByRole('menu'))).toBe(true)
  })
})
