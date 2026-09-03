import React, { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import { printCredentialCards } from '../../utils/credentialCardsPrinter'

/**
 * Print login cards for the org's existing no-email (username) students.
 *
 * Passwords are hashed and can't be shown again, so printing a sheet for
 * existing accounts means generating new passwords first. The confirm step
 * makes that explicit; the results step mirrors BulkUsernameCreateModal's
 * one-time print/CSV moment.
 */
export default function PrintLoginCardsModal({ orgId, orgSlug, orgName, onClose }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const qrRef = useRef(null)

  const loginUrl = `${window.location.origin}/login/${orgSlug}`

  const handleConfirm = async () => {
    setError('')
    setLoading(true)
    try {
      const response = await api.post(
        `/api/admin/organizations/${orgId}/users/bulk-reset-passwords`,
        {}
      )
      setResult(response.data)
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data?.message
      setError(typeof errorData === 'string' ? errorData : 'Failed to reset passwords')
    } finally {
      setLoading(false)
    }
  }

  const handlePrintCards = () => {
    const svg = qrRef.current?.querySelector('svg')
    const qrSvg = svg ? new XMLSerializer().serializeToString(svg) : null
    printCredentialCards({
      credentials: result?.results || [],
      loginUrl,
      orgName: orgName || 'Your School',
      qrSvg
    })
  }

  const handleDownloadCsv = () => {
    const rows = result?.results || []
    const lines = ['name,username,password,login_url']
      .concat(rows.map(r =>
        `"${r.name.replace(/"/g, '""')}",${r.username},${r.password},${loginUrl}`
      ))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'student-login-credentials.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const rows = result?.results || []
  const failedRows = result?.failed || []

  return (
    <ModalOverlay onClose={onClose} closeOnOverlayClick={!result}>
      <div className="bg-white rounded-xl w-full max-w-2xl my-auto max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-xl font-bold">
              {result ? 'New Login Info Ready' : 'Print Login Cards'}
            </h2>
            {!result && (
              <p className="text-sm text-gray-500 mt-1">
                For students who sign in with a username instead of an email.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {/* Hidden QR used for the printable cards */}
          <div ref={qrRef} className="hidden" aria-hidden="true">
            <QRCodeSVG value={loginUrl} size={64} level="M" includeMargin={false} />
          </div>

          {!result ? (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Passwords can't be looked up after they're set, so printing cards
                for existing students generates a <strong>new password for every
                username-based student</strong> in your school. Any password they
                were using before will stop working. Students with email accounts
                are not affected.
              </div>

              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate New Passwords'}
                </button>
              </div>
            </>
          ) : rows.length === 0 ? (
            <>
              <p className="text-sm text-gray-600">
                {result.message || 'No username-based student accounts found in your school.'}
              </p>
              <div className="flex justify-end mt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4">
                Passwords are shown only once. Print the login cards or download
                the CSV now — you will not be able to see these passwords again.
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Username</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Password</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((r) => (
                      <tr key={r.user_id}>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 font-mono">{r.username}</td>
                        <td className="px-4 py-2 font-mono">{r.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {failedRows.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {failedRows.length} account{failedRows.length === 1 ? '' : 's'} could not be reset
                  (old passwords still work):
                  <ul className="mt-1 list-disc list-inside">
                    {failedRows.map((r) => (
                      <li key={r.user_id}>{r.name} ({r.username})</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-3">
                Students sign in at <span className="font-mono">{loginUrl}</span>
              </p>

              <div className="flex flex-wrap justify-end gap-3 mt-4">
                <button
                  onClick={handleDownloadCsv}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Download CSV
                </button>
                <button
                  onClick={handlePrintCards}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90"
                >
                  Print Login Cards
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
