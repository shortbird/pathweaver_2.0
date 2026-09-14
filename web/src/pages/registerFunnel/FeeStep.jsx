// Funnel step 6: the money -- a one-time registration fee, a monthly plan, or
// both (Stripe checkout, an external payment link, or nothing owed). A fee
// covering a waitlisted child needs the holds-your-place/fully-refundable
// acknowledgement before it can be paid.
//
// Orgs with a monthly plan (Optio Academy: $50 per student each month, capped
// per family, with an Optio teacher as a per-student add-on that includes the
// program fee) get the plan picker and an itemized month; the Stripe session
// behind "Set up" is a subscription, with the one-time fee -- if the org also
// has one -- on the first invoice.
import React from 'react'
import { money, enrollmentGateFor, Section, PrimaryButton } from '../../components/registration/funnelUi'
import { MonthlyPlanPicker, MonthlySummary, planSentence } from '../../components/registration/MonthlyPlan'
import { monthlyTotalCents } from '../../components/registration/monthlyPricing'

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
  monthlyPlan = null, students = [], onToggleAddOn,
}) => {
  const anyWaitlisted = kids.some((k) => enrollmentGateFor(config, k.date_of_birth))
  // A fee that includes a waitlisted child needs explicit consent to the
  // hold-your-place / fully-refundable terms before we let them pay.
  const needsAck = !feeDeferred && feeCents > 0 && anyWaitlisted
  const ackBlocks = needsAck && !waitlistAck

  if (monthlyPlan) {
    const monthlyCents = monthlyTotalCents(monthlyPlan, students)
    const oneTime = feeDeferred ? 0 : feeCents
    const dueToday = oneTime + monthlyCents
    const stripe = !!config.stripe_enabled
    return (
      <div className="space-y-6">
        <Section title={feeCents > 0 ? 'Payment' : 'Monthly payment'}
          subtitle={planSentence(monthlyPlan) || undefined}>
          <MonthlyPlanPicker plan={monthlyPlan} students={students}
            onToggle={onToggleAddOn} disabled={submitting} />
          <div className="mt-4">
            <MonthlySummary plan={monthlyPlan} students={students} oneTimeCents={oneTime} />
          </div>
          {feeDeferred && feeCents > 0 && (
            <p className="text-sm text-neutral-500 mt-3">
              Your {money(feeCents)} registration fee is not due today. Because your
              student{kids.length === 1 ? ' is' : 's are'} joining the waitlist, it is due
              when a spot opens — we&apos;ll email you.
            </p>
          )}
          {/* Payment affordances only render when something is actually owed
              NOW. Nothing due (every price cleared) is just a finish gate. */}
          {dueToday > 0 && (stripe ? (
            <p className="text-xs text-neutral-400 mt-4 text-center">
              You&apos;ll be taken to a secure Stripe checkout to save your card. Your first
              month is charged today and then on the same day each month, for as long as your
              student is enrolled. To change or stop the payment, contact the school. Your
              registration completes automatically once the payment is verified.
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
              Your school will set up the monthly payment with you separately.
            </p>
          ))}
        </Section>
        {needsAck && (
          <WaitlistAck config={config} kids={kids} waitlistAck={waitlistAck} setWaitlistAck={setWaitlistAck} />
        )}
        {stripe && dueToday > 0 ? (
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
              : paymentUrl && dueToday > 0 ? "I've paid — finish registration"
              : 'Finish registration'}
          </PrimaryButton>
        )}
      </div>
    )
  }

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
      <WaitlistAck config={config} kids={kids} waitlistAck={waitlistAck} setWaitlistAck={setWaitlistAck} />
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
