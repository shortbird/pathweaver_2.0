import React from 'react'
import SignatureCapture from './SignatureCapture'

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
 * This file knows the checklist item's states -- already signed, waiting on
 * the office's document, previewed by an admin. The box itself is
 * SignatureCapture, shared with the registration funnel (M9), because a
 * signature should not be two implementations with two sets of bugs.
 *
 * Items that sign a document from the office (item.sign_docs present) show that
 * document to read and withhold the sign box until it exists — you cannot sign
 * a contract you were never given. The backend refuses such a signature too;
 * this is the courteous version of the same rule.
 */

const fmtSigned = (iso) => {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

export default function ChecklistSignature({ item, statement, disabled = false, busy = false, onSign, onOpenDoc }) {
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

  // sign_docs (an array) marks an item that signs a document the office uploads
  // to the person's portal. Empty means the office hasn't provided it yet, so
  // there is nothing to sign — no sign box (iCreate: teachers signed "Review &
  // Sign Your Contract" before any contract existed). Checked before `disabled`
  // so an admin previewing sees why nothing has been signed.
  const docs = item.sign_docs
  if (Array.isArray(docs) && docs.length === 0) {
    return (
      <p className="mt-1.5 text-sm text-neutral-400">
        {disabled
          ? 'Waiting for the office to upload their document — they sign it here once it arrives.'
          : 'Your document is not here yet. The office will upload it to your portal, and you will review and sign it here.'}
      </p>
    )
  }

  if (disabled) {
    return <p className="mt-1.5 text-sm text-neutral-400">Waiting for their signature.</p>
  }

  return (
    <SignatureCapture
      statement={statement}
      docs={docs}
      onOpenDoc={onOpenDoc}
      busy={busy}
      onSign={onSign}
      className="mt-2 rounded-lg border border-gray-200 bg-neutral-50 p-3"
    />
  )
}
