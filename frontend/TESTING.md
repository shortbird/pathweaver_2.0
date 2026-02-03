# Frontend Testing Guide

**Last Updated**: December 19, 2025
**Status**: Setup complete, 24 tests passing
**Current Coverage**: ~1% (24 tests for Alert component)
**Target**: 10% Month 1, 20% Month 2, 30% Month 3, 60% Month 6

---

## Quick Start

```bash
# Run all tests in watch mode (re-runs on file changes)
npm test

# Run all tests once
npm test:run

# Run tests with UI dashboard
npm test:ui

# Run tests with coverage report
npm test:coverage
```

---

## What We're Testing

### Unit Tests (Vitest + React Testing Library) - CURRENT FOCUS
- Individual React components in isolation
- Component logic, state, props, user interactions
- Edge cases and error handling
- Fast: 10-100ms per test
- Runs locally without backend

### E2E Tests (Playwright) - ALREADY COMPLETE
- Full user flows through entire application
- 19 tests covering auth, quest enrollment, task completion
- Slow: 10-30 seconds per test
- Runs against deployed services

---

## Testing Stack

- **Vitest** - Fast unit test runner (replacement for Jest)
- **React Testing Library** - Test React components like users interact with them
- **@testing-library/user-event** - Simulate user interactions (clicks, typing)
- **jsdom** - Browser-like environment in Node.js
- **@tanstack/react-query** - Mocked for testing context providers

---

## File Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── ui/
│   │       ├── Alert.jsx
│   │       └── Alert.test.jsx          # ✅ Co-located with component
│   └── tests/
│       ├── setup.js                     # Global test setup
│       └── test-utils.jsx               # Custom render helpers
├── vitest.config.js                     # Vitest configuration
└── TESTING.md                           # This file
```

**Convention**: Place test files next to the component they test with `.test.jsx` extension.

---

## Writing Your First Test

### Example: Testing a Simple Component

```jsx
// src/components/Button.jsx
export const Button = ({ onClick, children, disabled = false }) => (
  <button onClick={onClick} disabled={disabled} className="btn">
    {children}
  </button>
)

// src/components/Button.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders button text', () => {
    render(<Button>Click Me</Button>)
    expect(screen.getByText('Click Me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<Button onClick={handleClick}>Click Me</Button>)
    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

---

## Testing Patterns

### 1. Testing Components with Context (Auth, Organization)

Use the `renderWithProviders` helper from `test-utils.jsx`:

```jsx
import { renderWithProviders, createMockUser } from '../tests/test-utils'

it('shows user name when authenticated', () => {
  const mockUser = createMockUser({ display_name: 'John Doe' })

  renderWithProviders(<MyComponent />, {
    authValue: {
      user: mockUser,
      isAuthenticated: true
    }
  })

  expect(screen.getByText('Hello, John Doe')).toBeInTheDocument()
})
```

### 2. Testing User Interactions

```jsx
import userEvent from '@testing-library/user-event'

it('handles form submission', async () => {
  const user = userEvent.setup()
  const handleSubmit = vi.fn()

  render(<Form onSubmit={handleSubmit} />)

  // Type into input
  await user.type(screen.getByLabelText('Email'), 'test@example.com')

  // Click button
  await user.click(screen.getByRole('button', { name: /submit/i }))

  expect(handleSubmit).toHaveBeenCalled()
})
```

### 3. Testing Async Behavior

```jsx
import { waitFor } from '@testing-library/react'

it('shows error message on failure', async () => {
  const user = userEvent.setup()

  render(<LoginForm />)

  await user.type(screen.getByLabelText('Email'), 'bad@example.com')
  await user.click(screen.getByRole('button', { name: /login/i }))

  // Wait for error to appear
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
  })
})
```

### 4. Mocking API Calls

```jsx
import { vi } from 'vitest'
import api from '../services/api'

// Mock the entire module
vi.mock('../services/api')

it('fetches data from API', async () => {
  // Mock successful response
  api.get.mockResolvedValue({
    data: { quests: [{ id: 1, title: 'Test Quest' }] }
  })

  render(<QuestList />)

  await waitFor(() => {
    expect(screen.getByText('Test Quest')).toBeInTheDocument()
  })
})

it('handles API errors', async () => {
  // Mock error response
  api.get.mockRejectedValue({
    response: { status: 500, data: { error: 'Server error' } }
  })

  render(<QuestList />)

  await waitFor(() => {
    expect(screen.getByText(/error/i)).toBeInTheDocument()
  })
})
```

### 5. Testing Component Variants

```jsx
it.each([
  ['info', 'bg-blue-50'],
  ['success', 'bg-green-50'],
  ['warning', 'bg-yellow-50'],
  ['error', 'bg-red-50'],
])('renders %s variant with correct styles', (variant, expectedClass) => {
  const { container } = render(<Alert variant={variant}>Message</Alert>)
  expect(container.firstChild).toHaveClass(expectedClass)
})
```

---

## Available Test Utilities

### From `test-utils.jsx`

```jsx
// Render with all providers (Auth, Organization, Router, QueryClient)
renderWithProviders(<Component />, {
  route: '/quests',
  authValue: { user: mockUser, isAuthenticated: true },
  organizationValue: { organization: mockOrg }
})

// Create mock data
const user = createMockUser({ role: 'student', display_name: 'Test User' })
const quest = createMockQuest({ title: 'Learn React', xp_value: 100 })
const task = createMockTask({ title: 'Complete assignment' })
const badge = createMockBadge({ name: 'STEM Explorer' })
```

### Common Queries

```jsx
// Prefer accessible queries (what users see/interact with)
screen.getByRole('button', { name: /submit/i })      // ✅ Best
screen.getByLabelText('Email')                       // ✅ Good
screen.getByText('Hello World')                      // ✅ Good
screen.getByPlaceholderText('Enter email')           // ⚠️ OK
screen.getByTestId('custom-element')                 // ❌ Last resort

// Query variants
getBy...    // Throws error if not found
queryBy...  // Returns null if not found (for asserting non-existence)
findBy...   // Async, waits for element to appear
```

---

## Best Practices

### DO

- **Test user behavior, not implementation details**
  ```jsx
  // ✅ Good - tests what user sees
  expect(screen.getByText('Welcome')).toBeInTheDocument()

  // ❌ Bad - tests internal state
  expect(component.state.isWelcome).toBe(true)
  ```

- **Use accessible queries** (role, label, text)
  ```jsx
  // ✅ Good
  screen.getByRole('button', { name: /submit/i })

  // ❌ Bad
  screen.getByTestId('submit-button')
  ```

- **Test edge cases**
  - Empty states (no data, no results)
  - Error states (API failures, validation errors)
  - Loading states
  - Disabled states
  - Long content that might overflow

- **Keep tests isolated** - Each test should work independently
  ```jsx
  beforeEach(() => {
    vi.clearAllMocks()  // Clear mock history before each test
  })
  ```

### DON'T

- **Don't test third-party libraries** - Trust that React Router, Axios, etc. work
- **Don't test styles in detail** - Use visual regression tests for that
- **Don't over-mock** - Only mock external dependencies (APIs, modules)
- **Don't test implementation details** - Test behavior users see

---

## What to Test (Priority Order)

### Priority 1: Critical User Flows (Target: Month 1)
- [ ] Authentication components (LoginForm, RegisterForm)
- [ ] Quest enrollment components (QuestCard, EnrollButton)
- [ ] Task completion components (TaskCard, EvidenceUpload)
- [ ] Error boundaries and error states

### Priority 2: Shared Components (Target: Month 2)
- [x] UI components (Alert, Modal, Card, Input, Button)
- [ ] Form components (FormField, FormFooter)
- [ ] Navigation components (Navbar, Sidebar)
- [ ] Common utilities and hooks

### Priority 3: Feature Components (Target: Month 3-6)
- [ ] Admin dashboard components
- [ ] Parent dashboard components
- [ ] Quest creation and management
- [ ] Badge system (when redesigned)
- [ ] Observer/dependent features

---

## Coverage Goals

### Current Status
```
Test Files:  1 passing
Tests:       24 passing
Coverage:    ~1% (Alert component only)
```

### Roadmap
- **Month 1**: 10% coverage (auth, quest enrollment, critical paths)
- **Month 2**: 20% coverage (shared components, forms)
- **Month 3**: 30% coverage (feature components)
- **Month 4**: 40% coverage (admin features)
- **Month 5**: 50% coverage (remaining pages)
- **Month 6**: 60% coverage (edge cases, error states)

---

## Running Tests in CI/CD

Tests run automatically on every push via GitHub Actions (coming soon).

```yaml
# .github/workflows/frontend-tests.yml (to be created)
name: Frontend Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd frontend && npm install
      - run: cd frontend && npm test:run
      - run: cd frontend && npm test:coverage
```

---

## Debugging Tests

### Running Specific Tests

```bash
# Run only tests matching "Alert"
npm test -- Alert

# Run only tests in specific file
npm test -- Alert.test.jsx

# Run tests in watch mode (re-run on changes)
npm test

# Run with UI dashboard
npm test:ui
```

### Using Console Logs

```jsx
import { screen } from '@testing-library/react'

it('debugs the rendered output', () => {
  render(<MyComponent />)

  // Print entire DOM
  screen.debug()

  // Print specific element
  screen.debug(screen.getByRole('button'))
})
```

### Using Test UI Dashboard

```bash
npm test:ui
```

Opens interactive dashboard at http://localhost:51204 where you can:
- See test results in real-time
- Filter and search tests
- View coverage reports
- Debug failing tests

---

## Common Errors & Solutions

### Error: "No QueryClient set"
**Solution**: Use `renderWithProviders` instead of `render`

### Error: "Unable to find role='button'"
**Solution**: Check if element is actually rendered. Use `screen.debug()` to inspect DOM

### Error: "Test timeout"
**Solution**:
- Make sure async operations use `await`
- Use `waitFor` for elements that appear after delay
- Increase timeout: `it('test', async () => {...}, 10000)` (10 seconds)

### Warning: "not wrapped in act(...)"
**Solution**: Use `await` before user interactions and state updates
```jsx
await user.click(button)  // ✅ Good
user.click(button)        // ❌ Bad
```

---

## Examples Reference

See working examples in:
- [src/components/ui/Alert.test.jsx](src/components/ui/Alert.test.jsx) - Complete component test suite (24 tests)
- [src/tests/test-utils.jsx](src/tests/test-utils.jsx) - Reusable test helpers
- [tests/e2e/](../tests/e2e/) - E2E tests for reference (different from unit tests)

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Guiding Principles](https://testing-library.com/docs/guiding-principles)

---

## Next Steps

1. Write tests for critical auth components (LoginForm, RegisterForm)
2. Write tests for quest enrollment flow (QuestCard, EnrollButton)
3. Write tests for task completion (TaskCard, TaskSubmitButton)
4. Set up GitHub Actions workflow for CI/CD
5. Target 10% coverage by end of Month 1

---

**Remember**: Tests should make you confident that your code works, not just increase coverage numbers. Focus on testing behavior users care about, not implementation details.
