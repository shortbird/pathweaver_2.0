import React, { useState } from 'react'
import IncidentReportModal from './IncidentReportModal'

/**
 * "Report an incident" -- the one button, wherever staff stand: the Tasks
 * page (every staff member, teachers included) and the teacher's home.
 * Ticket a26d9daf: the form used to live in the task manager, and a teacher
 * needs to find it without being told where.
 */
export default function ReportIncidentButton({ orgId, onFiled, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={!orgId}
        className={className || 'px-4 py-2 rounded-lg border border-optio-purple/40 text-optio-purple text-sm font-semibold hover:bg-optio-purple/5 disabled:opacity-50'}>
        Report an incident
      </button>
      <IncidentReportModal isOpen={open} orgId={orgId} onClose={() => setOpen(false)} onFiled={onFiled} />
    </>
  )
}
