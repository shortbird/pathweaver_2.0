import React from 'react'
import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'support@optioeducation.com'

// Public account-deletion page. This URL is registered in the Google Play
// Data safety form as the account deletion link, so it must stay publicly
// reachable (no auth) and keep returning HTTP 200.
const DeleteAccountPage = () => {
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Delete your Optio account</h1>
          <p className="text-sm text-gray-600 mb-8">
            You can delete your account yourself from the mobile app or the web, or
            ask us to do it by email.
          </p>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Delete from the mobile app</h2>
            <ol className="list-decimal list-inside space-y-2 mb-4">
              <li>Open the Optio app and go to the <strong>Profile</strong> tab.</li>
              <li>Open the menu in the top corner and choose <strong>Settings</strong>.</li>
              <li>Under <strong>Account Settings</strong>, tap <strong>Delete Account</strong> and confirm.</li>
            </ol>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Delete on the web</h2>
            <ol className="list-decimal list-inside space-y-2 mb-4">
              <li>
                Sign in at{' '}
                <Link to="/login" className="text-optio-purple underline">
                  www.optioeducation.com
                </Link>.
              </li>
              <li>Open your <strong>Overview</strong> page and scroll to <strong>Account Settings</strong>.</li>
              <li>Choose <strong>Delete Account</strong> and confirm.</li>
            </ol>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Can&apos;t sign in?</h2>
            <p className="mb-4">
              Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-optio-purple underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              from the email address on the account and ask us to delete it. Parents can
              request deletion of a child&apos;s account the same way. If your account is
              managed by a school or program, we may coordinate with them to confirm the
              request.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">What happens when you delete</h2>
            <ul className="list-disc list-inside space-y-2 mb-4">
              <li>
                Your account is scheduled for permanent deletion with a{' '}
                <strong>30-day grace period</strong>. You can cancel any time during
                those 30 days by signing back in.
              </li>
              <li>
                After the grace period, your personal information and learning content
                (quests, tasks, evidence, journal entries, and XP) are permanently
                deleted.
              </li>
              <li>
                We may retain limited records where required by law, and anonymized
                data that no longer identifies you.
              </li>
            </ul>
            <p className="mb-4">
              For details on the data we collect and how it&apos;s handled, see our{' '}
              <Link to="/privacy" className="text-optio-purple underline">
                Privacy Policy
              </Link>
              . For anything else, visit{' '}
              <Link to="/support" className="text-optio-purple underline">
                Support
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default DeleteAccountPage
