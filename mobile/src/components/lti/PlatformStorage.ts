/**
 * LTI 1.3 Platform Storage helper.
 *
 * When Canvas sends `lti_storage_target` in a launch payload, the tool can
 * store small bits of state (OIDC `state`, transient launch context) inside
 * the platform's storage frame via postMessage instead of a third-party
 * cookie. The platform answers `lti.put_data` and `lti.get_data` messages
 * sent to the named target frame.
 *
 * Spec: https://www.imsglobal.org/spec/lti-pm-s/v0p1
 *
 * In v1 our backend signs `state` as a JWT in the URL, so we don't *need*
 * Platform Storage for the OIDC handshake. We expose it as a helper now so
 * Phase 6 hardening can swap implementations without touching call sites.
 */

import { Platform } from 'react-native';

type PostMessage = {
  subject: string;
  message_id: string;
  [key: string]: unknown;
};

const PENDING: Map<string, (data: unknown) => void> = new Map();
let listenerInstalled = false;

function installListener(): void {
  if (listenerInstalled || Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  window.addEventListener('message', (event) => {
    const data = event.data as PostMessage | undefined;
    if (!data || typeof data !== 'object' || !data.subject) return;
    if (!data.message_id) return;
    const pending = PENDING.get(data.message_id as string);
    if (pending) {
      PENDING.delete(data.message_id as string);
      pending(data);
    }
  });
  listenerInstalled = true;
}

function targetFrame(target: string): Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  // Per spec, lti_storage_target = "_parent" means message the direct parent
  // frame; any other value is the name of a named frame we should find via
  // `window.parent.frames[name]`.
  if (target === '_parent') return window.parent;
  try {
    return (window.parent as any).frames[target] || null;
  } catch {
    return null;
  }
}

function genId(): string {
  return 'msg-' + Math.random().toString(36).slice(2, 14);
}

export const PlatformStorage = {
  /** Whether we're in a context where Platform Storage is usable. */
  available(target: string | null | undefined): boolean {
    return Platform.OS === 'web' && Boolean(target) && targetFrame(target!) !== null;
  },

  /** Store a value via lti.put_data. Resolves once the platform acks. */
  async put(target: string, key: string, value: string): Promise<void> {
    installListener();
    const frame = targetFrame(target);
    if (!frame) throw new Error('Platform Storage target frame unavailable');

    const id = genId();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        PENDING.delete(id);
        reject(new Error('Platform Storage put timed out'));
      }, 2000);
      PENDING.set(id, (data) => {
        clearTimeout(timeout);
        const payload = data as { subject: string; error?: unknown };
        if (payload.subject === 'lti.put_data.response') {
          resolve();
        } else {
          reject(payload.error ?? new Error('Platform Storage put failed'));
        }
      });
      frame.postMessage(
        {
          subject: 'lti.put_data',
          message_id: id,
          key,
          value,
        },
        '*',
      );
    });
  },

  /** Read a value via lti.get_data. Resolves with the stored string or null. */
  async get(target: string, key: string): Promise<string | null> {
    installListener();
    const frame = targetFrame(target);
    if (!frame) throw new Error('Platform Storage target frame unavailable');

    const id = genId();
    return new Promise<string | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        PENDING.delete(id);
        reject(new Error('Platform Storage get timed out'));
      }, 2000);
      PENDING.set(id, (data) => {
        clearTimeout(timeout);
        const payload = data as {
          subject: string;
          value?: string;
          error?: unknown;
        };
        if (payload.subject === 'lti.get_data.response') {
          resolve(payload.value ?? null);
        } else {
          reject(payload.error ?? new Error('Platform Storage get failed'));
        }
      });
      frame.postMessage(
        {
          subject: 'lti.get_data',
          message_id: id,
          key,
        },
        '*',
      );
    });
  },
};
