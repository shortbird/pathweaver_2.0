import React from 'react'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDateTime } from './crmConstants'

const DOT_COLORS = {
  entered: 'bg-optio-purple',
  send: 'bg-blue-500',
  event: 'bg-green-500',
  note: 'bg-yellow-500',
  status_change: 'bg-gray-400',
}

const STATE_BADGES = {
  sent: 'bg-gray-100 text-gray-700',
  opened: 'bg-blue-100 text-blue-700',
  clicked: 'bg-green-100 text-green-700',
  bounced: 'bg-red-100 text-red-700',
}

/** Derive the send-state badges from whichever fields the API provides. */
const sendStates = (item) => {
  const states = []
  if (item.sent_at || item.status === 'sent' || item.sent) states.push('sent')
  if (item.opened_at || item.opened) states.push('opened')
  if (item.clicked_at || item.clicked) states.push('clicked')
  if (item.bounced_at || item.bounced || item.bounce_reason) states.push('bounced')
  return states
}

const itemDetail = (item) => item.detail || {}

const itemTitle = (item) => {
  switch (item.type) {
    case 'entered':
      return `Entered ${item.funnel_name || itemDetail(item).funnel_name || 'funnel'}`
    case 'send':
      return item.template_name || item.step_name || itemDetail(item).step_name || 'Email sent'
    case 'note':
      return 'Note'
    case 'status_change': {
      const d = itemDetail(item)
      const from = item.from || d.from
      const to = item.to || d.to
      return from && to ? `Status changed: ${from} to ${to}` : 'Status changed'
    }
    default:
      return item.title || item.event_type || itemDetail(item).event_type || 'Event'
  }
}

/**
 * Vertical timeline for one lead: funnel entries, sends (with open/click/
 * bounce states), conversion events, notes and status changes.
 */
const LeadTimeline = ({ items = [] }) => {
  if (!items.length) {
    return <EmptyState plain title="No activity yet" />
  }

  return (
    <ol className="relative border-l border-gray-200 ml-2">
      {items.map((item, index) => (
        <li key={item.id || index} className="ml-5 pb-6 last:pb-0 relative">
          <span
            className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${
              DOT_COLORS[item.type] || 'bg-gray-300'
            }`}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-medium text-gray-900">{itemTitle(item)}</p>
            <time className="text-xs text-gray-400">
              {formatDateTime(item.created_at || item.occurred_at || item.sent_at)}
            </time>
          </div>

          {item.type === 'send' && (
            <div className="mt-1">
              {(item.subject || itemDetail(item).subject) && (
                <p className="text-sm text-gray-600">
                  {item.subject || itemDetail(item).subject}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sendStates(item).map((state) => (
                  <span
                    key={state}
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATE_BADGES[state]}`}
                  >
                    {state}
                  </span>
                ))}
              </div>
              {(item.bounce_reason || itemDetail(item).bounce_reason) && (
                <p className="mt-1 text-xs text-red-600">
                  {item.bounce_reason || itemDetail(item).bounce_reason}
                </p>
              )}
            </div>
          )}

          {item.type === 'note' && (
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">
              {item.body || itemDetail(item).body}
            </p>
          )}

          {item.type !== 'send' && item.type !== 'note' && (item.description || itemDetail(item).description) && (
            <p className="mt-1 text-sm text-gray-600">
              {item.description || itemDetail(item).description}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

export default LeadTimeline
