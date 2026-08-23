import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listSuppressions, addSuppression, removeSuppression } from './crmApi'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDate } from './crmConstants'

const PER_PAGE = 25

/**
 * Suppression list: addresses that never receive marketing email. Search,
 * inline add (reason 'manual'), confirmed remove.
 */
const SuppressionList = () => {
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    fetchSuppressions()
  }, [page, debouncedSearchTerm]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSuppressions = async () => {
    try {
      const response = await listSuppressions({
        search: debouncedSearchTerm,
        page,
        limit: PER_PAGE,
      })
      setRows(response.data?.suppressions || [])
      setTotal(response.data?.total || 0)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load suppressions')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    setAdding(true)
    try {
      await addSuppression({ email, reason: 'manual' })
      toast.success('Email suppressed')
      setNewEmail('')
      fetchSuppressions()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add suppression')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (row) => {
    const ok = await confirm({
      title: `Remove ${row.email} from suppressions?`,
      body: 'The address becomes eligible for marketing email again.',
      confirmLabel: 'Remove suppression',
    })
    if (!ok) return
    try {
      await removeSuppression(row.id)
      toast.success('Suppression removed')
      fetchSuppressions()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove suppression')
    }
  }

  if (loading) {
    return <PageLoader label="Loading suppressions" />
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Suppressions</h2>
        <p className="text-sm text-gray-500">{total} total</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Search by email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search suppressions by email"
          className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-base"
        />
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="email@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            aria-label="Email to suppress"
            className="flex-1 px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-base"
          />
          <button
            onClick={handleAdd}
            disabled={!newEmail.trim() || adding}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex-shrink-0"
          >
            {adding ? 'Adding...' : 'Suppress'}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No suppressed addresses" hint="Unsubscribes, bounces and spam reports land here automatically." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Email
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Reason
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-3 pr-4 py-3" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 break-all">
                      {row.email}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        {row.reason}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-3 pr-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleRemove(row)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SuppressionList
