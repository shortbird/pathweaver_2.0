import React, { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Modal from '../ui/Modal'
import api from '../../services/api'

// Read-only detail view for a catalog entry in the family Schedule Builder:
// a scheduled class (org_classes) or an Optio course (at-home learning).
// The add/waitlist action lives in the footer so the catalog rows only need
// a "Details" button.

export const money = (cents) => (cents == null ? null : `$${(cents / 100).toFixed(2)}`)

// Quest descriptions are stored as HTML; render them as plain text here.
const stripHtml = (html) => {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}
export const meetingText = (meetings = []) => {
  const recurring = meetings.filter((m) => m.day_of_week != null)
  if (!recurring.length) return 'Schedule TBD'
  const days = [...new Set(recurring.map((m) => DAY_ABBR[m.day_of_week]))].join('/')
  const first = recurring[0]
  return `${days} · ${fmtTime(first.start_time)}–${fmtTime(first.end_time)}`
}

const ageText = (min, max) => {
  if (min != null && max != null) return `${min}–${max}`
  if (min != null) return `${min}+`
  if (max != null) return `Up to ${max}`
  return null
}

const Fact = ({ label, children }) => (
  <div>
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</dt>
    <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
  </div>
)

const ClassDetailsModal = ({ item, type, conflict, locked, busy, onClose, onAdd }) => {
  const isCourse = type === 'course'
  const [quests, setQuests] = useState([])

  // Courses are built from Projects (quests) — show families what's inside.
  useEffect(() => {
    if (!isCourse || !item?.id) { setQuests([]); return }
    api.get(`/api/courses/${item.id}/quests`)
      .then((r) => setQuests((r.data?.quests || []).filter((q) => q.is_published !== false)))
      .catch(() => setQuests([]))
  }, [isCourse, item?.id])

  if (!item) return null

  const name = isCourse ? item.title : item.name
  const image = isCourse ? item.cover_image_url : item.image_url
  const isFull = !isCourse && item.is_full
  const teacher = item.primary_instructor
  const ages = isCourse ? item.age_range : ageText(item.min_age, item.max_age)
  const tuition = money(isCourse ? item.tuition_cents : item.price_cents)
  const supplyFee = !isCourse && item.supply_fee != null ? `$${Number(item.supply_fee).toFixed(2)}` : null

  const availability = isCourse ? null
    : isFull ? 'Full — waitlist available'
    : item.spots_left != null ? `${item.spots_left} spot${item.spots_left === 1 ? '' : 's'} left`
    : 'Open enrollment'

  return (
    <Modal isOpen onClose={onClose} size="md" bodyClassName="!p-0" footer={
      <div className="flex items-center justify-end gap-3 w-full">
        {conflict && <p className="mr-auto text-xs font-medium text-red-600">Overlaps {conflict} on the current schedule</p>}
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors">
          Close
        </button>
        {!locked && onAdd && (
          <button onClick={onAdd} disabled={busy}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Adding…' : isFull ? 'Join waitlist' : isCourse ? 'Add course' : 'Add class'}
          </button>
        )}
      </div>
    }>
      {/* Hero — class image with a legibility gradient; brand gradient when there is no image */}
      <div className="relative h-48 sm:h-60 bg-gradient-to-br from-optio-purple to-optio-pink">
        {image && <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <button onClick={onClose} aria-label="Close details"
          className="absolute top-3 right-3 rounded-full bg-black/40 hover:bg-black/60 text-white p-2 backdrop-blur-sm transition-colors">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {isCourse && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white backdrop-blur-sm">At-home learning</span>}
            {isFull && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400 text-amber-950">Full — waitlist</span>}
            {conflict && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500 text-white">Overlaps {conflict}</span>}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">{name}</h2>
          <p className="text-sm text-white/90">
            {isCourse
              ? (item.estimated_hours ? `About ${item.estimated_hours} hours, at your own pace` : 'Learn at your own pace')
              : meetingText(item.meetings)}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4 pb-5 border-b border-gray-100">
          {!isCourse && <Fact label="Schedule">{meetingText(item.meetings)}</Fact>}
          {!isCourse && item.location && <Fact label="Location">{item.location}</Fact>}
          {isCourse && <Fact label="Format">Online at home, teacher supported</Fact>}
          {isCourse && item.estimated_hours && <Fact label="Time">~{item.estimated_hours} hrs</Fact>}
          {teacher && (
            <Fact label="Teacher">
              <span className="inline-flex items-center gap-1.5">
                {teacher.avatar_url
                  ? <img src={teacher.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  : <span className="w-5 h-5 rounded-full bg-optio-purple/10 text-optio-purple text-[10px] font-bold inline-flex items-center justify-center">{(teacher.name || '?').charAt(0)}</span>}
                {teacher.name}
              </span>
            </Fact>
          )}
          {ages && <Fact label="Ages">{ages}</Fact>}
          {tuition && <Fact label="Tuition">{tuition}</Fact>}
          {supplyFee && <Fact label="Supply fee">{supplyFee}</Fact>}
          {availability && (
            <Fact label="Availability">
              <span className={isFull ? 'text-amber-700 font-medium' : ''}>{availability}</span>
            </Fact>
          )}
        </dl>

        <h3 className="text-sm font-semibold text-neutral-900 mt-5 mb-1.5">
          About this {isCourse ? 'course' : 'class'}
        </h3>
        {item.description
          ? <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">{item.description}</p>
          : <p className="text-sm text-neutral-400">No description yet — contact the school with questions.</p>}

        {isCourse && quests.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-neutral-900 mt-5 mb-2">
              Projects in this course
            </h3>
            <ol className="space-y-2">
              {quests.map((q, i) => (
                <li key={q.id || i} className="flex gap-3 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-optio-purple/10 text-optio-purple text-[11px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-800">{q.title}</p>
                    {q.description && <p className="text-neutral-500 line-clamp-2">{stripHtml(q.description)}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  )
}

export default ClassDetailsModal
