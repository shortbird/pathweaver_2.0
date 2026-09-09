// Funnel preview step 7: what a family is sent to once they finish. The org
// picks between setting goals with each kid and building next year's schedule,
// and supplies the appointment booking link.
import React from 'react'
import { field, absUrl } from '../../registration/funnelUi'
import { Editable } from './setupChrome'

const DoneStepPreview = ({
  flow, setFlow, schedulingUrl, setSchedulingUrl, org, openZones, toggleZone,
}) => {
const doneEditor = (
  <div className="space-y-3">
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">After registration, families are sent to…</label>
      <select className={field} value={flow} onChange={(e) => setFlow(e.target.value)}>
        <option value="schedule">Schedule Builder + booking an appointment (iCreate style)</option>
        <option value="goals">The family goals page — set direction and goals together</option>
      </select>
      <p className="text-xs text-neutral-400 mt-1">
        This also switches the org between schedule mode and goals mode in the SIS
        (the Goals tab shows for goals-mode orgs).
      </p>
    </div>
    {flow !== 'goals' && (
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1">Scheduling link (emailed after payment)</label>
        <input className={field} value={schedulingUrl} onChange={(e) => setSchedulingUrl(e.target.value)} placeholder="https://…" />
      </div>
    )}
  </div>
)

const doneStep = (
  <div className="space-y-6">
    <Editable label="Edit next steps" open={openZones.has('done')} onToggle={() => toggleZone('done')} editor={doneEditor}>
      {flow === 'goals' ? (
        <div className="space-y-6 text-center">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
            <p className="text-neutral-500 mb-5">
              Next, sit down with each of your kids and set a direction and goals for the
              year together.
            </p>
            <span className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold">
              Set your student's goals
            </span>
            <p className="text-sm text-neutral-500 mt-5">
              You'll review these together at your meeting with {org.name || 'the school'}.
            </p>
          </div>
          <p className="text-sm text-neutral-400">
            Registration is complete. You can sign in at any time with your email and password.
          </p>
        </div>
      ) : (
        <div className="space-y-6 text-center">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
            <p className="text-neutral-500 mb-5">
              Your account has been created. Next, use the Schedule Builder to create your
              family's schedule for the coming school year.
            </p>
            <span className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold">
              Open the Schedule Builder
            </span>
            <div className="border-t border-gray-100 mt-7 pt-6">
              <p className="text-neutral-500 mb-5">
                Then book an appointment with {org.name || 'the school'} staff to build your Customized Learning
                Plan — our team will review your schedule with you at the meeting.
              </p>
              {absUrl(schedulingUrl) ? (
                <span className="inline-block px-5 py-2.5 rounded-lg border border-optio-purple text-optio-purple font-semibold">
                  Book appointment
                </span>
              ) : (
                <p className="text-sm text-neutral-400">The school will reach out to schedule your appointment.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Editable>
  </div>
)

  return doneStep
}

export default DoneStepPreview
