import React, { memo } from 'react'

/**
 * AutomatedEmailsList - Read-only list of automated emails in the system
 *
 * Replaces the full CRM functionality with a simpler reference view
 * of what automated emails are sent by the platform.
 */

const AUTOMATED_EMAILS = [
  {
    name: 'Welcome Email',
    trigger: 'User Registration',
    description: 'Sent immediately when a new user signs up',
    status: 'active'
  },
  {
    name: 'Email Verification',
    trigger: 'User Registration',
    description: 'Contains verification link to confirm email address',
    status: 'active'
  },
  {
    name: 'Password Reset',
    trigger: 'Password Reset Request',
    description: 'Secure link to reset account password',
    status: 'active'
  },
  {
    name: 'Quest Completion',
    trigger: 'Quest Completed',
    description: 'Celebration email when student completes a quest',
    status: 'active'
  },
  {
    name: 'Parent Link Request',
    trigger: 'Parent Connection Initiated',
    description: 'Notification to student about parent link request',
    status: 'active'
  },
  {
    name: 'Observer Invitation',
    trigger: 'Observer Invited',
    description: 'Invitation email to observe a student\'s progress',
    status: 'active'
  },
  {
    name: 'Organization Invitation',
    trigger: 'Org Invite Created',
    description: 'Invitation to join an organization on Optio',
    status: 'active'
  },
  {
    name: 'Parental Consent Request',
    trigger: 'Under-13 Signup',
    description: 'COPPA-compliant consent request sent to parent/guardian',
    status: 'active'
  },
  {
    name: 'Consultation Confirmation',
    trigger: 'Consultation Booked',
    description: 'Booking confirmation with calendar details',
    status: 'active'
  },
  {
    name: 'Task Approval Notification',
    trigger: 'Task Approved by Advisor',
    description: 'Notifies student when advisor approves their task',
    status: 'active'
  },
  {
    name: 'Weekly Progress Summary',
    trigger: 'Weekly (Sunday)',
    description: 'Summary of learning progress for the week',
    status: 'inactive'
  }
]

const AutomatedEmailsList = () => {
  const activeEmails = AUTOMATED_EMAILS.filter(e => e.status === 'active')
  const inactiveEmails = AUTOMATED_EMAILS.filter(e => e.status === 'inactive')

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Automated Emails</h2>
        <p className="text-gray-600">
          Reference list of automated emails sent by the Optio platform. These emails are triggered automatically based on user actions.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{activeEmails.length}</p>
              <p className="text-sm text-green-600">Active Emails</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-400 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{inactiveEmails.length}</p>
              <p className="text-sm text-gray-600">Inactive Emails</p>
            </div>
          </div>
        </div>
      </div>

      {/* Email List Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Email Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Trigger
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {AUTOMATED_EMAILS.map((email, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-optio-purple/10 rounded-lg">
                      <svg className="w-4 h-4 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="font-medium text-gray-900">{email.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-600">{email.trigger}</span>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell">
                  <span className="text-sm text-gray-500">{email.description}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    email.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {email.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info Note */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Note:</span> Email content and templates are managed in the codebase. Contact the development team to modify email content or add new automated emails.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(AutomatedEmailsList)
