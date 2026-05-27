import React from 'react'
import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'support@optioeducation.com'

const SupportPage = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Support</h1>
          <p className="text-sm text-gray-600 mb-8">
            We&apos;re a small team and we read every message.
          </p>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Get in touch</h2>
            <p className="mb-4">
              The fastest way to reach us is by email. Tell us what device and account
              you&apos;re using and we&apos;ll usually reply within one business day.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-block bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold px-6 py-3 rounded-lg"
            >
              Email {SUPPORT_EMAIL}
            </a>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Common questions</h2>

            <h3 className="text-lg font-semibold mt-6 mb-2">I forgot my password.</h3>
            <p className="mb-4">
              Visit{' '}
              <Link to="/forgot-password" className="text-optio-purple underline">
                /forgot-password
              </Link>{' '}
              and we&apos;ll send a reset link to your email.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">
              How do I add a child to my parent account?
            </h3>
            <p className="mb-4">
              On the web, go to <strong>Family Settings</strong> and choose
              {' '}<strong>Add a child</strong>. You can either create a managed dependent
              account (kids under 13) or invite an existing student (13+) to link with you.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">
              How do I invite a grandparent or mentor as an observer?
            </h3>
            <p className="mb-4">
              Parents can send observer invites from <strong>Family Settings</strong>.
              Observers see student activity in a read-only feed and can leave kind
              comments. They never see admin or account-management tools.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">
              How do I delete my account or my child&apos;s account?
            </h3>
            <p className="mb-4">
              Email {' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-optio-purple underline">
                {SUPPORT_EMAIL}
              </a>
              {' '}from the address on file and we&apos;ll process the deletion within
              30 days, removing all personal information and learning content.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">
              The mobile app isn&apos;t loading data.
            </h3>
            <p className="mb-4">
              Pull down on any screen to refresh. If that doesn&apos;t work, sign out and
              back in. If the problem persists, email us with a screenshot and the
              account email so we can take a look.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">
              Something else?
            </h3>
            <p className="mb-4">
              Just email us — we&apos;re happy to help.
            </p>
          </section>

          <section className="mb-2">
            <h2 className="text-2xl font-semibold mb-3">Helpful links</h2>
            <ul className="list-disc ml-6">
              <li>
                <Link to="/privacy" className="text-optio-purple underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-optio-purple underline">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-optio-purple underline">
                  How Optio works
                </Link>
              </li>
              <li>
                <Link to="/" className="text-optio-purple underline">
                  optioeducation.com home
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SupportPage
