import React from 'react'
import { Link } from 'react-router-dom'
import {
  PhoneIcon, EnvelopeIcon, ChatBubbleLeftRightIcon, UserCircleIcon,
} from '@heroicons/react/24/outline'
import { messagesLinkFor } from '../../services/friendsAPI'

/**
 * Who to contact -- the school's "for this, ask that person" list, on the
 * family home.
 *
 * Ticket c58b7c0b (iCreate, org admin): "On parent dashboards, could we create
 * a section where there is who to contact info? So they can get in touch with
 * the right person for what they need without having to go through multiple
 * people... e.g. a question about something in the building message Becky;
 * late pick-up; general concern about classes message Sharmaine."
 *
 * The office keeps the list in SIS Settings; it arrives on the parent context
 * as `family_contacts` (services/sis_family_contacts_service.py). Each row is
 * a topic and a person, with a call and email link when the office gave
 * them, and a Message button when the person is a staff member with an
 * account (`message_user_id` -- the school's own thread when this family
 * writes to the front office through the school inbox). Renders nothing for
 * an empty list.
 */
export const telHref = (phone) => `tel:${String(phone).replace(/[^0-9+]/g, '')}`

export default function WhoToContactCard({ contacts, schoolName, className = 'mt-6' }) {
  if (!contacts?.length) return null
  return (
    <section aria-label="Who to contact" className={className}>
      <h2 className="text-sm font-semibold text-gray-900 mb-2">
        Who to contact{schoolName ? ` at ${schoolName}` : ''}
      </h2>
      <ul className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {contacts.map((c, i) => (
          <li key={`${c.topic}-${i}`} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3"
            data-testid="who-to-contact-row">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{c.topic}</p>
              {c.name && (
                <p className="text-sm text-gray-600 flex items-center gap-1.5">
                  <UserCircleIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  {c.name}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.phone && (
                <a href={telHref(c.phone)} className="btn-quiet text-sm" aria-label={`Call ${c.name || c.topic}`}>
                  <PhoneIcon className="w-4 h-4" />
                  {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="btn-quiet text-sm" aria-label={`Email ${c.name || c.topic}`}>
                  <EnvelopeIcon className="w-4 h-4" />
                  <span className="truncate max-w-[14rem]">{c.email}</span>
                </a>
              )}
              {c.message_user_id && (
                <Link to={messagesLinkFor(c.message_user_id)} className="btn-secondary text-sm"
                  aria-label={`Message ${c.name || c.topic}`}>
                  <ChatBubbleLeftRightIcon className="w-4 h-4" />
                  Message
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
