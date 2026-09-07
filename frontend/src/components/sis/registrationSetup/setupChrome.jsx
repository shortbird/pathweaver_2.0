/**
 * Shared pieces of the Registration setup editor (QF-02).
 *
 * `Editable` is the pill-and-inline-editor wrapper every configurable region
 * of the funnel preview uses; `mockInput` is the read-only styling that makes
 * a family-facing field look real without being typeable. Both were module
 * scope inside RegistrationSetupTab.jsx before its step previews moved into
 * their own files, and all of them need these.
 */
import React from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { field } from '../../registration/funnelUi'

export const Editable = ({ label = 'Edit', open, onToggle, editor, children }) => (
  // A null editor means the region is shown but is not this user's to change —
  // the fees for a campus coordinator. No pill, no dashed drawer.
  !editor ? <div className="rounded-xl">{children}</div> : (
  <div className={`relative rounded-xl transition-shadow ${open ? 'ring-2 ring-optio-purple/50' : 'ring-1 ring-transparent hover:ring-optio-purple/30'}`}>
    <button
      type="button"
      onClick={onToggle}
      className={`absolute -top-2.5 right-3 z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-sm ${
        open ? 'bg-optio-purple text-white border-optio-purple' : 'bg-white text-optio-purple border-optio-purple/40 hover:border-optio-purple'
      }`}
    >
      <PencilSquareIcon className="w-3 h-3" />
      {open ? 'Done' : label}
    </button>
    {children}
    {open && (
      <div className="mt-1 rounded-lg border border-dashed border-optio-purple/40 bg-optio-purple/[0.04] p-4">
        {editor}
      </div>
    )}
  </div>
  )
)

// A step region families see but orgs cannot change.
export const FixedNote = ({ children }) => (
  <p className="text-xs text-neutral-400 italic mt-2">{children}</p>
)

// Mocked family inputs: rendered exactly like the funnel's, but inert.
export const mockInput = `${field} bg-neutral-50 pointer-events-none`

// Stripe restricted/secret key shape. Used by the fee editor and again by the
// tab's save path, which is why it lives here rather than in either one.
export const STRIPE_KEY_RE = /^(sk|rk)_[A-Za-z0-9_]{20,}$/
