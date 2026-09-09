/**
 * Account-deletion flow shared by Settings and Profile.
 * Confirmation + request + result dialogs in one place so the two screens
 * can't drift apart (they previously carried divergent copies).
 */
import api from '../services/api';
import { showAlert, confirmAlert } from './alerts';

export async function requestAccountDeletion(opts: {
  /** Toggled true while the request is in flight. */
  onRequestingChange?: (requesting: boolean) => void;
  /** Called after the deletion is scheduled (refresh status/UI here). */
  onScheduled?: () => void;
} = {}): Promise<void> {
  const confirmed = await confirmAlert({
    title: 'Delete Account',
    message:
      'This will schedule your account for permanent deletion in 30 days. You can cancel within the grace period.\n\n' +
      'All your data will be permanently deleted after 30 days. This cannot be undone.',
    confirmText: 'Delete My Account',
    destructive: true,
  });
  if (!confirmed) return;

  opts.onRequestingChange?.(true);
  try {
    await api.post('/api/users/delete-account', { reason: 'User requested deletion' });
    showAlert('Scheduled', 'Account deletion scheduled. You have 30 days to cancel.');
    opts.onScheduled?.();
  } catch (err: any) {
    showAlert('Error', err.response?.data?.error || 'Failed to request account deletion');
  } finally {
    opts.onRequestingChange?.(false);
  }
}

export async function cancelAccountDeletion(onCancelled?: () => void): Promise<void> {
  try {
    await api.post('/api/users/cancel-deletion', {});
    showAlert('Cancelled', 'Account deletion has been cancelled.');
    onCancelled?.();
  } catch (err: any) {
    showAlert('Error', err.response?.data?.error || 'Failed to cancel deletion');
  }
}
