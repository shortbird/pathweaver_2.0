// Funnel step 5: read, tick and type-to-sign each configured paperwork item.
import React from 'react'
import { field, absUrl, Section, PrimaryButton } from '../../components/registration/funnelUi'

const PaperworkStep = ({ agreed, config, setAgreed, setSignatures, signatures, submitPaperwork, submitting }) => (
  <div className="space-y-6">
    <Section title="Paperwork" subtitle="Review each item, confirm you agree, and type your full name to sign.">
      <div className="space-y-5">
        {(config.paperwork || []).map((it) => (
          <div key={it.key} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="font-semibold text-neutral-900">{it.label}</span>
              {it.doc_url && <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-sm text-optio-purple hover:underline whitespace-nowrap">Open in new tab</a>}
            </div>
            {/* Uploaded PDFs render inline so parents can read before signing;
                other file types fall back to the open-in-new-tab link above. */}
            {it.doc_url && /\.pdf($|\?)/i.test(it.doc_url) && (
              <iframe src={absUrl(it.doc_url)} title={it.label}
                className="w-full h-80 rounded-lg border border-gray-200 mb-3 bg-white" />
            )}
            {it.body && (
              <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3 mb-3 max-h-56 overflow-y-auto">
                {it.body}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
              <input type="checkbox" checked={!!agreed[it.key]}
                onChange={(e) => setAgreed((a) => ({ ...a, [it.key]: e.target.checked }))}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              I confirm I have read and agree to the above terms
            </label>
            <input className={field} placeholder="Type your full name to sign"
              value={signatures[it.key] || ''} onChange={(e) => setSignatures((s) => ({ ...s, [it.key]: e.target.value }))} />
            <p className="text-xs text-neutral-400 mt-1.5">
              By typing your name above, you agree this electronic signature has the same legal force and effect as a manual written signature.
            </p>
          </div>
        ))}
      </div>
    </Section>
    <PrimaryButton onClick={submitPaperwork} disabled={submitting}>
      {submitting ? 'Saving…' : 'Continue'}
    </PrimaryButton>
  </div>
)

export default PaperworkStep
