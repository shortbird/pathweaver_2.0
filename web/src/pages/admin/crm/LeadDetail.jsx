import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { getLead, convertLead, exitLead, addLeadNote, addSuppression } from './crmApi'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import LeadTimeline from './LeadTimeline'
import MoveLeadModal from './MoveLeadModal'
import {
  CONTACT_TYPE_LABELS,
  LEAD_STATUS_BADGES,
  SOURCE_CHIP_CLASS,
  formatDate,
  formatDateTime,
} from './crmConstants'

/**
 * Lead detail: timeline on the left, funnel-state card and actions on the
 * right. Every action POSTs a body object (CSRF rule) and refetches.
 */
const LeadDetail = () => {
  const { leadId } = useParams()
  const confirm = useConfirm()

  const [lead, setLead] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    fetchLead()
  }, [leadId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLead = async () => {
    try {
      const response = await getLead(leadId)
      const data = response.data || {}
      const loadedLead = data.lead || data
      setLead(loadedLead)
      setTimeline(data.timeline || loadedLead.timeline || [])
      setMembership(data.membership || loadedLead.membership || null)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load lead')
      setLead(null)
    } finally {
      setLoading(false)
    }
  }

  const handleConvert = async () => {
    const ok = await confirm({
      title: 'Mark this lead as converted?',
      body: 'The lead exits its active nurture funnel and stops receiving nurture email.',
      confirmLabel: 'Mark converted',
      destructive: false,
    })
    if (!ok) return
    try {
      await convertLead(leadId)
      toast.success('Lead marked converted')
      fetchLead()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to mark lead converted')
    }
  }

  const handleExit = async () => {
    const ok = await confirm({
      title: 'Remove this lead from its funnel?',
      body: 'No more funnel emails will be sent. The lead record is kept.',
      confirmLabel: 'Remove from funnel',
    })
    if (!ok) return
    try {
      await exitLead(leadId)
      toast.success('Lead removed from funnel')
      fetchLead()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove lead from funnel')
    }
  }

  const handleSuppress = async () => {
    const ok = await confirm({
      title: `Suppress ${lead?.email}?`,
      body: 'Suppressed addresses never receive marketing email again until removed from the suppression list.',
      confirmLabel: 'Suppress email',
    })
    if (!ok) return
    try {
      await addSuppression({ email: lead.email, reason: 'manual' })
      toast.success('Email suppressed')
      fetchLead()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to suppress email')
    }
  }

  const handleAddNote = async () => {
    const body = noteBody.trim()
    if (!body) return
    setAddingNote(true)
    try {
      await addLeadNote(leadId, body)
      toast.success('Note added')
      setNoteBody('')
      fetchLead()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add note')
    } finally {
      setAddingNote(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading lead" />
  }

  if (!lead) {
    return (
      <EmptyState
        title="Lead not found"
        action={
          <Link to="/admin/crm/leads" className="text-sm font-medium text-optio-purple hover:underline">
            Back to leads
          </Link>
        }
      />
    )
  }

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  const stepOrder = membership?.step_order ?? membership?.last_step_sent
  const totalSteps = membership?.total_steps ?? membership?.step_count

  const actionButtonClass =
    'w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] text-left'

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin/crm/leads"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-optio-purple transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to leads
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900 break-all">{lead.email}</h2>
          <span
            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
              LEAD_STATUS_BADGES[lead.status] || 'bg-gray-100 text-gray-700'
            }`}
          >
            {lead.status}
          </span>
          {lead.lead_source && (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SOURCE_CHIP_CLASS}`}>
              {CONTACT_TYPE_LABELS[lead.lead_source] || lead.lead_source}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {name && <span>{name} · </span>}
          Entered {formatDate(lead.created_at)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Timeline</h3>
          <LeadTimeline items={timeline} />
        </div>

        {/* State + actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Funnel state</h3>
            {membership ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Funnel</dt>
                  <dd className="font-medium text-gray-900 text-right">
                    {membership.funnel_name || membership.funnel?.name || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Position</dt>
                  <dd className="font-medium text-gray-900">
                    {stepOrder != null && totalSteps != null
                      ? `Step ${stepOrder} of ${totalSteps}`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Next send</dt>
                  <dd className="font-medium text-gray-900">
                    {formatDateTime(membership.next_send_at)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-gray-400">Not in a funnel.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Actions</h3>
            <div className="space-y-2">
              <button onClick={handleConvert} className={actionButtonClass}>
                Mark converted
              </button>
              <button onClick={handleExit} className={actionButtonClass}>
                Remove from funnel
              </button>
              <button onClick={() => setShowMoveModal(true)} className={actionButtonClass}>
                Move to funnel step
              </button>
              <button
                onClick={handleSuppress}
                className="w-full px-4 py-2 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors min-h-[44px] text-left"
              >
                Suppress email
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <label htmlFor="lead-note" className="block text-sm font-medium text-gray-700 mb-1">
                Add note
              </label>
              <textarea
                id="lead-note"
                rows={3}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Internal note about this lead..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple resize-vertical"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteBody.trim() || addingNote}
                className="mt-2 w-full px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {addingNote ? 'Adding...' : 'Add note'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showMoveModal && (
        <MoveLeadModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          lead={lead}
          onMoved={() => {
            setShowMoveModal(false)
            fetchLead()
          }}
        />
      )}
    </div>
  )
}

export default LeadDetail
