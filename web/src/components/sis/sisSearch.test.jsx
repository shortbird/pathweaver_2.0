import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

import SisSearch from './SisSearch'
import { navContextFor } from '../../pages/sis/sisNavVisibility'

const orgAdmin = { id: 'u1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] }
const teacher = { id: 'u3', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] }
const org = { id: 'org-1', feature_flags: { sis_enabled: true, sis_settings: { community_enabled: true } } }

// Where the search sent us: pathname plus query plus hash, as the page reads it.
const Where = () => {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.search}{loc.hash}</div>
}

const renderSearch = (user = orgAdmin) => render(
  <MemoryRouter initialEntries={['/']}>
    <SisSearch ctx={navContextFor(user, org)} />
    <Routes><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>,
)

const input = () => screen.getByRole('combobox', { name: 'Search the console' })

describe('SisSearch', () => {
  it('shows nothing until something is typed', () => {
    renderSearch()
    fireEvent.focus(input())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('lists matching pages and tabs with where each one lives', () => {
    renderSearch()
    fireEvent.change(input(), { target: { value: 'announce' } })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Announcements')
    expect(options[0]).toHaveTextContent('Community')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the first match on Enter and clears itself', () => {
    renderSearch()
    fireEvent.change(input(), { target: { value: 'announcements' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(screen.getByTestId('where')).toHaveTextContent('/community?tab=announcements')
    expect(input()).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('moves the highlight with the arrow keys', () => {
    renderSearch()
    fireEvent.change(input(), { target: { value: 'class' } })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(input()).toHaveAttribute('aria-activedescendant', options[1].id)
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(screen.getByTestId('where')).toHaveTextContent('/classes?tab=all')
  })

  it('opens a result on click', () => {
    renderSearch()
    fireEvent.change(input(), { target: { value: 'rooms' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /Classrooms and rooms/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings#settings-rooms')
  })

  it('says so when nothing matches, and Enter does nothing', () => {
    renderSearch()
    fireEvent.change(input(), { target: { value: 'zzzz' } })
    expect(screen.getByText('No pages match')).toBeInTheDocument()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(screen.getByTestId('where')).toHaveTextContent('/')
    expect(screen.getByTestId('where')).not.toHaveTextContent('?')
  })

  it('Escape clears the query first, then closes', () => {
    renderSearch()
    fireEvent.change(input(), { target: { value: 'bill' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(input()).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('offers a teacher only what a teacher can open', () => {
    renderSearch(teacher)
    fireEvent.change(input(), { target: { value: 'bill' } })
    expect(screen.getByText('No pages match')).toBeInTheDocument()
    fireEvent.change(input(), { target: { value: 'my classes' } })
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('My classes')
  })

  it('focuses on Ctrl+K from anywhere on the page', () => {
    vi.useFakeTimers()
    try {
      renderSearch()
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
      vi.runAllTimers()
      expect(document.activeElement).toBe(input())
    } finally {
      vi.useRealTimers()
    }
  })
})
