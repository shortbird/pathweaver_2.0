import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OEACreditsPage from './OEACreditsPage'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ studentId: 'stu-1' }),
  useLocation: () => ({ state: { studentName: 'Sam' } })
}))
vi.mock('./OEACreditsView', () => ({
  default: ({ studentId, readOnly }) => <div data-testid="credits-view">{studentId}:{String(!!readOnly)}</div>
}))

describe('OEACreditsPage', () => {
  it('titles the page with the student name and renders the editable credits view', () => {
    render(<OEACreditsPage />)
    expect(screen.getByText("Sam's credits")).toBeInTheDocument()
    expect(screen.getByTestId('credits-view')).toHaveTextContent('stu-1:false')
  })
})
