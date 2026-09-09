// Funnel step 6: the registration fee -- Stripe checkout, an external payment
// link, or nothing owed. A fee covering a waitlisted child needs the
// holds-your-place/fully-refundable acknowledgement before it can be paid.
import React from 'react'
import { money, enrollmentGateFor, Section, PrimaryButton } from '../../components/registration/funnelUi'

const FeeStep = ({ config, confirmPayment, feeCents, feeDeferred, finishFee, kids, paymentUrl, setWaitlistAck, startCheckout, submitting, waitlistAck }) => {
  const anyWaitlisted = kids.some((k) => enrollmentGateFor(config, k.date_of_birth))
  // A fee that includes a waitlisted child needs explicit consent to the
  // hold-your-place / fully-refundable terms before we let them pay.
  const needsAck = !feeDeferred && feeCents > 0 && anyWaitlisted
  const ackBlocks = needsAck && !waitlistAck
  return (
  <div className="space-y-6">
    {/* When nothing is due (fee configured at 0, or a prepaid credit)
        this step is just a finish gate — don't headline it as a fee. */}
    <Section title={feeDeferred || feeCents > 0 ? 'Registration fee' : 'Finish your registration'}>
      <div className="text-center">
        {feeDeferred ? (
          <>
            <p className="text-3xl font-bold text-optio-purple my-3">{money(feeCents)}</p>
            <p className="text-sm text-neutral-500">
              Nothing to pay today. Because your student{kids.length === 1 ? ' is' : 's are'} joining
              the waitlist, your registration fee is due when a spot opens — we'll email you.
            </p>
          </>
        ) : feeCents > 0
          ? <p className="text-3xl font-bold text-optio-purple my-3">{money(feeCents)}</p>
          : <p className="text-sm text-neutral-500 my-3">
              No payment is due — complete your registration below.
            </p>}
        {/* Payment affordances only render when something is actually
            owed NOW: a $0 family (prepaid credit) or a fee-deferred
            waitlist family must never be handed a payment link. */}
        {!feeDeferred && feeCents > 0 && (config.stripe_enabled ? (
          <p className="text-xs text-neutral-400">
            You'll be taken to a secure Stripe checkout. Your registration completes automatically once the payment is verified.
          </p>
        ) : paymentUrl ? (
          <>
            <a href={paymentUrl} target="_blank" rel="noreferrer"
              className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
              Pay {money(feeCents)}
            </a>
            <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you've paid.</p>
          </>
        ) : (
          <p className="text-sm text-neutral-400">Your school will collect the fee separately.</p>
        ))}
      </div>
    </Section>
    {needsAck && (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">
          {kids.filter((k) => enrollmentGateFor(config, k.date_of_birth)).length === 1
            ? 'One of your children is in a waitlisted age group.'
            : 'Some of your children are in a waitlisted age group.'}
        </p>
        <p className="mb-3">
          Paying now <strong>holds their place in line</strong> — it does not
          guarantee a spot. If they aren't accepted, that portion of your
          registration fee is <strong>fully refunded</strong> to your card. Your
          other children are enrolled as usual.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={waitlistAck}
            onChange={(e) => setWaitlistAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-optio-purple focus:ring-optio-purple" />
          <span>I understand this fee holds my child's place and is fully
            refunded if they aren't accepted.</span>
        </label>
      </div>
    )}
    {!feeDeferred && config.stripe_enabled && feeCents > 0 ? (
      <>
        <PrimaryButton onClick={startCheckout} disabled={submitting || ackBlocks}>
          {submitting ? 'One moment…' : `Pay ${money(feeCents)} securely`}
        </PrimaryButton>
        <button onClick={() => confirmPayment()} disabled={submitting}
          className="w-full text-sm text-optio-purple font-medium hover:underline disabled:opacity-50">
          Already paid? Verify my payment
        </button>
      </>
    ) : (
      <PrimaryButton onClick={() => finishFee()} disabled={submitting || ackBlocks}>
        {submitting ? 'Finishing…'
          : !feeDeferred && paymentUrl && feeCents > 0 ? "I've paid — finish registration"
          : 'Finish registration'}
      </PrimaryButton>
    )}
  </div>
  )
}

export default FeeStep
