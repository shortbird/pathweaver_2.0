/**
 * A family-written task tells the reviewer who wrote it and how its claimed XP
 * compares with the AI's size for it, so XP inflation is visible at review.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GraderTaskCard from './GraderTaskCard'
import { XpInflationBadge, isXpInflated } from '../taskOrigin'

const renderCard = (task) =>
  render(
    <GraderTaskCard
      task={{ title: 'Play chess', description: 'Games', success_criteria: [], ...task }}
      quest={{ title: 'Chess' }}
      student={{ first_name: 'Ava', last_name: 'Lee' }}
      completion={{ diploma_status: 'pending_review' }}
      isOrgStudent={false}
      aiReview={null}
    />
  )

describe('GraderTaskCard origin line', () => {
  it('names the writer, the claimed XP and the AI size', () => {
    renderCard({ xp_value: 200, ai_suggested_xp: 75, written_by: 'parent', is_manual: true })
    expect(screen.getByTestId('task-origin')).toHaveTextContent(
      'Written by parent · 200 XP claimed · AI sized it at 75 when created'
    )
  })

  it('leaves the AI part out when the task was never sized', () => {
    renderCard({ xp_value: 100, ai_suggested_xp: null, written_by: 'student', is_manual: true })
    expect(screen.getByTestId('task-origin')).toHaveTextContent('Written by student · 100 XP claimed')
    expect(screen.getByTestId('task-origin')).not.toHaveTextContent(/AI sized/)
  })

  it('says nothing for a task no family member wrote', () => {
    renderCard({ xp_value: 100, ai_suggested_xp: null, written_by: null })
    expect(screen.queryByTestId('task-origin')).not.toBeInTheDocument()
  })
})

describe('XP inflation badge', () => {
  it('shows when the claim is at least 50 over the AI size', () => {
    render(<XpInflationBadge xpValue={200} aiSuggestedXp={75} />)
    expect(screen.getByTestId('xp-inflation-badge')).toHaveTextContent('XP 200 vs 75')
  })

  it('stays out of the way for a close claim or a missing size', () => {
    expect(isXpInflated(100, 75)).toBe(false)
    expect(isXpInflated(125, 75)).toBe(true)
    expect(isXpInflated(200, null)).toBe(false)
    expect(isXpInflated(200, undefined)).toBe(false)
  })
})
