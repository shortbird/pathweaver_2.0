import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getOverview, setFunnelStatus, runSweep } from './crmApi'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { Alert, PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import FunnelPipelineCard from './FunnelPipelineCard'

const SummaryTile = ({ label, value, to }) => {
  const body = (
    <>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value ?? 0}</p>
    </>
  )
  const base = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 block'
  if (to) {
    return (
      <Link to={to} className={`${base} hover:border-optio-purple/40 hover:shadow-md transition-all`}>
        {body}
      </Link>
    )
  }
  return <div className={base}>{body}</div>
}

/**
 * Funnel overview - one GET /overview call renders the summary tiles and a
 * pipeline card per funnel. Every count clicks through to the filtered leads
 * list.
 */
const FunnelOverview = () => {
  const confirm = useConfirm()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sweeping, setSweeping] = useState(false)

  useEffect(() => {
    fetchOverview()
  }, [])

  const fetchOverview = async () => {
    try {
      const response = await getOverview()
      setOverview(response.data || {})
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load funnel overview')
      setOverview({})
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (funnel) => {
    const pausing = funnel.status === 'active'
    const ok = await confirm({
      title: pausing ? `Pause "${funnel.name}"?` : `Resume "${funnel.name}"?`,
      body: pausing
        ? 'No emails will be sent while the funnel is paused. Leads keep their position.'
        : 'The sweep will start sending due steps again on its next run.',
      confirmLabel: pausing ? 'Pause funnel' : 'Resume funnel',
      destructive: pausing,
    })
    if (!ok) return
    try {
      await setFunnelStatus(funnel.id, pausing ? 'paused' : 'active')
      toast.success(pausing ? 'Funnel paused' : 'Funnel resumed')
      fetchOverview()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update funnel status')
    }
  }

  const handleRunSweep = async () => {
    const ok = await confirm({
      title: 'Run the funnel sweep now?',
      body: 'Due steps inside the send window will be sent immediately.',
      confirmLabel: 'Run sweep',
      destructive: false,
    })
    if (!ok) return
    setSweeping(true)
    try {
      await runSweep()
      toast.success('Sweep triggered')
      fetchOverview()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to run sweep')
    } finally {
      setSweeping(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading funnel overview" />
  }

  const summary = overview?.summary || {}
  const funnels = overview?.funnels || []

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Funnels</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRunSweep}
            disabled={sweeping}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {sweeping ? 'Running sweep...' : 'Run sweep now'}
          </button>
          <Link
            to="/admin/crm/funnels/new"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all min-h-[44px] inline-flex items-center"
          >
            New funnel
          </Link>
        </div>
      </div>

      {overview?.postal_address_missing && (
        <Alert variant="warning" title="Postal address missing" className="mb-6">
          The CAN-SPAM postal address is not set. Nurture funnels must not be activated until
          it is configured in CRM settings.
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <SummaryTile
          label="Active leads"
          value={summary.active_leads ?? overview?.active_leads}
          to="/admin/crm/leads?status=active"
        />
        <SummaryTile label="Sends (7d)" value={summary.sends_7d ?? overview?.sends_7d} />
        <SummaryTile
          label="Conversions (30d)"
          value={summary.conversions_30d ?? overview?.conversions_30d}
          to="/admin/crm/leads?status=converted"
        />
        <SummaryTile
          label="Suppressed"
          value={summary.suppressed ?? overview?.suppressed}
          to="/admin/crm/suppressions"
        />
      </div>

      {funnels.length === 0 ? (
        <EmptyState
          title="No funnels yet"
          hint="Create a funnel to start nurturing leads."
          action={
            <Link
              to="/admin/crm/funnels/new"
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all"
            >
              New funnel
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {funnels.map((funnel) => (
            <FunnelPipelineCard
              key={funnel.id}
              funnel={funnel}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FunnelOverview
