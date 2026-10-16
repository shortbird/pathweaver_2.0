// Step 1 of the funnel preview. The account itself is not configurable --
// every org's registration starts with an Optio parent account -- so it
// renders as a FixedNote. The one thing a school can change here is the
// "Join the waitlist" door above it (InterestListSetting).
import React from 'react'
import { Section, PasswordInput, PrimaryButton, JoinWaitlistCard } from '../../registration/funnelUi'
import { Editable, FixedNote, mockInput } from './setupChrome'
import InterestListSetting from './InterestListSetting'

const AccountStepPreview = ({ org, orgId, onUpdate, openZones, toggleZone }) => {
  const flags = org.feature_flags || {}
  const setting = (flags.registration || flags.icreate_registration || {}).interest_list || {}
  const open = !!openZones?.has('interest_list')
  return (
  <div className="space-y-6">
    {orgId && (
      <Editable label="Edit waitlist" open={open} onToggle={() => toggleZone('interest_list')}
        editor={<InterestListSetting orgId={orgId} setting={setting} onUpdate={onUpdate} />}>
        {setting.enabled ? (
          <div className="pointer-events-none"><JoinWaitlistCard interestList={setting} onJoinWaitlist={() => {}} /></div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 px-5 py-4 text-sm text-neutral-400">
            Waitlist sign-up is off. Turn it on to let families join a waitlist before they register or pay.
          </div>
        )}
      </Editable>
    )}
    <Section title="Your account" subtitle="Registration starts with your parent account.">
      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-neutral-50 mb-5">
        <span className="text-sm px-4 py-1.5 rounded-md font-medium bg-optio-purple text-white">Create account</span>
        <span className="text-sm px-4 py-1.5 rounded-md font-medium text-neutral-600">I have an Optio account</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-medium text-neutral-500 mb-1">First name</label>
          <input className={mockInput} readOnly value="" /></div>
        <div><label className="block text-xs font-medium text-neutral-500 mb-1">Last name</label>
          <input className={mockInput} readOnly value="" /></div>
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
          <input className={mockInput} readOnly value="" /></div>
        <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
          <div className="pointer-events-none"><PasswordInput value="" onChange={() => {}} /></div></div>
        <div><label className="block text-xs font-medium text-neutral-500 mb-1">Confirm password</label>
          <div className="pointer-events-none"><PasswordInput value="" onChange={() => {}} /></div></div>
      </div>
      <FixedNote>
        Standard step — same for every organization. Parents create an Optio account (with an
        emailed 6-digit confirmation code) or sign in with an existing one, and it is attached
        to {org.name || 'your school'} automatically.
      </FixedNote>
    </Section>
    <div className="pointer-events-none"><PrimaryButton>Create account</PrimaryButton></div>
  </div>
  )
}

export default AccountStepPreview
