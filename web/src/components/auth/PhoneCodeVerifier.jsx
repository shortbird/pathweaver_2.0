import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * The two-step SMS check: a phone number, then the 6-digit code the backend
 * texts to it (services/phone_verification_service.py, Twilio Verify in
 * production). A correct code stamps users.phone_verified_at and saves the
 * number on the caller's own account.
 *
 * Used by the phone-verification hold (pages/PhoneVerificationPage.jsx) and by
 * the school setup form (pages/SchoolSetupPage.jsx). No <form> element: the
 * setup form wraps it, and a form inside a form is invalid HTML, so Enter is
 * handled on the inputs instead.
 */

const RESEND_SECONDS = 60
const FIELD = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple'
const BUTTON = 'mt-4 w-full rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-2.5 disabled:opacity-50'

const DEFAULT_HINT = 'We\u2019ll text a 6-digit code to this number.'

export default function PhoneCodeVerifier({ initialPhone = '', label = 'Mobile phone number', hint = DEFAULT_HINT, onVerified }) {
  const [step, setStep] = useState('phone')   // 'phone' | 'code'
  const [phone, setPhone] = useState(initialPhone)
  const [maskedPhone, setMaskedPhone] = useState(null)
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

  useEffect(() => { if (initialPhone) setPhone(initialPhone) }, [initialPhone])

  useEffect(() => {
    if (!cooldown) return undefined
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendCode = async () => {
    if (busy || !phone.trim() || cooldown > 0) return
    setBusy(true)
    try {
      const r = await api.post('/api/phone-verification/send-code', { phone })
      setMaskedPhone(r.data?.phone || null)
      setDevCode(r.data?.dev_code || null)
      setCode('')
      setStep('code')
      setCooldown(RESEND_SECONDS)
      setTimeout(() => codeRef.current?.focus(), 50)
    } catch (err) {
      const data = err?.response?.data
      if (data?.retry_after) setCooldown(data.retry_after)
      toast.error(data?.error || 'Could not send the code')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (busy || code.length !== 6) return
    setBusy(true)
    try {
      const r = await api.post('/api/phone-verification/verify', { code })
      toast.success('Phone number verified')
      onVerified?.(r.data?.phone || maskedPhone)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not verify the code')
    } finally {
      setBusy(false)
    }
  }

  const onEnter = (action) => (e) => {
    if (e.key === 'Enter') { e.preventDefault(); action() }
  }

  if (step === 'phone') {
    return (
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-neutral-800">{label}</label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={onEnter(sendCode)}
          placeholder="801-555-0123"
          className={FIELD}
        />
        {hint && <p className="mt-2 text-sm text-neutral-500">{hint}</p>}
        <button type="button" onClick={sendCode} disabled={busy || !phone.trim() || cooldown > 0} className={BUTTON}>
          {busy ? 'Sending…' : cooldown > 0 ? `Wait ${cooldown}s` : 'Text me a code'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor="code" className="block text-sm font-medium text-neutral-800">
        Enter the code we sent{maskedPhone ? ` to ${maskedPhone}` : ''}
      </label>
      <input
        id="code"
        ref={codeRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={onEnter(verify)}
        placeholder="123456"
        className={`${FIELD} text-center text-2xl tracking-[0.5em]`}
      />
      {devCode && (
        <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Local dev: the code is {devCode}
        </p>
      )}
      <button type="button" onClick={verify} disabled={busy || code.length !== 6} className={BUTTON}>
        {busy ? 'Checking…' : 'Verify'}
      </button>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" onClick={() => setStep('phone')} className="text-neutral-500 hover:text-neutral-800 underline">
          Use a different number
        </button>
        <button
          type="button"
          onClick={sendCode}
          disabled={busy || cooldown > 0}
          className="text-optio-purple hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  )
}
