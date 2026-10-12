/**
 * The AI gate follows the child a parent is working for.
 *
 * Sentry 64448412 / e7429a56: a parent acting for a dependent child whose AI
 * is off saw "Generate tasks" and "Help me finish this", because the status
 * the buttons read was the PARENT's. The child-scoped call behind the button
 * was then refused with 403 ai_disabled. The gate now asks
 * /api/ai-access/status?student_id=<child> when a child is selected.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../services/api'
import FamilyScopeContext from '../FamilyScopeContext'
import { AIAccessProvider, useAIAccess } from '../AIAccessContext'

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: 'parent-1' }, loading: false }) }))
vi.mock('../../utils/logger', () => ({ default: { error: vi.fn() } }))

const PARENT_ON = { has_access: true, features: { chatbot: true, lesson_helper: true, task_generation: true } }
const CHILD_OFF = {
  has_access: false,
  code: 'DEPENDENT_AI_DISABLED',
  reason: 'AI features are not enabled for your account. Ask your parent to enable them in their dashboard.',
  features: { chatbot: false, lesson_helper: false, task_generation: false },
}

function Probe() {
  const { canUseTaskGeneration, loading } = useAIAccess()
  return <div data-testid="gate">{loading ? 'loading' : canUseTaskGeneration ? 'ai-on' : 'ai-off'}</div>
}

const renderWith = (selectedChildId) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AIAccessProvider>
        <FamilyScopeContext.Provider value={{ selectedChildId }}>
          <Probe />
        </FamilyScopeContext.Provider>
      </AIAccessProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(async (url, config) => ({
    data: config?.params?.student_id ? CHILD_OFF : PARENT_ON,
  }))
})

describe('useAIAccess and the family scope', () => {
  it('reads the signed-in user when no child is selected', async () => {
    renderWith(null)
    await waitFor(() => expect(screen.getByTestId('gate')).toHaveTextContent('ai-on'))
    expect(api.get).not.toHaveBeenCalledWith('/api/ai-access/status', expect.objectContaining({
      params: expect.anything(),
    }))
  })

  it("hides AI for a selected child whose AI is off, even though the parent's is on", async () => {
    renderWith('kid-1')
    await waitFor(() => expect(screen.getByTestId('gate')).toHaveTextContent('ai-off'))
    expect(api.get).toHaveBeenCalledWith('/api/ai-access/status', { params: { student_id: 'kid-1' } })
  })

  it('keeps AI hidden while the child status is still loading', () => {
    api.get.mockImplementation((url, config) => (config?.params?.student_id
      ? new Promise(() => {}) : Promise.resolve({ data: PARENT_ON })))
    renderWith('kid-1')
    expect(screen.getByTestId('gate')).not.toHaveTextContent('ai-on')
  })
})
