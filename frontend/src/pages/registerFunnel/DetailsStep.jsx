// Funnel step 3: emergency contacts plus the org's own registration questions.
// Per-student questions key their answers by the kid's server user_id, which is
// why this step needs serverKids and not just the local `kids` rows.
import React from 'react'
import { field, QuestionField, Section, PrimaryButton } from '../../components/registration/funnelUi'
import { CONTACT_RELATIONSHIPS, emptyContact } from './funnelFields'

const DetailsStep = ({ answers, config, contacts, kids, previewMode, serverKids, setAnswers, setContact, setContacts, submitDetails, submitting }) => (
  <div className="space-y-6">
    {config.emergency_contacts !== false && (
    <Section title="Emergency contacts"
      subtitle="Add at least one emergency contact for your family.">
      <div className="space-y-4">
        {contacts.map((c, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-neutral-700">Contact {i + 1}</span>
              {contacts.length > 1 && <button onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">Remove</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={field} placeholder="Full name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
              <select className={field} value={c.relationship} onChange={(e) => setContact(i, { relationship: e.target.value })}>
                <option value="">Relationship</option>
                {CONTACT_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input type="tel" className={field} placeholder="Phone" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
              <input type="email" className={field} placeholder="Email (optional)" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setContacts((cs) => [...cs, emptyContact()])} className="mt-3 text-sm font-medium text-optio-purple hover:underline">+ Add another contact</button>
    </Section>
    )}

    {(config.questions || []).length > 0 && (() => {
      const familyQs = (config.questions || []).filter((q) => !q.per_student)
      const studentQs = (config.questions || []).filter((q) => q.per_student)
      // Per-student answers are keyed by the kid's user_id, which only
      // exists after the family step submits. Preview mode fakes ids
      // from the sample kids so staff sees the per-child layout.
      const qKids = previewMode
        ? kids.map((k, i) => ({ user_id: `preview-${i}`, first_name: k.first_name, name: `${k.first_name} ${k.last_name}`.trim() }))
        : serverKids
      // Built-in follow-up: only Utah Fits All families need to say
      // whether they're enrolling as a UFA Private School.
      const paymentIsUFA = familyQs.some((q) => {
        const v = answers[q.key]
        return Array.isArray(v) ? v.includes('Utah Fits All') : v === 'Utah Fits All'
      })
      return (
        <Section title="A few questions">
          <div className="space-y-5">
            {familyQs.map((q) => (
              <QuestionField key={q.key} q={q} value={answers[q.key]}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />
            ))}
            {paymentIsUFA && (
              <div>
                <label className="block text-sm font-medium text-neutral-800 mb-1">
                  Are you enrolling as a UFA (Utah Fits All) Private School?
                </label>
                <select className={field} value={answers.ufa_private || ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, ufa_private: e.target.value }))}>
                  <option value="">-- Please select --</option>
                  <option value="No">No, standard Utah Fits All</option>
                  <option value="Yes">Yes, UFA Private School</option>
                </select>
              </div>
            )}
            {studentQs.length > 0 && qKids.map((k, idx) => (
              <div key={k.user_id} className={familyQs.length || idx > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                  {(k.first_name || k.name || 'Your child').trim()}
                </h3>
                <div className="space-y-5">
                  {studentQs.map((q) => (
                    <QuestionField key={q.key} q={q} value={(answers[q.key] || {})[k.user_id]}
                      onChange={(v) => setAnswers((a) => ({
                        ...a,
                        [q.key]: { ...(a[q.key] || {}), [k.user_id]: v },
                      }))} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )
    })()}

    <PrimaryButton onClick={submitDetails} disabled={submitting}>
      {submitting ? 'Saving…' : 'Continue'}
    </PrimaryButton>
  </div>
)

export default DetailsStep
