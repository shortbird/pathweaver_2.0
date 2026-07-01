/**
 * OEA / Hearthwood transcript — printable academic transcript for one student.
 * Route: /opened-academy/student/:studentId/transcript
 *
 * Renders OEA-branded transcript data from GET /api/oea/students/:id/transcript:
 * student info, pathway, every credit with its grade + credit value, GPA
 * (unweighted + weighted), and the "Accepted transfer credit from previous school"
 * notation on earned-elsewhere credits (transfer credits look native, no note).
 *
 * Printing reuses the platform pattern (window.print + an @media print rule that
 * hides the app shell and shows only the printable region), so no server-side PDF
 * library is needed — the parent prints or "Save as PDF" from the browser dialog.
 */
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { oeaAPI } from '../../services/api'

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #oea-transcript, #oea-transcript * { visibility: visible; }
  #oea-transcript { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
  @page { margin: 0.6in; size: letter; }
}`

export default function OEATranscriptPage() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    oeaAPI
      .transcript(studentId)
      .then(({ data: res }) => { if (active) setData(res) })
      .catch((err) => toast.error(err.response?.data?.error || 'Could not load transcript.'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [studentId])

  if (loading) {
    return (
      <div className="flex justify-center py-16" data-testid="transcript-loading">
        <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data?.pathway) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-neutral-600">
          No diploma pathway has been chosen yet, so there is no transcript to show.
        </p>
        <button type="button" onClick={() => navigate('/opened-academy')}
          className="mt-4 text-sm text-optio-purple font-medium">Back</button>
      </div>
    )
  }

  const { student, organization, pathway, credits, gpa, progress, school_year } = data
  const orgName = organization?.name || 'OpenEd Academy'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-poppins">
      <style>{PRINT_CSS}</style>

      <div className="no-print flex items-center justify-between mb-6">
        <button type="button" onClick={() => navigate('/opened-academy')}
          className="text-sm text-optio-purple font-medium">Back</button>
        <button type="button" onClick={() => window.print()}
          className="min-h-[40px] px-5 rounded-lg text-white text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink">
          Print / Save PDF
        </button>
      </div>

      <div id="oea-transcript" className="bg-white border border-neutral-200 rounded-2xl p-8"
        style={{ fontFamily: 'Georgia, serif' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{orgName}</h1>
            <p className="text-sm text-neutral-600">Official Academic Transcript</p>
          </div>
          {organization?.logo_url && (
            <img src={organization.logo_url} alt={orgName} className="h-14 object-contain" />
          )}
        </div>

        {/* Student */}
        <div className="grid grid-cols-2 gap-2 text-sm mt-4">
          <div><span className="text-neutral-500">Student:</span> <strong>{student?.name}</strong></div>
          <div><span className="text-neutral-500">Pathway:</span> {pathway.name}</div>
          {student?.date_of_birth && (
            <div><span className="text-neutral-500">Date of birth:</span> {student.date_of_birth}</div>
          )}
          <div><span className="text-neutral-500">School year:</span> {school_year}</div>
        </div>

        {/* Credits table */}
        <table className="w-full text-sm mt-6 border-collapse">
          <thead>
            <tr className="border-b border-neutral-400 text-left">
              <th className="py-2 pr-2">Course</th>
              <th className="py-2 pr-2">Subject area</th>
              <th className="py-2 pr-2 text-center">Credits</th>
              <th className="py-2 pr-2 text-center">Grade</th>
            </tr>
          </thead>
          <tbody>
            {credits.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 align-top">
                <td className="py-2 pr-2">
                  {c.course_name}
                  {c.is_weighted && <span className="text-amber-600"> (Honors/AP/IB)</span>}
                  {c.note && (
                    <span className="block text-xs italic text-neutral-500">{c.note}</span>
                  )}
                </td>
                <td className="py-2 pr-2">{c.requirement_label}</td>
                <td className="py-2 pr-2 text-center">{c.credits}</td>
                <td className="py-2 pr-2 text-center">
                  {c.status === 'complete' ? (c.letter_grade || '—') : 'In progress'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        <div className="flex justify-between mt-6 text-sm border-t-2 border-neutral-800 pt-4">
          <div>
            <div>Credits earned: <strong>{progress?.total_earned ?? 0}</strong> of {progress?.total_required ?? 24}</div>
          </div>
          <div className="text-right">
            <div>Unweighted GPA: <strong>{gpa?.unweighted ?? '—'}</strong></div>
            <div>Weighted GPA: <strong>{gpa?.weighted ?? '—'}</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}
