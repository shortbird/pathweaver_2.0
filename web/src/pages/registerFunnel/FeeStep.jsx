// Funnel step 6: the money -- a one-time registration fee, a monthly plan, or
// both (Stripe checkout, an external payment link, or nothing owed), drawn
// from the server's quote (hooks/api/useRegistrationQuote) as one list of
// lines under "each month" / "one time" headings. It used to be two whole
// renderings, one per cadence, that drifted (audit I2). A fee covering a
// waitlisted child needs the holds-your-place/fully-refundable
// acknowledgement before it can be paid.
//
// Orgs with a monthly plan (Optio Academy: $50 per student each month, capped
// per family, with an Optio teacher as a per-student add-on that includes the
// program fee) get the plan picker above the lines; the Stripe session behind
// "Set up" is a subscription, with the one-time fee -- if the org also has
// one -- on the first invoice.
import React from 'react'
import { money, enrollmentGateFor, Section, PrimaryButton } from '../../components/registration/funnelUi'
import { MonthlyPlanPicker, QuoteLines, planSentence } from '../../components/registration/MonthlyPlan'
import { EMPTY_QUOTE } from '../../hooks/api/useRegistrationQuote'

const WaitlistAck = ({ config, kids, waitlistAck, setWaitlistAck }) => (
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
)

const FeeStep = ({
  config, confirmPayment, feeCents, feeDeferred, finishFee, kids, paymentUrl,
  setWaitlistAck, startCheckout, submitting, waitlistAck,
  monthlyPlan = null, quote = EMPTY_QUOTE, students = [], onToggleAddOn,
}) => {
  const anyWaitlisted = kids.some((k) => enrollmentGateFor(config, k.date_of_birth))
  // A fee that includes a waitlisted child needs explicit consent to the
  // hold-your-place / fully-refundable terms before we let them pay.
  const needsAck = !feeDeferred && feeCents > 0 && anyWaitlisted
  const ackBlocks = needsAck && !waitlistAck

  // feeCents/feeDeferred are the server's authoritative gate (fee-status);
  // the quote is the same money itemized, re-quoted as add-ons are ticked.
  const monthlyCents = quote?.monthly?.total_cents || 0
  const oneTime = feeDeferred ? 0 : (quote?.fee?.amount_cents ?? feeCents)
  const dueToday = quote?.due_today_cents ?? (oneTime + monthlyCents)
  const stripe = !!config.stripe_enabled
  const owedNow = dueToday > 0
  const title = monthlyPlan
    ? (feeCents > 0 ? 'Payment' : 'Monthly payment')
    : (feeDeferred || feeCents > 0 ? 'Registration fee' : 'Finish your registration')

  return (
    <div className="space-y-6">
      {/* When nothing is due (fee configured at 0, or a prepaid credit)
          this step is just a finish gate -- don't headline it as a fee. */}
      <Section title={title} subtitle={monthlyPlan ? planSentence(monthlyPlan) || undefined : undefined}>
        {monthlyPlan && (
          <MonthlyPlanPicker plan={monthlyPlan} students={students}
            onToggle={onToggleAddOn} disabled={submitting} />
        )}
        <div className={monthlyPlan ? 'mt-4' : ''}>
          {quote?.lines?.length
            ? <QuoteLines quote={quote} feeDeferred={feeDeferred} />
            : !feeDeferred && (
              <p className="text-sm text-neutral-500 my-3 text-center">
                No payment is due — complete your registration below.
              </p>
            )}
        </div>
        {feeDeferred && feeCents > 0 && (
          <p className="text-sm text-neutral-500 mt-3">
            Nothing to pay today. Because your student{kids.length === 1 ? ' is' : 's are'} joining
            the waitlist, your {money(feeCents)} registration fee is due when a spot opens — we&apos;ll email you.
          </p>
        )}
        {/* Payment affordances only render when something is actually owed
            NOW: a $0 family (prepaid credit) or a fee-deferred waitlist
            family must never be handed a payment link. */}
        {owedNow && (stripe ? (
          <p className="text-xs text-neutral-400 mt-4 text-center">
            {monthlyCents > 0
              ? "You'll be taken to a secure Stripe checkout to save your card. Your first month is charged today and then on the same day each month, for as long as your student is enrolled. To change or stop the payment, contact the school. Your registration completes automatically once the payment is verified."
              : "You'll be taken to a secure Stripe checkout. Your registration completes automatically once the payment is verified."}
          </p>
        ) : paymentUrl ? (
          <div className="text-center mt-4">
            <a href={paymentUrl} target="_blank" rel="noreferrer"
              className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
              Pay {money(dueToday)}
            </a>
            <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you&apos;ve paid.</p>
          </div>
        ) : (
          <p className="text-sm text-neutral-400 mt-4 text-center">
            {monthlyCents > 0
              ? 'Your school will set up the monthly payment with you separately.'
              : 'Your school will collect the fee separately.'}
          </p>
        ))}
      </Section>
      {needsAck && (
        <WaitlistAck config={config} kids={kids} waitlistAck={waitlistAck} setWaitlistAck={setWaitlistAck} />
      )}
      {stripe && owedNow ? (
        <>
          <PrimaryButton onClick={startCheckout} disabled={submitting || ackBlocks}>
            {submitting ? 'One moment…'
              : oneTime > 0 ? `Pay ${money(dueToday)} securely`
              : `Set up ${money(monthlyCents)}/month`}
          </PrimaryButton>
          <button onClick={() => confirmPayment()} disabled={submitting}
            className="w-full text-sm text-optio-purple font-medium hover:underline disabled:opacity-50">
            Already paid? Verify my payment
          </button>
        </>
      ) : (
        <PrimaryButton onClick={() => finishFee()} disabled={submitting || ackBlocks}>
          {submitting ? 'Finishing…'
            : paymentUrl && owedNow ? "I've paid — finish registration"
            : 'Finish registration'}
        </PrimaryButton>
      )}
    </div>
  )
}

export default FeeStep
