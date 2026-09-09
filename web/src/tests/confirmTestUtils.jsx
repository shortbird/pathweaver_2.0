import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { ConfirmProvider } from '../contexts/ConfirmContext'

/**
 * Test helpers for components that guard an action with useConfirm().
 *
 * These used to stub `window.confirm` and assert on its mock args. The app no
 * longer calls it — `window.confirm` returns false without rendering inside an
 * iOS in-app WKWebView, which silently killed every guarded action on a phone.
 * Confirmations now render a real dialog, so tests click through it, which also
 * means they exercise the markup a user actually sees.
 *
 *   render(withConfirm(<Thing />))
 *   fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
 *   expect(await confirmText()).toMatch(/cannot be undone/i)
 *   await answerConfirm()          // or answerConfirm(false) to cancel
 */

export const withConfirm = (ui) => <ConfirmProvider>{ui}</ConfirmProvider>

/** Wait for the confirmation dialog and return its full text (title + body). */
export const confirmText = async () => {
  const dialog = await screen.findByRole('dialog')
  return dialog.textContent
}

/** Answer the open confirmation dialog. Defaults to confirming. */
export const answerConfirm = async (ok = true) => {
  const button = await screen.findByRole('button', { name: ok ? 'Confirm' : 'Cancel' })
  fireEvent.click(button)
}
