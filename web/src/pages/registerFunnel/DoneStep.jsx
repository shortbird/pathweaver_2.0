// Funnel step 7: "your account is ready". Two endings, chosen by the org's
// post_registration_flow -- set goals with each kid (Gryffin), or build next
// year's schedule and book the Customized Learning Plan appointment (iCreate).
// Both destinations stay reachable after leaving, so this page never has to be
// found again.
import React from 'react'

const DoneStep = ({ code, config, org, previewMode, scheduling }) => (
  config.post_registration_flow === 'goals' ? (
    <div className="space-y-6 text-center">
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
        <p className="text-neutral-500 mb-5">
          Next, sit down with each of your kids and set a direction and goals for the
          year together.
        </p>
        <a href="/family/goals"
          className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
          Set your student's goals
        </a>
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
          Your account has been created. Next, use the Schedule page to create your
          family's schedule for the coming school year.
        </p>
        {/* Preview mode opens the staff walkthrough of the builder (real
            catalog, sample student, nothing saved) in a new tab so the
            funnel preview stays put. */}
        <a href={previewMode ? `/schedule-builder/preview/${code}` : '/schedule-builder'}
          target={previewMode ? '_blank' : undefined} rel={previewMode ? 'noreferrer' : undefined}
          className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
          Open your Schedule
        </a>
        <div className="border-t border-gray-100 mt-7 pt-6">
          <p className="text-neutral-500 mb-5">
            Then book an appointment with {org.name || 'the school'} staff to build your Customized Learning
            Plan — our team will review your schedule with you at the meeting.
            {scheduling.emailed && ' We also emailed you the booking link.'}
          </p>
          {scheduling.url ? (
            <a href={scheduling.url} target="_blank" rel="noreferrer"
              className="inline-block px-5 py-2.5 rounded-lg border border-optio-purple text-optio-purple font-semibold hover:bg-optio-purple/5">
              Book appointment
            </a>
          ) : (
            <p className="text-sm text-neutral-400">The school will reach out to schedule your appointment.</p>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-400">
        Registration is complete. You can sign in at any time with your email and password —
        the Schedule page also has a Book appointment button if you need it later.
      </p>
    </div>
  )
)

export default DoneStep
