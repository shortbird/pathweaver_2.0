import React from 'react'
import { formatCents as money } from '../../../utils/money'

// "$12,450.00", not "$12450.00": a school's term of tuition is five figures.
const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`)

const Stat = ({ label, value, hint }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <div className="text-sm text-neutral-500">{label}</div>
    <div className="text-2xl font-bold text-neutral-900 mt-1">{value}</div>
    {hint && <div className="text-[11px] text-neutral-400 mt-1 leading-tight">{hint}</div>}
  </div>
)

/**
 * The numbers the office asks for first. They used to sit at the foot of the
 * reports page, under the grid and under whatever report had just run.
 *
 * iCreate, 2026-08-18: "it says we have 7 students and 1 enrolled. What does
 * enrolled vs students mean? And also this is incorrect." Both came off
 * school_enrollments -- the school-of-record table, which most schools barely
 * use -- so "Students" counted withdrawn and graduated rows and "Enrolled"
 * counted one diploma student while 188 children sat in their classes. Every
 * number says what it counts, and the first one is the number people mean by
 * "how many students do we have".
 */
export default function OverviewStats({ enrollment, revenue, attendance, seesMoney }) {
  const withdrawn = enrollment?.by_status?.withdrawn
  const graduated = enrollment?.by_status?.graduated
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold text-neutral-900 mb-3">Enrollment</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Students in classes" value={enrollment?.students_in_classes ?? 0}
            hint="Distinct students holding a seat in a class" />
          <Stat label="Active classes" value={enrollment?.active_classes ?? 0}
            hint="Not counting archived" />
          <Stat label="School records — enrolled" value={enrollment?.by_status?.enrolled ?? 0}
            hint="Enrolled with this school as school of record" />
          <Stat label="School records — applicants" value={enrollment?.by_status?.applicant ?? 0}
            hint="Applied, not yet enrolled" />
        </div>
        {(withdrawn || graduated) ? (
          <p className="mt-2 text-xs text-neutral-500">
            School records also hold{' '}
            {withdrawn ? `${withdrawn} withdrawn` : ''}
            {withdrawn && graduated ? ' and ' : ''}
            {graduated ? `${graduated} graduated` : ''}
            {' '}({enrollment?.school_records ?? 0} in total). Those are past students, so they
            are not counted above.
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="font-semibold text-neutral-900 mb-3">Attendance</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Attendance rate" value={pct(attendance?.overall?.attendance_rate)} />
          <Stat label="Present" value={attendance?.overall?.counts?.present ?? 0} />
          <Stat label="Absent" value={attendance?.overall?.counts?.absent ?? 0} />
          <Stat label="Sessions" value={attendance?.overall?.total ?? 0} />
        </div>
      </section>

      {seesMoney && (
        <section>
          <h3 className="font-semibold text-neutral-900 mb-3">Revenue (recorded)</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Invoices" value={revenue?.invoice_count ?? 0} />
            <Stat label="Billed" value={money(revenue?.billed_cents)} />
            <Stat label="Collected" value={money(revenue?.collected_cents)} />
            <Stat label="Outstanding" value={money(revenue?.outstanding_cents)} />
          </div>
        </section>
      )}
    </div>
  )
}
