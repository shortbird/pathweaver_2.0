/**
 * Funnel preview steps 5 and 6: paperwork, and the registration fee.
 *
 * One file because they share `FeeEditor`. When no fee is configured the fee
 * step does not exist, so the paperwork step carries an "Add a fee" affordance
 * that opens the same editor -- otherwise there would be no way back to it.
 * Both are finance-gated: a campus coordinator sees the steps and not the money
 * (sisRole.canSeeFinance), which is why `seesFinance` reaches this far down.
 */
import React from 'react'
import { Section, PrimaryButton, field, absUrl, money } from '../../registration/funnelUi'
import { Editable, mockInput, STRIPE_KEY_RE } from './setupChrome'

const FeeEditor = ({
  fee, setFee, feeMode, setFeeMode, paymentUrl, setPaymentUrl,
  perStudentFee, setPerStudentFee, stripeClear, setStripeClear,
  stripeEnabled, stripeKey, setStripeKey,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">Fee structure</label>
      <select className={field} value={feeMode} onChange={(e) => setFeeMode(e.target.value)}>
        <option value="flat">Flat per family</option>
        <option value="per_student">Per student</option>
        <option value="lesser">Per student, capped per family</option>
      </select>
    </div>
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">Per-family fee ($)</label>
      <input className={field} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
    </div>
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">Per-student fee ($)</label>
      <input className={field} inputMode="decimal" value={perStudentFee} onChange={(e) => setPerStudentFee(e.target.value)} />
    </div>
    <div className="sm:col-span-3">
      <label className="block text-xs font-medium text-neutral-500 mb-1">Stripe secret key (school's own Stripe account)</label>
      {stripeEnabled && !stripeClear && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
          Card payment is on — a Stripe key is configured. Enter a new key to replace it, or clear it below.
        </p>
      )}
      <input type="password" className={field} value={stripeKey} onChange={(e) => { setStripeKey(e.target.value); if (e.target.value) setStripeClear(false) }}
        placeholder={stripeEnabled ? 'Enter a new key to replace the current one' : 'rk_live_… (restricted key recommended)'} autoComplete="off" />
      {stripeKey.trim() && !STRIPE_KEY_RE.test(stripeKey.trim()) && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          This doesn't look like a Stripe secret key — it should start with sk_ or rk_ (e.g. sk_live_…)
          and be much longer. Copy the full key from Stripe Dashboard → Developers → API keys.
        </p>
      )}
      {stripeEnabled && (
        <label className="flex items-center gap-2 text-xs text-neutral-500 mt-2 select-none">
          <input type="checkbox" checked={stripeClear}
            onChange={(e) => { setStripeClear(e.target.checked); if (e.target.checked) setStripeKey('') }}
            className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
          Remove the stored key on save (turns card payment off)
        </label>
      )}
      <p className="text-xs text-neutral-400 mt-1">
        With a key set, parents pay by card at checkout and the platform verifies the payment
        with Stripe automatically. Without one, the funnel falls back to the external payment
        link below (or records the fee for you to collect separately).
      </p>
    </div>
    <div className="sm:col-span-3">
      <label className="block text-xs font-medium text-neutral-500 mb-1">Payment link (external, fallback)</label>
      <input className={field} value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} placeholder="https://…" />
    </div>
  </div>
)

export const PaperworkStepPreview = ({
  draftFeeCents, linkedKeys, setItem, setPaperwork, uploadDoc, uploadingDoc,
  paperwork, openZones, toggleZone, feeStepVisible, seesFinance, feeEditorProps,
}) => {
const paperworkEditor = (it, i) => {
  const linked = it.key && linkedKeys.has(it.key)
  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input className={`${field} sm:flex-1`} placeholder="Label (e.g. Enrollment Agreement)"
          value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
        {!linked && (
          <label className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium whitespace-nowrap cursor-pointer transition-colors ${
            uploadingDoc === i
              ? 'border-gray-200 text-neutral-400'
              : 'border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple'
          }`}>
            {uploadingDoc === i ? 'Uploading…' : it.doc_url ? 'Replace document' : 'Upload document'}
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
              disabled={uploadingDoc != null}
              onChange={(e) => { uploadDoc(i, e.target.files?.[0]); e.target.value = '' }} />
          </label>
        )}
        <button onClick={() => setPaperwork((p) => p.filter((_, j) => j !== i))}
          className="text-red-500 text-sm px-2 hover:underline">Remove</button>
      </div>
      <textarea rows={3} className={field}
        placeholder="Text families read and agree to (optional if a document is attached)"
        value={it.body || ''} onChange={(e) => setItem(i, { body: e.target.value })} />
      {linked ? (
        <p className="text-xs text-neutral-500">
          {it.doc_url && (
            <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">View document</a>
          )}
          <span className={it.doc_url ? 'ml-3 text-neutral-400' : 'text-neutral-400'}>
            In your Resources library — replace or remove this document in the Resources tab, and the form updates too.
          </span>
        </p>
      ) : it.doc_url ? (
        <p className="text-xs text-neutral-500">
          <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">View document</a>
          <button onClick={() => setItem(i, { doc_url: '' })} className="ml-3 text-red-500 hover:underline">Remove document</button>
          <span className="ml-2 text-neutral-400">Saving adds this to your Resources library as the source of truth.</span>
        </p>
      ) : (
        <p className="text-xs text-neutral-400">No document yet — upload the waiver/agreement PDF, paste a link, or rely on the text above.</p>
      )}
      <input className={field} placeholder="Or paste a link to the document (https://…)"
        value={it.doc_url || ''} onChange={(e) => setItem(i, { doc_url: e.target.value })} />
    </div>
  )
}


const paperworkStep = (
  <div className="space-y-6">
    <Section title="Paperwork" subtitle="Review each item, confirm you agree, and type your full name to sign.">
      <div className="space-y-5">
        {paperwork.length === 0 && (
          <p className="text-sm text-neutral-400">
            No paperwork yet — add the agreements families read and e-sign during registration.
          </p>
        )}
        {paperwork.map((it, i) => (
          <Editable key={it.key || `p-${i}`} open={openZones.has(`p-${i}`)} onToggle={() => toggleZone(`p-${i}`)}
            editor={paperworkEditor(it, i)}>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-semibold text-neutral-900">{it.label || 'Untitled item'}</span>
                {it.doc_url && <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-sm text-optio-purple hover:underline whitespace-nowrap">Open in new tab</a>}
              </div>
              {it.doc_url && /\.pdf($|\?)/i.test(it.doc_url) && (
                <iframe src={absUrl(it.doc_url)} title={it.label}
                  className="w-full h-80 rounded-lg border border-gray-200 mb-3 bg-white" />
              )}
              {it.body && (
                <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3 mb-3 max-h-56 overflow-y-auto">
                  {it.body}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2 pointer-events-none">
                <input type="checkbox" readOnly checked={false}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                I confirm I have read and agree to the above terms
              </label>
              <input className={mockInput} readOnly placeholder="Type your full name to sign" value="" />
              <p className="text-xs text-neutral-400 mt-1.5">
                By typing your name above, you agree this electronic signature has the same legal force and effect as a manual written signature.
              </p>
            </div>
          </Editable>
        ))}
        <button
          onClick={() => {
            setPaperwork((p) => [...p, { key: '', label: '', doc_url: '', body: '' }])
            toggleZone(`p-${paperwork.length}`)
          }}
          className="text-sm font-medium text-optio-purple hover:underline">
          + Add paperwork item
        </button>
      </div>
    </Section>
    {!feeStepVisible && seesFinance && (
      <Editable label="Add a fee" open={openZones.has('fee')} onToggle={() => toggleZone('fee')} editor={<FeeEditor {...feeEditorProps} />}>
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-sm text-neutral-400">
          No registration fee — after signing, families go straight to the finish step.
          Setting a fee, payment link, or Stripe key adds the fee step back.
        </div>
      </Editable>
    )}
    <div className="pointer-events-none"><PrimaryButton>Continue</PrimaryButton></div>
  </div>
)

  return paperworkStep
}

export const FeeStepPreview = ({
  feeMode, paymentUrl, sampleFee, seesFinance, stripeClear, stripeEnabled,
  waitlistGates, openZones, toggleZone, feeEditorProps,
}) => (
  <div className="space-y-6">
    <Editable label="Edit fees & payment" open={openZones.has('fee')} onToggle={() => toggleZone('fee')}
      editor={seesFinance ? <FeeEditor {...feeEditorProps} /> : null}>
      {!seesFinance ? (
        <Section title="Registration fee">
          <p className="text-sm text-neutral-500 my-3 text-center">
            Whatever families are charged here is set by an organization admin.
          </p>
        </Section>
      ) : (
      <Section title={sampleFee > 0 ? 'Registration fee' : 'Finish your registration'}>
        <div className="text-center">
          {sampleFee > 0
            ? <p className="text-3xl font-bold text-optio-purple my-3">{money(sampleFee)}</p>
            : <p className="text-sm text-neutral-500 my-3">No payment is due — complete your registration below.</p>}
          {feeMode !== 'flat' && (
            <p className="text-[11px] text-neutral-400 -mt-1 mb-2">
              ↑ Shown for one student — {feeMode === 'per_student' ? 'multiplied by the number of children registered' : 'per student, capped at the per-family amount'}.
            </p>
          )}
          {sampleFee > 0 && (stripeEnabled && !stripeClear ? (
            <p className="text-xs text-neutral-400">
              You'll be taken to a secure Stripe checkout. Your registration completes automatically once the payment is verified.
            </p>
          ) : absUrl(paymentUrl) ? (
            <>
              <span className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold">
                Pay {money(sampleFee)}
              </span>
              <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you've paid.</p>
            </>
          ) : (
            <p className="text-sm text-neutral-400">Your school will collect the fee separately.</p>
          ))}
        </div>
      </Section>
      )}
    </Editable>
    {waitlistGates.length > 0 && sampleFee > 0 && (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">One of your children is in a waitlisted age group.</p>
        <p className="mb-3">
          Paying now <strong>holds their place in line</strong> — it does not
          guarantee a spot. If they aren't accepted, that portion of your
          registration fee is <strong>fully refunded</strong> to your card. Your
          other children are enrolled as usual.
        </p>
        <label className="flex items-start gap-2 pointer-events-none">
          <input type="checkbox" readOnly checked={false}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-optio-purple" />
          <span>I understand this fee holds my child's place and is fully
            refunded if they aren't accepted.</span>
        </label>
        <p className="text-[11px] text-amber-700/70 mt-2">
          ↑ Only shown when a registering child falls in a waitlisted age group.
        </p>
      </div>
    )}
    <div className="pointer-events-none">
      <PrimaryButton>
        {sampleFee > 0 && stripeEnabled && !stripeClear ? `Pay ${money(sampleFee)} securely`
          : sampleFee > 0 && absUrl(paymentUrl) ? "I've paid — finish registration"
            : 'Finish registration'}
      </PrimaryButton>
    </div>
  </div>
)
