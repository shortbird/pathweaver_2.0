import React, { useState } from 'react'
import { toast } from 'react-hot-toast'

import { Modal } from '../../ui/Modal'
import { Spinner } from '../../ui/Spinner'
import {
  useAdminTicket,
  useUpdateAdminTicket,
  TICKET_STATUSES,
  TICKET_TYPES,
  TICKET_PRIORITIES,
} from '../../../hooks/api/useAdminTickets'
import { STATUS_LABELS, STATUS_CLASSES, TYPE_LABELS, PRIORITY_LABELS, SOURCE_LABELS, formatWhen, reporterName } from './ticketLabels'

/**
 * One ticket, opened from the tracker's list at /admin/tickets/:ticketId.
 *
 * The top half is what the reporter said and where they were; the bottom half
 * is the triage: status, type, priority, internal notes, and -- once it is
 * done -- the resolution. Resolving here is the same write Claude Code makes
 * over the MCP, so a ticket closed either way reads the same.
 */
const Field = ({ label, children }) => (
  <div>
    <dt className="text-xs text-gray-500">{label}</dt>
    <dd className="text-sm text-gray-900 break-words">{children}</dd>
  </div>
)

const Select = ({ id, label, value, onChange, options, labels }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-field mt-1 px-3 py-2 text-sm w-full"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o] || o}
        </option>
      ))}
    </select>
  </div>
)

const jsonBlock = (value) => (value == null ? null : JSON.stringify(value, null, 2))

// The editable half of a ticket, as the form holds it.
const seed = (ticket) => ({
  title: ticket.title || '',
  status: ticket.status,
  type: ticket.type,
  priority: ticket.priority,
  triage_notes: ticket.triage_notes || '',
  resolution: ticket.resolution || '',
})

export default function TicketDetail({ ticketId, onClose }) {
  const { data: ticket, isLoading, isError } = useAdminTicket(ticketId)

  return (
    <Modal isOpen onClose={onClose} title={ticket ? ticket.title : 'Ticket'} size="lg">
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      )}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
          Could not load this ticket.
        </div>
      )}
      {/* Keyed on updated_at so a save (or a different ticket) remounts the
          form with fresh values instead of syncing state in an effect. */}
      {ticket && <TicketBody key={`${ticket.id}:${ticket.updated_at}`} ticket={ticket} />}
    </Modal>
  )
}

function TicketBody({ ticket }) {
  const update = useUpdateAdminTicket()
  const ticketId = ticket.id
  const [form, setForm] = useState(() => seed(ticket))
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  const diff = (next) => {
    const current = seed(ticket)
    return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]))
  }

  const dirty = Object.keys(diff(form)).length > 0

  const save = async (overrides = {}) => {
    const changes = diff({ ...form, ...overrides })
    if (Object.keys(changes).length === 0) return
    if (changes.title !== undefined && !changes.title.trim()) {
      toast.error('A ticket needs a title')
      return
    }
    try {
      await update.mutateAsync({ ticketId, changes })
      toast.success(changes.status ? `Ticket ${STATUS_LABELS[changes.status].toLowerCase()}` : 'Ticket saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the ticket')
    }
  }

  const resolve = () => save({ status: 'resolved' })
  const decline = () => save({ status: 'wont_fix' })
  const reopen = () => save({ status: 'triaged' })

  const isClosed = ticket.status === 'resolved' || ticket.status === 'wont_fix'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASSES[ticket.status] || ''}`}
        >
          {STATUS_LABELS[ticket.status] || ticket.status}
        </span>
        <span className="text-xs text-gray-500">
          {TYPE_LABELS[ticket.type]} · {PRIORITY_LABELS[ticket.priority]} priority
        </span>
        <span className="text-xs text-gray-400 ml-auto font-mono">{ticket.id}</span>
      </div>

      <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{ticket.message}</p>
        {ticket.steps && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Steps</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{ticket.steps}</p>
          </div>
        )}
        {ticket.screenshot_url && (
          <a href={ticket.screenshot_url} target="_blank" rel="noreferrer" className="inline-block mt-3">
            <img
              src={ticket.screenshot_url}
              alt="Screenshot attached to the ticket"
              className="max-h-64 rounded-lg border border-gray-200"
            />
          </a>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Reporter">
          {reporterName(ticket)}
          {ticket.user_role ? ` (${ticket.user_role})` : ''}
          {ticket.user_email && reporterName(ticket) !== ticket.user_email ? (
            <span className="block text-xs text-gray-500">{ticket.user_email}</span>
          ) : null}
        </Field>
        <Field label="Organization">{ticket.organizations?.name || 'None'}</Field>
        <Field label="Page">{ticket.current_route || 'unknown'}</Field>
        <Field label="Source">
          {SOURCE_LABELS[ticket.source] || ticket.source}
          {ticket.platform ? ` · ${ticket.platform}` : ''}
        </Field>
        <Field label="Filed">{formatWhen(ticket.created_at)}</Field>
        <Field label={isClosed ? 'Closed' : 'Updated'}>
          {formatWhen(isClosed ? ticket.resolved_at : ticket.updated_at)}
        </Field>
        {(ticket.app_version || ticket.build_number) && (
          <Field label="Build">
            {[ticket.app_version, ticket.build_number, ticket.ota_update_id].filter(Boolean).join(' · ')}
          </Field>
        )}
        {ticket.sentry_event_id && <Field label="Sentry event">{ticket.sentry_event_id}</Field>}
      </dl>

      {(ticket.breadcrumbs || ticket.recent_api_calls || ticket.recent_console_errors || ticket.extra) && (
        <div>
          <button
            type="button"
            className="text-sm font-medium text-optio-purple hover:underline"
            onClick={() => setShowDiagnostics((v) => !v)}
          >
            {showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
          </button>
          {showDiagnostics && (
            <div className="mt-2 space-y-3">
              {[
                ['Recent API calls', ticket.recent_api_calls],
                ['Console errors', ticket.recent_console_errors],
                ['Breadcrumbs', ticket.breadcrumbs],
                ['Extra', ticket.extra],
              ]
                .filter(([, v]) => v != null)
                .map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
                    <pre className="mt-1 text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto max-h-64">
                      {jsonBlock(value)}
                    </pre>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-200 pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Triage</h3>
        <div>
          <label htmlFor="ticket-title" className="block text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            id="ticket-title"
            value={form.title}
            onChange={(e) => set('title')(e.target.value)}
            maxLength={120}
            className="input-field mt-1 px-3 py-2 text-sm w-full"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            id="ticket-status"
            label="Status"
            value={form.status}
            onChange={set('status')}
            options={TICKET_STATUSES}
            labels={STATUS_LABELS}
          />
          <Select
            id="ticket-type"
            label="Type"
            value={form.type}
            onChange={set('type')}
            options={TICKET_TYPES}
            labels={TYPE_LABELS}
          />
          <Select
            id="ticket-priority"
            label="Priority"
            value={form.priority}
            onChange={set('priority')}
            options={TICKET_PRIORITIES}
            labels={PRIORITY_LABELS}
          />
        </div>
        <div>
          <label htmlFor="ticket-notes" className="block text-sm font-medium text-gray-700">
            Internal notes
          </label>
          <textarea
            id="ticket-notes"
            rows={4}
            value={form.triage_notes}
            onChange={(e) => set('triage_notes')(e.target.value)}
            className="input-field mt-1 px-3 py-2 text-sm w-full"
            placeholder="What you found, what it pairs with, what is blocking it."
          />
        </div>
        <div>
          <label htmlFor="ticket-resolution" className="block text-sm font-medium text-gray-700">
            Resolution
          </label>
          <textarea
            id="ticket-resolution"
            rows={3}
            value={form.resolution}
            onChange={(e) => set('resolution')(e.target.value)}
            className="input-field mt-1 px-3 py-2 text-sm w-full"
            placeholder="What was done, and the commit if there is one."
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            {isClosed ? (
              <button type="button" className="btn-quiet" onClick={reopen} disabled={update.isPending}>
                Reopen
              </button>
            ) : (
              <>
                <button type="button" className="btn-quiet" onClick={decline} disabled={update.isPending}>
                  Decline
                </button>
                <button type="button" className="btn-primary" onClick={resolve} disabled={update.isPending}>
                  {update.isPending ? <Spinner size="sm" className="border-white" /> : 'Mark resolved'}
                </button>
              </>
            )}
          </div>
          <button type="button" className="btn-quiet" onClick={() => save()} disabled={!dirty || update.isPending}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
