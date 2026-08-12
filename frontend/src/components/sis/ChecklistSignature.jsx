import React, { useState } from 'react'

/**
 * Signing a checklist item by typing your name.
 *
 * iCreate, 2026-08-06: teachers were downloading a document, printing it,
 * signing it, scanning it and uploading the scan. Four of those five steps need
 * a printer, and the artifact they produce — a photograph of a signature — is
 * no better evidence than a typed name captured behind a login.
 *
 * So: type your name, tick that you mean it as your signature, done. The
 * affirmation text comes from the server (assignment.signature_statement) so the
 * sentence somebody agrees to here is the same one recorded against their name,
 * not a second copy that can drift.
 *
 * Shared by the SIS staff checklist and the family portal, because a signature
 * should not be two implementations with two sets of bugs.
 */

const FALLBACK_STATEMENT = 'I am typing my own name below, and I intend it to count as my official signature.'

const fmtSigned = (iso) => {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

export default function ChecklistSignature({ item, statement, disabled = false, busy = false, onSign }) {
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)

  const signature = item.signature
  if (signature?.name) {
    const on = fmtSigned(signature.signed_at)
    return (
      <p className="mt-1.5 text-sm text-neutral-600">
        Signed by <span className="font-medium text-neutral-800">{signature.name}</span>
        {on ? ` on ${on}` : ''}
      </p>
    )
  }

  // Nothing to sign yet: the template gave no link and the school hasn't
  // attached this person's document. The backend refuses the signature in this
  // state (iCreate, 2026-08-12: a contract was "signed" before it existed), so
  // showing the form here could only ever produce an error.
  if (!item.link && !item.admin_document_url) {
    return (
      <p className="mt-1.5 text-sm text-neutral-400">
        {disabled
          ? 'Waiting for the document to be attached — they can sign once it is.'
          : "Your school hasn't added this document yet. You'll be able to sign it once it's here."}
      </p>
    )
  }

  if (disabled) {
    return <p className="mt-1.5 text-sm text-neutral-400">Waiting for their signature.</p>
  }

  const ready = name.trim().length > 0 && agreed

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-neutral-50 p-3 space-y-2">
      <label className="block">
        <span className="block text-xs font-medium text-neutral-500 mb-1">Type your full name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          maxLength={120}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-700"
        />
        <span>{statement || FALLBACK_STATEMENT}</span>
      </label>
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => onSign({ signature_name: name.trim(), signature_agreed: true })}
        className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy ? 'Signing…' : 'Sign'}
      </button>
    </div>
  )
}
