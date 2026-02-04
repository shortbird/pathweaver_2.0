import React, { createContext } from 'react'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Router future flags to suppress React Router v7 warnings
const routerFutureFlags = { v7_startTransition: true, v7_relativeSplatPath: true }

// Create mock contexts for testing
// These are used by tests instead of the real contexts
const MockAuthContext = createContext()
const MockOrganizationContext = createContext()
const MockAIAccessContext = createContext()

// Mock AuthProvider that accepts a value prop for testing
function MockAuthProvider({ children, value }) {
  return <MockAuthContext.Provider value={value}>{children}</MockAuthContext.Provider>
}

// Mock OrganizationProvider that accepts a value prop for testing
function MockOrganizationProvider({ children, value }) {
  return <MockOrganizationContext.Provider value={value}>{children}</MockOrganizationContext.Provider>
}

// Mock AIAccessProvider that accepts a value prop for testing
function MockAIAccessProvider({ children, value }) {
  return <MockAIAccessContext.Provider value={value}>{children}</MockAIAccessContext.Provider>
}

/**
 * Custom render function that wraps components with common providers
 * Use this instead of @testing-library/react's render for most tests
 *
 * @example
 * renderWithProviders(<MyComponent />)
 *
 * @example
 * renderWithProviders(<MyComponent />, {
 *   authValue: { user: mockUser, isAuthenticated: true }
 * })
 */
export function renderWithProviders(
  ui,
  {
    // Router options
    route = '/',

    // Auth context options
    authValue = {
      user: null,
      isAuthenticated: false,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    },

    // Organization context options
    organizationValue = {
      organization: null,
      loading: false,
    },

    // AI Access context options
    aiAccessValue = {
      hasAccess: true,
      loading: false,
      reason: null,
      code: null,
      features: {
        chatbot: true,
        lesson_helper: true,
        task_generation: true,
      },
      orgLimits: {
        chatbot: true,
        lesson_helper: true,
        task_generation: true,
      },
      canUseChatbot: true,
      canUseLessonHelper: true,
      canUseTaskGeneration: true,
      refreshAIAccess: vi.fn(),
    },

    // Other render options
    ...renderOptions
  } = {}
) {
  // Set initial route
  window.history.pushState({}, 'Test page', route)

  // Create a new QueryClient for each test to prevent cross-test pollution
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry failed queries in tests
        cacheTime: 0, // Disable cache in tests
      },
    },
  })

  // Wrapper component with all providers
  function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={routerFutureFlags}>
          <MockAuthProvider value={authValue}>
            <MockAIAccessProvider value={aiAccessValue}>
              <MockOrganizationProvider value={organizationValue}>
                {children}
              </MockOrganizationProvider>
            </MockAIAccessProvider>
          </MockAuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Creates a mock user object for testing
 *
 * @example
 * const student = createMockUser({ role: 'student' })
 * const admin = createMockUser({ role: 'admin', display_name: 'Admin User' })
 */
export function createMockUser(overrides = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    display_name: 'Test User',
    role: 'student',
    total_xp: 0,
    organization_id: null,
    avatar_url: null,
    bio: null,
    created_at: new Date().toISOString(),
    ...overrides
  }
}

/**
 * Creates a mock quest object for testing
 *
 * @example
 * const quest = createMockQuest({ title: 'Learn React' })
 */
export function createMockQuest(overrides = {}) {
  return {
    id: 'test-quest-id',
    title: 'Test Quest',
    description: 'A test quest for unit testing',
    quest_type: 'optio',
    pillar_primary: 'stem',
    xp_value: 100,
    is_active: true,
    created_at: new Date().toISOString(),
    task_count: 5,
    completion_count: 0,
    ...overrides
  }
}

/**
 * Creates a mock task object for testing
 *
 * @example
 * const task = createMockTask({ title: 'Complete assignment' })
 */
export function createMockTask(overrides = {}) {
  return {
    id: 'test-task-id',
    quest_id: 'test-quest-id',
    title: 'Test Task',
    description: 'A test task',
    pillar: 'stem',
    xp_value: 20,
    approval_status: 'approved',
    completed_at: null,
    ...overrides
  }
}

// createMockBadge removed (Feb 2026 - badge system removal)

/**
 * Waits for async operations to complete
 * Useful for testing components with useEffect, API calls, etc.
 *
 * @example
 * render(<MyComponent />)
 * await waitForAsyncUpdates()
 * expect(screen.getByText('Loaded')).toBeInTheDocument()
 */
export async function waitForAsyncUpdates() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react'
