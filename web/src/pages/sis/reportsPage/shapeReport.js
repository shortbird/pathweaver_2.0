/**
 * Extracted from sis/ReportsPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import { ANSWER_COLUMNS, answerRowCells } from './answerFilterRules'

const shapeReport = (type, data, questionLabel) => {
  const report = data?.report || {}
  if (type === 'medications') {
    return {
      title: 'Medications',
      columns: ['Student', 'Medications', 'Schedule / Notes', 'Parent', 'Parent phone', 'Emergency contact 1'],
      rows: (report.rows || []).map((r) => [
        r.student, r.medications, r.notes, r.parent, r.parent_phone, r.emergency_contact,
      ]),
    }
  }
  if (type === 'payments') {
    const totals = report.totals || []
    return {
      title: 'Payments',
      // The split by method is the question; the rows are the working.
      summary: totals.length
        ? totals.map((t) => `${t.method}: ${t.amount} (${t.count})`).join(' · ')
        : 'No payments recorded yet.',
      columns: ['Date', 'Family', 'Student', 'Invoice', 'Method', 'Amount', 'Reference', 'Note', 'Recorded by'],
      rows: (report.rows || []).map((r) => [
        r.recorded_at, r.family, r.student, r.invoice, r.method, r.amount,
        r.reference, r.note, r.recorded_by,
      ]),
    }
  }
  if (type === 'allergies') {
    return {
      title: 'Allergies',
      columns: ['Student', 'Allergies', 'Notes', 'Parent', 'Parent phone', 'Emergency contact 1'],
      rows: (report.rows || []).map((r) => [
        r.student, r.allergies, r.notes, r.parent, r.parent_phone, r.emergency_contact,
      ]),
    }
  }
  if (type === 'checklist-completion') {
    // The chase list. Email is a column because the point of it is to contact
    // these people (iCreate 42c4acde).
    return {
      title: 'Task completion',
      summary: (report.rows || []).length
        ? `${(report.rows || []).length} people still have outstanding checklist items.`
        : 'Everyone has finished their tasks.',
      columns: ['Name', 'Email', 'Tasks', 'Done', 'Total', 'Outstanding', 'Still missing'],
      rows: (report.rows || []).map((r) => [
        r.name, r.email || '', (r.checklists || []).join('; '),
        r.done_count, r.total_count, r.outstanding_count, (r.missing || []).join('; '),
      ]),
    }
  }
  if (type === 'daily-attendance') {
    return {
      title: `Daily attendance${report.date ? ` — ${report.date}` : ''}`,
      columns: ['Student', 'Class', 'Status', 'Excused?', 'Reason'],
      rows: (report.rows || []).map((r) => [r.student, r.class, r.status, r.excused, r.reason]),
    }
  }
  if (type === 'roll-call') {
    // One row per class per day (P7). The same columns as the CSV the backend
    // writes (sis_class_session_service.HISTORY_CSV_HEADER).
    const yesNo = (v) => (v == null ? '' : v ? 'Yes' : 'No')
    const rows = report.rows || []
    const toCheck = rows.filter((r) => r.sub_status === 'flagged').length
    return {
      title: `Who took roll${report.from ? ` — ${report.from}${report.to && report.to !== report.from ? ` to ${report.to}` : ''}` : ''}`,
      summary: rows.length
        ? `${rows.length} class day${rows.length === 1 ? "" : "s"}${toCheck ? `, ${toCheck} still to check` : ''}.`
        : 'No roll was taken in these days.',
      columns: ['Date', 'Class', 'Assigned teacher', 'Roll taken by', 'Taken at',
        'Assigned teacher took roll?', 'Substitute', 'Status', 'Planned by', 'Decided by', 'Note'],
      rows: rows.map((r) => [
        r.date, r.class_name, r.teacher_name, r.taken_by_name || '', r.taken_at_local || '',
        yesNo(r.taker_is_teacher), r.substitute_name || '', r.status_label || '',
        r.planned_by_name || '', r.confirmed_by_name || '', r.sub_note || '',
      ]),
    }
  }
  if (type === 'student-schedule') {
    const days = report.days || []
    const unscheduled = report.has_unscheduled
    return {
      title: 'Student schedule',
      columns: ['Student', 'Age', 'Family', 'Days', ...days.map((d) => d.label),
        ...(unscheduled ? ['Unscheduled classes'] : [])],
      rows: (report.rows || []).map((r) => [
        r.student, r.age ?? '', r.family, r.days,
        ...days.map((d) => r.by_day?.[d.key] ?? ''),
        ...(unscheduled ? [r.unscheduled] : []),
      ]),
    }
  }
  if (type === 'emergency-contacts') {
    // Flat, and in the order somebody reads it in a hurry: who the child is,
    // then who to call, then what we still do not have. The counts of guardian
    // and emergency-contact columns come from the API so this and the CSV can
    // never disagree about how many fit (iCreate, 2026-09-05, 41c838c5).
    const guardians = report.max_guardians || 2
    const emergency = report.max_emergency || 2
    const nth = (list, i, key) => (list || [])[i]?.[key] ?? ''
    const seq = (n) => Array.from({ length: n }, (_, i) => i)
    return {
      title: 'Emergency contacts',
      summary: report.incomplete
        ? `${report.incomplete} student${report.incomplete === 1 ? '' : 's'} still missing contact information.`
        : 'Every student has a guardian and an emergency contact on file.',
      columns: [
        'Student', 'Age', 'Family',
        ...seq(guardians).flatMap((i) => [`Guardian ${i + 1}`, `Guardian ${i + 1} phone`]),
        ...seq(emergency).flatMap((i) => [`Emergency contact ${i + 1}`, `Emergency contact ${i + 1} phone`]),
        'Missing',
      ],
      rows: (report.rows || []).map((r) => [
        r.student, r.age ?? '', r.family,
        ...seq(guardians).flatMap((i) => [nth(r.guardians, i, 'name'), nth(r.guardians, i, 'phone')]),
        ...seq(emergency).flatMap((i) => [
          nth(r.emergency_contacts, i, 'name'), nth(r.emergency_contacts, i, 'phone')]),
        r.missing,
      ]),
    }
  }
  if (type === 'media-release') {
    const questions = report.questions || []
    return {
      title: 'Media release',
      columns: ['Student', 'Family', ...questions.map((q) => q.label), 'Parent'],
      rows: (report.rows || []).map((r) => [
        r.student, r.family, ...questions.map((q) => r.answers?.[q.key] ?? ''), r.parent,
      ]),
    }
  }
  // Registration answers: the rows keep their raw objects too, so the page can
  // filter them by city, payment, age and days (ticket 50616794) without a
  // refetch -- see answerFilterRules.js.
  return {
    title: report.question?.label || questionLabel || 'Question report',
    kind: 'question',
    columns: ANSWER_COLUMNS,
    rows: (report.rows || []).map(answerRowCells),
    raw: report.rows || [],
  }
}

// The class report's column choice, remembered per browser like the Classes
// page export chooser. Field definitions come from the API with the report, so
// the picker can never list a column the CSV doesn't know how to write.

export default shapeReport
