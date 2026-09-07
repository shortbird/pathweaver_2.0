// Funnel step 2: contact details, address, and one card per child (photo, DOB,
// allergies, medications). addressBoxRef is the container mergeAutofilledFields
// reads when a password manager paints values in without firing React events.
import React from 'react'
import { field, money, ageFromDob, enrollmentGateFor, gateBandText, PhotoPicker, Section, PrimaryButton } from '../../components/registration/funnelUi'
import { emptyKid, formatMdy, mdyToIso } from './funnelFields'

const FamilyStep = ({ addressBoxRef, config, estimateFeeCents, family, kids, org, parentPhoto, pickKidPhoto, pickParentPhoto, setFamily, setKid, setKids, submitFamily, submitting }) => (
  <div className="space-y-6">
    <Section title="Contact & address">
      <div ref={addressBoxRef} className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
          <input type="tel" name="phone" autoComplete="tel" className={field} placeholder="XXX-XXX-XXXX" value={family.phone} onChange={(e) => setFamily({ ...family, phone: e.target.value })} /></div>
        <div className="sm:col-span-4"><label className="block text-xs font-medium text-neutral-500 mb-1">Street address</label>
          <input name="address-line1" autoComplete="address-line1" className={field} value={family.address_line1} onChange={(e) => setFamily({ ...family, address_line1: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Apt / unit (optional)</label>
          <input name="address-line2" autoComplete="address-line2" className={field} value={family.address_line2} onChange={(e) => setFamily({ ...family, address_line2: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">City</label>
          <input name="city" autoComplete="address-level2" className={field} value={family.city} onChange={(e) => setFamily({ ...family, city: e.target.value })} /></div>
        <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">State</label>
          <input name="state" autoComplete="address-level1" className={field} placeholder="UT" value={family.state} onChange={(e) => setFamily({ ...family, state: e.target.value })} /></div>
        <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">ZIP</label>
          <input name="zip" autoComplete="postal-code" className={field} value={family.postal_code} onChange={(e) => setFamily({ ...family, postal_code: e.target.value })} /></div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <label className="block text-xs font-medium text-neutral-500 mb-2">
          Your photo <span className="text-red-400">*</span>
        </label>
        <PhotoPicker
          label="Add your photo"
          url={parentPhoto.preview || parentPhoto.avatar_url}
          busy={parentPhoto.uploading}
          error={parentPhoto.error}
          onSelect={pickParentPhoto}
        />
        <p className="text-xs text-neutral-400 mt-1.5">Photos are required for every family member so staff can recognize your family.</p>
      </div>
    </Section>

    <Section title="Children">
      <div className="space-y-5">
        {kids.map((k, i) => {
          const age = ageFromDob(k.date_of_birth)
          const teen = age != null && age >= 13
          const dobInvalid = k.dob_text.length === 10 && !k.date_of_birth
          return (
            <div key={k._key || i} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-neutral-700">Child {i + 1}{age != null ? ` · age ${age}` : ''}</span>
                {kids.length > 1 && <button onClick={() => setKids((ks) => ks.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">Remove</button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={field} placeholder="First name" value={k.first_name} onChange={(e) => setKid(i, { first_name: e.target.value })} />
                <input className={field} placeholder="Last name" value={k.last_name} onChange={(e) => setKid(i, { last_name: e.target.value })} />
                <input className={field} placeholder="Preferred name (if different)" value={k.preferred_name} onChange={(e) => setKid(i, { preferred_name: e.target.value })} />
                <select className={field} value={k.gender} onChange={(e) => setKid(i, { gender: e.target.value })}>
                  <option value="">Gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Date of birth</label>
                  <input
                    className={`${field} ${dobInvalid ? 'border-red-400 focus:ring-red-400' : ''}`}
                    placeholder="MM/DD/YYYY" inputMode="numeric" maxLength={10}
                    value={k.dob_text}
                    onChange={(e) => {
                      const text = formatMdy(e.target.value)
                      setKid(i, { dob_text: text, date_of_birth: mdyToIso(text) || '' })
                    }}
                  />
                  {dobInvalid && (
                    <p className="text-xs text-red-500 mt-1" role="alert">
                      That date doesn't exist — double-check the month and day.
                    </p>
                  )}
                  {(() => {
                    const gate = enrollmentGateFor(config, k.date_of_birth)
                    if (!gate) return null
                    return (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                        Students {gateBandText(gate)} are currently joining a waitlist. You can
                        finish registering {k.first_name.trim() || 'this child'} — {org.name || 'the school'} will
                        email you as soon as they can choose classes.
                      </p>
                    )
                  })()}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">
                    Photo <span className="text-red-400">*</span>
                  </label>
                  <PhotoPicker
                    label={`Add ${k.first_name.trim() ? `${k.first_name.trim()}'s` : "this child's"} photo`}
                    url={k.photo_preview || k.staged_url || k.avatar_url}
                    busy={k.photo_uploading}
                    error={k.photo_error}
                    onSelect={(f) => pickKidPhoto(k, f)}
                  />
                </div>
                {config.health_fields !== false && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Allergies <span className="text-neutral-400"></span></label>
                      <textarea rows={2} className={field} value={k.allergies} onChange={(e) => setKid(i, { allergies: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Required medications <span className="text-neutral-400"></span></label>
                      <textarea rows={2} className={field} value={k.medications} onChange={(e) => setKid(i, { medications: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
              {teen && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Child's Email (Optional)</label>
                  <input type="email" className={field} placeholder="name@example.com"
                    value={k.email} onChange={(e) => setKid(i, { email: e.target.value })} />
                  <p className="mt-1 text-xs text-neutral-400">
                    With an email, {k.first_name.trim() || 'your child'} gets their own login. If they already
                    have an Optio account, enter its email and we'll connect it. Leave it blank to
                    manage their account under yours.
                  </p>
                </div>
              )}
              {age != null && age < 13 && (
                <p className="mt-2 text-xs text-neutral-400">Under 13 — managed under your account (no separate login).</p>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4">
        <button onClick={() => setKids((ks) => [...ks, emptyKid()])} className="text-sm font-medium text-optio-purple hover:underline">+ Add another child</button>
      </div>
    </Section>

    {estimateFeeCents() > 0 && (
      <p className="text-center text-sm text-neutral-500">
        Registration fee: <span className="font-semibold text-neutral-800">{money(estimateFeeCents())}</span>
      </p>
    )}

    <PrimaryButton onClick={submitFamily} disabled={submitting}>
      {submitting ? 'Saving your family…' : 'Continue'}
    </PrimaryButton>
  </div>
)

export default FamilyStep
