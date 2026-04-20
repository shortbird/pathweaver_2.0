import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DashboardLayout from './DashboardLayout'

const list = <div data-testid="list-panel">LIST</div>
const detail = <div data-testid="detail-panel">DETAIL</div>
const context = <div data-testid="context-panel">CONTEXT</div>

describe('DashboardLayout — desktop', () => {
  it('renders all three panels side-by-side', () => {
    render(
      <DashboardLayout>
        {list}
        {detail}
        {context}
      </DashboardLayout>,
    )
    expect(screen.getByTestId('list-panel')).toBeInTheDocument()
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('context-panel')).toBeInTheDocument()
  })

  it('omits the context panel when only two children are provided', () => {
    render(
      <DashboardLayout>
        {list}
        {detail}
      </DashboardLayout>,
    )
    expect(screen.getByTestId('list-panel')).toBeInTheDocument()
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument()
  })
})

describe('DashboardLayout — mobile (single-panel)', () => {
  it('shows only the list panel when nothing is selected', () => {
    render(
      <DashboardLayout isMobile hasSelection={false} onBackToList={vi.fn()}>
        {list}
        {detail}
        {context}
      </DashboardLayout>,
    )
    expect(screen.getByTestId('list-panel')).toBeInTheDocument()
    // Detail + context are desktop-side clutter on a phone
    expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument()
  })

  it('shows only the detail panel with a back button when an item is selected', () => {
    render(
      <DashboardLayout isMobile hasSelection onBackToList={vi.fn()}>
        {list}
        {detail}
        {context}
      </DashboardLayout>,
    )
    expect(screen.queryByTestId('list-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument()
    // The back affordance must be present and touch-sized.
    const back = screen.getByRole('button', { name: /back to list/i })
    expect(back).toBeInTheDocument()
  })

  it('calls onBackToList when the back button is pressed', () => {
    const onBackToList = vi.fn()
    render(
      <DashboardLayout isMobile hasSelection onBackToList={onBackToList}>
        {list}
        {detail}
        {context}
      </DashboardLayout>,
    )
    fireEvent.click(screen.getByRole('button', { name: /back to list/i }))
    expect(onBackToList).toHaveBeenCalledTimes(1)
  })
})
