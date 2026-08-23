import React from 'react'
import { Link } from 'react-router-dom'
import {
  CONTACT_TYPE_LABELS,
  FUNNEL_STATUS_BADGES,
  SOURCE_CHIP_CLASS,
} from './crmConstants'

/**
 * Metric formatter for the sent/opened/clicked row: "—" when the value is
 * missing, or when it is zero and nothing has been sent yet (tracking absent).
 */
const fmtMetric = (value, hasSends = true) => {
  if (value === null || value === undefined) return '—'
  if (!hasSends && !value) return '—'
  return value
}

/**
 * One funnel's pipeline card on the overview: status, entry types, a
 * horizontal step strip with per-step counts, and exit tallies. Every count
 * links to the leads list pre-filtered by query string.
 */
const FunnelPipelineCard = ({ funnel, onToggleStatus }) => {
  const steps = [...(funnel.steps || [])].sort(
    (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)
  )
  const exits = funnel.exits || {}
  const isActive = funnel.status === 'active'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900">{funnel.name}</h3>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                FUNNEL_STATUS_BADGES[funnel.status] || FUNNEL_STATUS_BADGES.paused
              }`}
            >
              {funnel.status}
            </span>
            {funnel.funnel_type && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                {funnel.funnel_type}
              </span>
            )}
          </div>
          {(funnel.entry_types || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {funnel.entry_types.map((type) => (
                <span
                  key={type}
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${SOURCE_CHIP_CLASS}`}
                >
                  {CONTACT_TYPE_LABELS[type] || type}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onToggleStatus(funnel)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors min-h-[36px] ${
              isActive
                ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            {isActive ? 'Pause' : 'Resume'}
          </button>
          <Link
            to={`/admin/crm/funnels/${funnel.id}`}
            className="px-3 py-1.5 text-sm font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors min-h-[36px] inline-flex items-center"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Step strip */}
      {steps.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No steps yet.</p>
      ) : (
        <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
          {steps.map((step, index) => {
            const hasSends = (step.sent ?? 0) > 0
            return (
              <React.Fragment key={step.id}>
                {index > 0 && (
                  <div className="flex items-center flex-shrink-0 text-gray-300" aria-hidden="true">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
                <Link
                  to={`/admin/crm/leads?funnel_id=${funnel.id}&step_id=${step.id}`}
                  className={`flex-shrink-0 w-32 rounded-lg border p-3 transition-all hover:border-optio-purple/40 hover:shadow-md ${
                    step.is_active === false
                      ? 'border-gray-200 bg-gray-50 opacity-70'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-xs text-gray-500 truncate" title={step.name}>
                    {step.step_order}. {step.name}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {step.active_leads ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400 whitespace-nowrap">
                    {fmtMetric(step.sent)} sent · {fmtMetric(step.opened, hasSends)} op ·{' '}
                    {fmtMetric(step.clicked, hasSends)} cl
                  </p>
                  {step.is_active === false && (
                    <p className="mt-1 text-[11px] font-medium text-gray-500">inactive</p>
                  )}
                </Link>
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Exit tallies */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link
          to={`/admin/crm/leads?funnel_id=${funnel.id}&status=converted`}
          className="text-gray-600 hover:text-optio-purple transition-colors"
        >
          <span className="font-semibold text-gray-900">{exits.converted ?? 0}</span> converted
        </Link>
        <Link
          to={`/admin/crm/leads?funnel_id=${funnel.id}&membership_status=completed`}
          className="text-gray-600 hover:text-optio-purple transition-colors"
        >
          <span className="font-semibold text-gray-900">{exits.completed ?? 0}</span> completed
        </Link>
        <Link
          to={`/admin/crm/leads?funnel_id=${funnel.id}&status=unsubscribed`}
          className="text-gray-600 hover:text-optio-purple transition-colors"
        >
          <span className="font-semibold text-gray-900">{exits.unsubscribed ?? 0}</span>{' '}
          unsubscribed
        </Link>
        <span className="ml-auto text-gray-500">
          <span className="font-semibold text-gray-900">{funnel.active_leads ?? 0}</span> active
          leads
        </span>
      </div>
    </div>
  )
}

export default FunnelPipelineCard
