import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ConfirmProvider, useConfirm, usePromptText, splitMessage } from './ConfirmContext'

// A button that runs the guarded action only if the dialog is confirmed, and
// records what the dialog resolved to.
const Harness = ({ onResult, ask = 'Delete this?' }) => {
  const confirm = useConfirm()
  return (
    <button onClick={async () => onResult(await confirm(ask))}>Delete</button>
  )
}

const PromptHarness = ({ onResult, options }) => {
  const promptText = usePromptText()
  return (
    <button onClick={async () => onResult(await promptText(options))}>Name it</button>
  )
}

describe('splitMessage', () => {
  it('keeps a short single-sentence message whole', () => {
    expect(splitMessage('Delete this?')).toEqual({ title: 'Delete this?', body: null })
  })

  it('splits on a blank line', () => {
    expect(splitMessage('Enroll them anyway?\n\nThe class is full.')).toEqual({
      title: 'Enroll them anyway?', body: 'The class is full.',
    })
  })

  it('demotes the consequence of a long message to the body', () => {
    // The shape almost every one of these messages was written in.
    expect(splitMessage(
      'Remove Ada as an observer? They will no longer be able to view your activity.',
    )).toEqual({
      title: 'Remove Ada as an observer?',
      body: 'They will no longer be able to view your activity.',
    })
  })

  it('does not split a long message that is one sentence', () => {
    const long = 'Mark every unclaimed item past its 14-day donation deadline as donated?'
    expect(splitMessage(long)).toEqual({ title: long, body: null })
  })
})

describe('useConfirm', () => {
  it('resolves true and runs the action when confirmed', async () => {
    const onResult = vi.fn()
    render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
  })

  it('resolves false when cancelled', async () => {
    const onResult = vi.fn()
    render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
  })

  it('closes the dialog once answered', async () => {
    render(<ConfirmProvider><Harness onResult={() => {}} /></ConfirmProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the message, split into a heading and body', async () => {
    render(
      <ConfirmProvider>
        <Harness onResult={() => {}} ask={'Drop Pottery?\n\nThis frees up the seat.'} />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Drop Pottery?')).toBeInTheDocument()
    expect(screen.getByText('This frees up the seat.')).toBeInTheDocument()
  })

  // Two asks in flight would otherwise strand the first promise, leaving its
  // handler suspended forever mid-action.
  it('settles a superseded ask as cancelled rather than leaving it hanging', async () => {
    const results = []
    const Double = () => {
      const confirm = useConfirm()
      return (
        <button onClick={() => {
          confirm('First?').then((r) => results.push(['first', r]))
          confirm('Second?').then((r) => results.push(['second', r]))
        }}>Go</button>
      )
    }
    render(<ConfirmProvider><Double /></ConfirmProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(results).toContainEqual(['first', false]))

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(results).toContainEqual(['second', true]))
  })

  describe('with no provider above it', () => {
    let error
    beforeEach(() => { error = vi.spyOn(console, 'error').mockImplementation(() => {}) })
    afterEach(() => error.mockRestore())

    // Auto-cancelling keeps the guarded action from running. Auto-confirming
    // would let a test pass while a delete ran unconfirmed.
    it('auto-cancels and complains loudly instead of throwing', async () => {
      const onResult = vi.fn()
      render(<Harness onResult={onResult} />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
      expect(error).toHaveBeenCalled()
    })
  })
})

describe('usePromptText', () => {
  it('resolves the typed text', async () => {
    const onResult = vi.fn()
    render(
      <ConfirmProvider>
        <PromptHarness onResult={onResult} options={{ title: 'Name this template' }} />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name it' }))
    fireEvent.change(await screen.findByLabelText('Name this template'), {
      target: { value: 'Weekly update' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('Weekly update'))
  })

  it('starts from defaultValue and resolves null when cancelled', async () => {
    const onResult = vi.fn()
    render(
      <ConfirmProvider>
        <PromptHarness onResult={onResult} options={{ title: 'Link to a URL', defaultValue: 'https://a.test' }} />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name it' }))
    expect(await screen.findByLabelText('Link to a URL')).toHaveValue('https://a.test')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // null, not '' — callers branch on null to mean "cancelled" and on '' to
    // mean "cleared", which is how the link editor removes a link.
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null))
  })
})

// The hooks fall back to auto-cancel when no provider is mounted, which is
// right for an isolated unit test and catastrophic in production: every
// guarded action would silently do nothing — the exact bug being fixed.
describe('App wiring', () => {
  const app = () =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.jsx'), 'utf8')

  it('App.jsx mounts a ConfirmProvider', () => {
    expect(app()).toMatch(/<ConfirmProvider>/)
    expect(app()).toMatch(/from '\.\/contexts\/ConfirmContext'/)
  })

  // A route mounted outside the provider gets the auto-cancel fallback, so
  // every confirm on it would be a dead button — including the LTI and embed
  // trees, which are easy to add outside the main stack.
  it('encloses every <Route> in the app', () => {
    const src = app()
    const open = src.indexOf('<ConfirmProvider>')
    const close = src.indexOf('</ConfirmProvider>')
    expect(open).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(open)

    const firstRoute = src.indexOf('<Route ')
    const lastRoute = src.lastIndexOf('<Route ')
    expect(firstRoute).toBeGreaterThan(open)
    expect(lastRoute).toBeLessThan(close)
  })
})
