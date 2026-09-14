/**
 * The retired parent routes still work: bookmarks and notification emails
 * point at /parent/dashboard/:studentId, /parent/quest/:studentId/:questId and
 * /parent/child/:childId/journal. Each enters family scope for that child and
 * lands on the child's own page (App.jsx ScopeRedirect).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import React from 'react'

const enterScope = vi.fn()
vi.mock('../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => ({ enterScope }) }))
import { useFamilyScope } from '../contexts/FamilyScopeContext'

// The same component App.jsx defines inline; kept identical here so the
// redirect contract is pinned without rendering the whole app.
const ScopeRedirect = ({ to }) => {
  const params = useParams()
  const { search } = useLocation()
  const { enterScope: enter } = useFamilyScope()
  const childId = params.studentId || params.childId
  React.useEffect(() => { if (childId) enter(childId) }, [childId, enter])
  const target = to.replace(':questId', params.questId || '')
  return <Navigate to={`${target}${search}`} replace />
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="parent/dashboard" element={<ScopeRedirect to="/family" />} />
        <Route path="parent/dashboard/:studentId" element={<ScopeRedirect to="/family" />} />
        <Route path="parent/quest/:studentId/:questId" element={<ScopeRedirect to="/quests/:questId" />} />
        <Route path="parent/child/:childId/journal" element={<ScopeRedirect to="/learning-journal" />} />
        <Route path="family" element={<Landed />} />
        <Route path="quests/:id" element={<Landed />} />
        <Route path="learning-journal" element={<Landed />} />
      </Routes>
    </MemoryRouter>
  )
}

function Landed() {
  const { pathname, search } = useLocation()
  return <div data-testid="landed">{pathname}{search}</div>
}

beforeEach(() => vi.clearAllMocks())

describe('legacy parent routes', () => {
  it('/parent/dashboard/:studentId enters scope and lands on /family', () => {
    renderAt('/parent/dashboard/kid-1')
    expect(screen.getByTestId('landed')).toHaveTextContent('/family')
    expect(enterScope).toHaveBeenCalledWith('kid-1')
  })

  it('/parent/dashboard keeps its query string so ?settings=you still opens the modal', () => {
    renderAt('/parent/dashboard?settings=you')
    expect(screen.getByTestId('landed')).toHaveTextContent('/family?settings=you')
    expect(enterScope).not.toHaveBeenCalled()
  })

  it('/parent/quest/:sid/:qid lands on the child\'s quest in scope', () => {
    renderAt('/parent/quest/kid-1/quest-9')
    expect(screen.getByTestId('landed')).toHaveTextContent('/quests/quest-9')
    expect(enterScope).toHaveBeenCalledWith('kid-1')
  })

  it('/parent/child/:id/journal lands on the journal in scope', () => {
    renderAt('/parent/child/kid-2/journal')
    expect(screen.getByTestId('landed')).toHaveTextContent('/learning-journal')
    expect(enterScope).toHaveBeenCalledWith('kid-2')
  })
})
