import React, { useState, useEffect } from 'react'
import { lmsAPI } from '../../services/api'

export default function LMSIntegrationPanel() {
  const [platforms, setPlatforms] = useState([])
  const [selectedPlatform, setSelectedPlatform] = useState('canvas')
  const [rosterFile, setRosterFile] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [gradeSyncStatus, setGradeSyncStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadPlatforms()
    loadGradeSyncStatus()
  }, [])

  const loadPlatforms = async () => {
    try {
      setLoading(true)
      const response = await lmsAPI.getPlatforms()
      setPlatforms(response.data)
      setError(null)
    } catch (err) {
      console.error('Failed to load platforms:', err)
      setError('Failed to load LMS platforms. Please check your admin permissions.')
    } finally {
      setLoading(false)
    }
  }

  const loadGradeSyncStatus = async () => {
    try {
      const response = await lmsAPI.getGradeSyncStatus()
      setGradeSyncStatus(response.data)
    } catch (err) {
      console.error('Failed to load grade sync status:', err)
    }
  }

  const handleRosterSync = async () => {
    if (!rosterFile) return

    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const response = await lmsAPI.syncRoster(rosterFile, selectedPlatform)
      setSyncResult(response.data)
      setRosterFile(null)

      // Refresh grade sync status after roster sync
      await loadGradeSyncStatus()
    } catch (err) {
      console.error('Roster sync error:', err)
      setError(err.response?.data?.error || 'Failed to sync roster. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.name.endsWith('.csv')) {
      setRosterFile(file)
      setSyncResult(null)
      setError(null)
    } else {
      setError('Please select a valid CSV file')
      setRosterFile(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading LMS platforms...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">LMS Integration</h2>
        <p className="mt-1 text-sm text-gray-600">
          Connect Optio with your Learning Management System to sync rosters and assignments
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Platform Selection */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {platforms.map((platform) => (
              <div
                key={platform.id}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedPlatform === platform.id
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${!platform.configured ? 'opacity-50' : ''}`}
                onClick={() => setSelectedPlatform(platform.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{platform.name}</h4>
                    <p className="text-xs text-gray-600 mt-1">{platform.auth_method.toUpperCase()}</p>
                  </div>
                  {platform.configured ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                      Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                      Setup Required
                    </span>
                  )}
                </div>

                {!platform.configured && platform.missing_vars.length > 0 && (
                  <div className="mt-3 text-xs text-gray-600">
                    <p className="font-medium">Missing variables:</p>
                    <ul className="mt-1 list-disc list-inside">
                      {platform.missing_vars.map((varName) => (
                        <li key={varName} className="text-red-600">{varName}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                  {platform.supports_grade_passback && (
                    <span className="inline-flex items-center">
                      <svg className="w-3 h-3 mr-1 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Grades
                    </span>
                  )}
                  {platform.supports_roster_sync && (
                    <span className="inline-flex items-center">
                      <svg className="w-3 h-3 mr-1 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Roster
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Roster Sync Section */}
        <section className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync Student Roster</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 mb-4">
              Upload a OneRoster CSV file to bulk import or update students from your LMS.
              The CSV should include: <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">sourcedId</code>,{' '}
              <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">email</code>,{' '}
              <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">givenName</code>,{' '}
              <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">familyName</code>,{' '}
              <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">role</code>
            </p>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label htmlFor="roster-file" className="sr-only">
                  Choose CSV file
                </label>
                <input
                  id="roster-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={syncing}
                />
                {rosterFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: <span className="font-medium">{rosterFile.name}</span>
                  </p>
                )}
              </div>

              <button
                onClick={handleRosterSync}
                disabled={!rosterFile || syncing}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                  !rosterFile || syncing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {syncing ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Syncing...
                  </span>
                ) : (
                  'Sync Roster'
                )}
              </button>
            </div>
          </div>

          {/* Sync Results */}
          {syncResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-green-800">Sync Complete</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>Created: <span className="font-bold">{syncResult.users_created}</span> users</p>
                    <p>Updated: <span className="font-bold">{syncResult.users_updated}</span> users</p>

                    {syncResult.errors && syncResult.errors.length > 0 && (
                      <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-3">
                        <p className="font-medium text-yellow-800">Errors: {syncResult.errors.length}</p>
                        <ul className="mt-2 list-disc list-inside text-xs text-yellow-700 max-h-40 overflow-y-auto">
                          {syncResult.errors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Grade Sync Status */}
        {gradeSyncStatus && (
          <section className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Grade Sync Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Pending</p>
                    <p className="text-2xl font-bold text-yellow-900">{gradeSyncStatus.pending || 0}</p>
                  </div>
                  <div className="bg-yellow-200 rounded-full p-3">
                    <svg className="w-6 h-6 text-yellow-800" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">Completed</p>
                    <p className="text-2xl font-bold text-green-900">{gradeSyncStatus.completed || 0}</p>
                  </div>
                  <div className="bg-green-200 rounded-full p-3">
                    <svg className="w-6 h-6 text-green-800" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-800">Failed</p>
                    <p className="text-2xl font-bold text-red-900">{gradeSyncStatus.failed || 0}</p>
                  </div>
                  <div className="bg-red-200 rounded-full p-3">
                    <svg className="w-6 h-6 text-red-800" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={loadGradeSyncStatus}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                Refresh Status
              </button>
            </div>
          </section>
        )}

        {/* Documentation Link */}
        <section className="border-t pt-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Need Help?</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Check out the{' '}
                    <a
                      href="/docs/LMS_INTEGRATION.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline hover:text-blue-800"
                    >
                      LMS Integration Documentation
                    </a>{' '}
                    for detailed setup instructions, troubleshooting, and API reference.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
