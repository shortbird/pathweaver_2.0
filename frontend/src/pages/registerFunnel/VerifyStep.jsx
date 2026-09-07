// Funnel step 1b: the emailed 6-digit code. Same 'account' step as far as the
// stepper is concerned -- it replaces the form once a registration is pending.
import React from 'react'
import { field, Section, PrimaryButton } from '../../components/registration/funnelUi'

const VerifyStep = ({ otp, pendingVerify, resendCode, setOtp, setPendingVerify, submitVerify, submitting }) => (
  <div className="space-y-6">
    <Section title="Check your email"
      subtitle={`We sent a 6-digit code to ${pendingVerify.email}. Enter it below to confirm your email.`}>
      <input
        inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        className={`${field} text-center text-2xl tracking-[0.5em] font-semibold`}
        placeholder="••••••"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => e.key === 'Enter' && submitVerify()}
        autoFocus
      />
      <div className="flex items-center justify-between mt-3">
        <button onClick={resendCode} className="text-sm text-optio-purple font-medium hover:underline">Resend code</button>
        <button onClick={() => { setPendingVerify(null); setOtp('') }} className="text-sm text-neutral-500 hover:underline">Use a different email</button>
      </div>
    </Section>
    <PrimaryButton onClick={submitVerify} disabled={submitting || otp.length !== 6}>
      {submitting ? 'Verifying…' : 'Confirm email'}
    </PrimaryButton>
  </div>
)

export default VerifyStep
