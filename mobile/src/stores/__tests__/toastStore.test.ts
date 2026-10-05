/**
 * Toast store safety net — Sentry 6cbb6c10 (Android prod, route-error-boundary):
 * "Objects are not valid as a React child (found: object with keys {code,
 * message, request_id, timestamp})".
 *
 * Prod wraps errors as { error: { message, code, timestamp, request_id } }, so
 * `toast.error(err.response?.data?.error || '...')` handed <ToastHost /> an
 * object, which it rendered as `{item.message}` and crashed. The store now
 * turns any non-string message into a string before it is queued.
 */

import { toast, useToastStore } from '../toastStore';

afterEach(() => {
  useToastStore.getState().clear();
});

const last = () => {
  const { toasts } = useToastStore.getState();
  return toasts[toasts.length - 1];
};

describe('toast store message coercion (Sentry 6cbb6c10)', () => {
  it('turns the prod error envelope object into its message string', () => {
    const envelope = {
      code: 'VALIDATION_ERROR',
      message: 'Message is too long',
      request_id: 'req-123',
      timestamp: '2026-10-05T12:00:00Z',
    };
    toast.error(envelope as unknown as string);
    expect(last().message).toBe('Message is too long');
    expect(typeof last().message).toBe('string');
  });

  it('falls back to a generic sentence for an object with no message', () => {
    toast.error({ code: 'X', request_id: 'r' } as unknown as string);
    expect(last().message).toBe('Something went wrong. Please try again.');
  });

  it('leaves a plain string unchanged', () => {
    toast.error('Could not send the message');
    expect(last().message).toBe('Could not send the message');
    toast.success('Saved');
    expect(last().message).toBe('Saved');
  });

  it('coerces a non-string title too', () => {
    toast.show({ message: 'x', title: { message: 'Upload failed' } as unknown as string });
    expect(last().title).toBe('Upload failed');
  });
});
