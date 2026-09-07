// Step 2 of the funnel preview: contact and address, the children cards, and
// the two org-configurable pieces that hang off them -- the health questions
// and the enrolment age gates that put a band on the waitlist.
import React from 'react'
import { Section, PrimaryButton, money, gateBandText } from '../../registration/funnelUi'
import FirstDayOfSchoolCard from '../FirstDayOfSchoolCard'
import EnrollmentAgeGatesCard from '../EnrollmentAgeGatesCard'
import { Editable, FixedNote, mockInput } from './setupChrome'

const FamilyStepPreview = ({
  askHealth, setAskHealth, draftFeeCents, feeApplies, onUpdate,
  openZones, toggleZone, org, orgId, waitlistGates,
}) => (
  <div className="space-y-6">
    <Section title="Contact & address">
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
          <input className={mockInput} readOnly placeholder="XXX-XXX-XXXX" value="" /></div>
        <div className="sm:col-span-4"><label className="block text-xs font-medium text-neutral-500 mb-1">Street address</label>
          <input className={mockInput} readOnly value="" /></div>
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Apt / unit (optional)</label>
          <input className={mockInput} readOnly value="" /></div>
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">City</label>
          <input className={mockInput} readOnly value="" /></div>
        <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">State</label>
          <input className={mockInput} readOnly placeholder="UT" value="" /></div>
        <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">ZIP</label>
          <input className={mockInput} readOnly value="" /></div>
      </div>
      <FixedNote>
        Standard step — parents add their contact details, a family photo, and each child
        (name, date of birth, photo, allergies, medications). Teens can get their own login.
      </FixedNote>
    </Section>

    <Editable
      label="Edit"
      open={openZones.has('gates')}
      onToggle={() => toggleZone('gates')}
      editor={(
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700 select-none">
            <input type="checkbox" checked={askHealth}
              onChange={(e) => setAskHealth(e.target.checked)}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            Ask for each child's allergies and required medications
          </label>
          <p className="text-xs text-neutral-500">
            The waitlist settings below drive the notice families see when they enter a child's
            date of birth (ages are judged as of the first day of school). They save on their own,
            separate from the main Save button.
          </p>
          <FirstDayOfSchoolCard orgId={orgId} org={org} onUpdate={onUpdate} />
          <EnrollmentAgeGatesCard orgId={orgId} org={org} onUpdate={onUpdate} />
        </div>
      )}
    >
      <Section title="Children">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-neutral-700">Child 1</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={mockInput} readOnly placeholder="First name" value="" />
            <input className={mockInput} readOnly placeholder="Last name" value="" />
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-500 mb-1">Date of birth</label>
              <input className={mockInput} readOnly placeholder="MM/DD/YYYY" value="" />
              {waitlistGates.map((g, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  Students {gateBandText(g)} are currently joining a waitlist. You can
                  finish registering this child — {org.name || 'the school'} will
                  email you as soon as they can choose classes.
                </p>
              ))}
              {waitlistGates.length > 0 && (
                <p className="text-[11px] text-neutral-400 mt-1">
                  ↑ Families see this notice when the child's birth date falls in a waitlisted age group.
                </p>
              )}
            </div>
            {askHealth && (
              <>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Allergies</label>
                  <textarea rows={2} className={mockInput} readOnly value="" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Required medications</label>
                  <textarea rows={2} className={mockInput} readOnly value="" />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-4">
          <span className="text-sm font-medium text-optio-purple">+ Add another child</span>
        </div>
      </Section>
    </Editable>

    {feeApplies && (
      <p className="text-center text-sm text-neutral-500">
        Registration fee: <span className="font-semibold text-neutral-800">{money(draftFeeCents(1))}</span>
      </p>
    )}
    <div className="pointer-events-none"><PrimaryButton>Continue</PrimaryButton></div>
  </div>
)

export default FamilyStepPreview
