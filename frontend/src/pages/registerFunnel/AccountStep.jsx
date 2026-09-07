// Funnel step 1: create an Optio account, or sign into an existing one.
// Google/Apple come first -- an account made with either has no password, so a
// parent who starts by typing one hits a dead end in both modes.
import React from 'react'
import { field, Section, PasswordInput, PrimaryButton } from '../../components/registration/funnelUi'
import GoogleButton from '../../components/auth/GoogleButton'
import AppleButton from '../../components/auth/AppleButton'

const AccountStep = ({ account, accountNotice, code, mode, org, previewMode, setAccount, setAccountNotice, setMode, submitCreate, submitSignin, submitting }) => (
  <div className="space-y-6">
    <Section title="Your account" subtitle="Registration starts with your parent account.">
      {accountNotice && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {accountNotice}
        </div>
      )}

      {/* Google/Apple come FIRST, and serve both modes: an account made
          with either has no password at all, so a parent who starts by
          typing one is walking into a dead end — "create" says the email
          is taken, "sign in" says the password is wrong. The buttons
          route through /auth/callback, which posts this code to
          /api/registration/attach and returns them to the funnel. Hidden in
          preview mode, which must never leave the page or write. */}
      {!previewMode && (
        <div className="space-y-3 mb-5">
          <GoogleButton
            mode={mode === 'create' ? 'signup' : 'signin'}
            registrationCode={code}
            onError={(m) => setAccountNotice(m)}
          />
          <AppleButton
            mode={mode === 'create' ? 'signup' : 'signin'}
            registrationCode={code}
            onError={(m) => setAccountNotice(m)}
          />
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">or use email</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-neutral-50 mb-5">
        <button onClick={() => setMode('create')}
          className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${mode === 'create' ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
          Create account
        </button>
        <button onClick={() => setMode('signin')}
          className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${mode === 'signin' ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
          I have an Optio account
        </button>
      </div>

      {mode === 'create' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">First name</label>
            <input className={field} value={account.first_name} onChange={(e) => setAccount({ ...account, first_name: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Last name</label>
            <input className={field} value={account.last_name} onChange={(e) => setAccount({ ...account, last_name: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
            <input type="email" className={field} value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
            <PasswordInput value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Confirm password</label>
            <PasswordInput value={account.confirm} onChange={(e) => setAccount({ ...account, confirm: e.target.value })} /></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500 -mt-1">
            Sign in with your existing Optio account — it will be connected to {org.name} automatically.
          </p>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
            <input type="email" className={field} value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
            <PasswordInput value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && submitSignin()} />
            {/* Also the way in for the org-imported parents whose
                accounts were created without a password. */}
            <a href="/forgot-password" target="_blank" rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-optio-purple font-medium hover:underline">
              Forgot password?
            </a></div>
        </div>
      )}
    </Section>

    <PrimaryButton onClick={mode === 'create' ? submitCreate : submitSignin} disabled={submitting}>
      {submitting ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in & continue'}
    </PrimaryButton>
  </div>
)

export default AccountStep
