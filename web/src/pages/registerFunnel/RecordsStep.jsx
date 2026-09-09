// Funnel step 4 (credit partners only): where each student's official
// transcript should be sent when credit is awarded.
import React from 'react'
import { field, Section, PrimaryButton } from '../../components/registration/funnelUi'

const RecordsStep = ({ destinations, kids, previewMode, serverKids, setDestination, submitRecords, submitting }) => {
  // Preview mode has no server-side kids; fake ids from the sample
  // family so staff walking the funnel see the per-child layout.
  const rKids = previewMode
    ? kids.map((k, i) => ({ user_id: `preview-${i}`, first_name: k.first_name, name: `${k.first_name} ${k.last_name}`.trim() }))
    : serverKids
  return (
    <div className="space-y-6">
      <Section
        title="Where should the school records go?"
        subtitle="Credit is issued by Optio Academy on an official transcript. Tell us where each student's transcript should be sent, so we can send it for you when credit is awarded."
      >
        <div className="space-y-5">
          {rKids.map((k, idx) => {
            const d = destinations[k.user_id] || {}
            const name = (k.first_name || k.name || 'Your child').trim()
            return (
              <div key={k.user_id} className={idx > 0 ? 'pt-5 border-t border-gray-100' : ''}>
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">{name}</h3>

                <label className="block text-sm font-medium text-neutral-800 mb-1">
                  Is {name} enrolled in a school? <span className="text-red-500">*</span>
                </label>
                <select
                  className={field}
                  value={d.destination_type || ''}
                  onChange={(e) => setDestination(k.user_id, { destination_type: e.target.value })}
                >
                  <option value="">-- Please select --</option>
                  <option value="school">Yes, {name} attends a school</option>
                  <option value="homeschool">No, we homeschool</option>
                  <option value="optio_only">No, {name} is not enrolled anywhere right now</option>
                </select>

                {d.destination_type === 'school' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-800 mb-1">
                        School name <span className="text-red-500">*</span>
                      </label>
                      <input
                        className={field}
                        placeholder="e.g. Green Canyon High School"
                        value={d.school_name || ''}
                        onChange={(e) => setDestination(k.user_id, { school_name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        className={field} placeholder="City"
                        value={d.school_city || ''}
                        onChange={(e) => setDestination(k.user_id, { school_city: e.target.value })}
                      />
                      <input
                        className={field} placeholder="State"
                        value={d.school_state || ''}
                        onChange={(e) => setDestination(k.user_id, { school_state: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-800 mb-1">
                        Registrar or counselor
                      </label>
                      <p className="text-xs text-neutral-500 mb-2">
                        Who at the school receives transcripts. If you are not sure, leave this blank
                        and we will look it up.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          className={field} placeholder="Name"
                          value={d.registrar_name || ''}
                          onChange={(e) => setDestination(k.user_id, { registrar_name: e.target.value })}
                        />
                        <input
                          type="email" className={field} placeholder="Email"
                          value={d.registrar_email || ''}
                          onChange={(e) => setDestination(k.user_id, { registrar_email: e.target.value })}
                        />
                      </div>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox" className="mt-1"
                        checked={!!d.auto_send_consent}
                        onChange={(e) => setDestination(k.user_id, { auto_send_consent: e.target.checked })}
                      />
                      <span>
                        Send {name}&rsquo;s official transcript to this school automatically once credit
                        is awarded. Leave this unticked and we will email you first instead.
                      </span>
                    </label>
                  </div>
                )}

                {d.destination_type === 'homeschool' && (
                  <p className="mt-2 text-sm text-neutral-600">
                    Optio Academy will issue {name}&rsquo;s transcript directly to you, and you can send
                    it anywhere later.
                  </p>
                )}
                {d.destination_type === 'optio_only' && (
                  <p className="mt-2 text-sm text-neutral-600">
                    We will hold {name}&rsquo;s transcript on file. You can ask us to send it to a school
                    any time.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <PrimaryButton onClick={submitRecords} disabled={submitting}>
        {submitting ? 'Saving\u2026' : 'Continue'}
      </PrimaryButton>
    </div>
  )
}

export default RecordsStep
