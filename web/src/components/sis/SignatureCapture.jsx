import React, { useState } from 'react'
import useSignatureStatement from '../../hooks/api/useSignatureStatement'
import { field } from '../registration/funnelUi'

/**
 * Typing your name as a signature -- the one capture box (M9).
 *
 * A typed name counts as an electronic signature when the record shows who
 * typed it, that they meant it as a signature, and when. The server keeps the
 * affirmation sentence and records it verbatim against every signature
 * (sis_onboarding_service.SIGNATURE_STATEMENT), so the box a person ticks
 * must show that sentence and no other. Until M9 the registration funnel,
 * the staff checklist and the family portal each drew their own box, two of
 * them with their own wording (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
 * F4).
 *
 * Two ways to drive it:
 *   onSign        the box owns its state and shows a Sign button; the
 *                 checklist item signs one thing at a time
 *   value/onChange  {name, agreed} owned by the caller; the funnel keeps one
 *                 per paperwork item and submits them together
 *
 * `statement` is the sentence from the payload that carried the signable
 * thing; leave it out and the box fetches it once. `preview` draws the box
 * inert for an admin looking at what families will see.
 */

export const NAME_PLACEHOLDER = 'Type your full name to sign'

export default function SignatureCapture({
  statement, value, onChange, onSign, busy = false, preview = false,
  docs, onOpenDoc, className = '',
}) {
  const affirmation = useSignatureStatement(statement)
  const [own, setOwn] = useState({ name: '', agreed: false })
  const state = value || own
  const update = (patch) => {
    const next = { ...state, ...patch }
    if (onChange) onChange(next)
    else setOwn(next)
  }
  const ready = state.name.trim().length > 0 && state.agreed

  return (
    <div className={`space-y-2 ${preview ? 'pointer-events-none' : ''} ${className}`}>
      {Array.isArray(docs) && docs.length > 0 && (
        <div>
          <span className="block text-xs font-medium text-neutral-500 mb-1">Review before signing</span>
          {docs.map((d) => (
            <button key={d.id} type="button" onClick={() => onOpenDoc?.(d)}
              className="block text-sm text-optio-purple hover:underline">
              {d.title}
            </button>
          ))}
        </div>
      )}
      <label className="block">
        <span className="block text-xs font-medium text-neutral-500 mb-1">Type your full name</span>
        <input
          value={state.name}
          readOnly={preview}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={NAME_PLACEHOLDER}
          maxLength={120}
          className={field}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
        <input
          type="checkbox"
          checked={state.agreed}
          readOnly={preview}
          onChange={(e) => update({ agreed: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700"
        />
        <span>{affirmation}</span>
      </label>
      {onSign && (
        <button
          type="button"
          disabled={!ready || busy || preview}
          onClick={() => onSign({ signature_name: state.name.trim(), signature_agreed: true })}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Signing…' : 'Sign'}
        </button>
      )}
    </div>
  )
}
