/**
 * holdStore - "a hold just lifted, refetch everything that starved".
 *
 * The phone-verification and paperwork holds 403 every API call except
 * /api/auth/* (backend/middleware/phone_verification_gate.py and
 * signature_gate.py). This app discovers a hold REACTIVELY: screens mount,
 * fire their requests, fail, and the interceptor raises the host overlay on
 * top of them. So by the time the adult sees the hold screen, the screens
 * underneath have already resolved to their empty state and will not fetch
 * again on their own -- the mount effect has run.
 *
 * Dismissing the overlay is therefore NOT enough. PhoneVerificationHost used
 * to do exactly that ("the middleware never caches a held answer, so the very
 * next request is already free"), which is true of the backend and false of
 * this client: nothing makes the next request.
 *
 * What that shipped (Jeni Stinson, iCreate, 2026-09-10): a parent verified her
 * phone, the overlay went away, and the Family tab underneath still held the
 * empty list from the 403. It told her "No students linked" and offered one
 * button, Add a Child. Her son already had an account, so the duplicate guard
 * (routes/dependents.py::_existing_child_match) refused with "Trevor already
 * has an account here" -- and that full-screen empty state has no other exit.
 * She could not reach her child's dashboard or leave the screen asking her to
 * add him.
 *
 * So a lifted hold bumps `epoch`, and any hook whose data the hold could have
 * starved keys its fetch effect on it. Bump, do not flag: an incrementing
 * number re-runs the effect every time without an invalidation to clear.
 */

import { create } from 'zustand';

interface HoldState {
  /** Incremented whenever a hold on this account lifts. Read it with
   *  useHoldEpoch() and put it in a fetch effect's dependency array. */
  epoch: number;
  /** Call after the hold is provably gone (a verified code, a status recheck
   *  that comes back clear) -- never merely on dismissing a screen. */
  lifted: () => void;
}

export const useHoldStore = create<HoldState>((set) => ({
  epoch: 0,
  lifted: () => set((s) => ({ epoch: s.epoch + 1 })),
}));

/** Subscribe a fetch effect to hold-lifted events. */
export const useHoldEpoch = () => useHoldStore((s) => s.epoch);

/** Callable from outside React (event handlers, listeners). */
export const holdLifted = () => useHoldStore.getState().lifted();
