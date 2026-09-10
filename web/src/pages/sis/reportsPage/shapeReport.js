/**
 * Extracted from sis/ReportsPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

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
      title: 'Checklist completion',
      summary: (report.rows || []).length
        ? `${(report.rows || []).length} people still have outstanding checklist items.`
        : 'Everyone has finished their checklists.',
      columns: ['Name', 'Email', 'Checklists', 'Done', 'Total', 'Outstanding', 'Still missing'],
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
  return {
    title: report.question?.label || questionLabel || 'Question report',
    columns: ['Student', 'Family', 'Parent', 'Parent email', 'Answer', 'Status'],
    rows: (report.rows || []).map((r) => [
      r.student, r.family, r.parent, r.parent_email, r.answer, r.status,
    ]),
  }
}

// The class report's column choice, remembered per browser like the Classes
// page export chooser. Field definitions come from the API with the report, so
// the picker can never list a column the CSV doesn't know how to write.

export default shapeReport
