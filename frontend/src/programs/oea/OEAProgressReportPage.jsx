/**
 * OEA / Hearthwood quarterly progress report — the "coach report card".
 * Route: /opened-academy/student/:studentId/progress-report
 *
 * For a chosen quarter, lists each in-progress course with the parent-entered
 * quarter grade + summary, plus the per-course upload compliance (logs / artifacts
 * / summary against the minimums). Printable via the same window.print pattern as
 * the transcript so a student can hand a coach a quarter check-in.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { oeaAPI } from '../../services/api'

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #oea-report, #oea-report * { visibility: visible; }
  #oea-report { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
  @page { margin: 0.6in; size: letter; }
}`

const QUARTERS = [1, 2, 3, 4]

function ComplianceLine({ c }) {
  if (!c) return null
  const ok = c.is_compliant
  return (
    <span className={`text-xs ${ok ? 'text-green-700' : 'text-amber-700'}`}>
      Logs {c.logs}/{c.logs_required} · Artifacts {c.artifacts}/{c.artifacts_required} · Summary {c.summaries}/{c.summaries_required}
      {ok ? ' ✓' : ' — incomplete'}
    </span>
  )
}

export default function OEAProgressReportPage() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [term, setTerm] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await oeaAPI.progressReport(studentId, term)
      setData(res)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not load the report.')
    } finally {
      setLoading(false)
    }
  }, [studentId, term])

  useEffect(() => { load() }, [load])

  const orgName = data?.organization?.name || 'OpenEd Academy'
  const courses = data?.courses || []

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-poppins">
      <style>{PRINT_CSS}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <button type="button" onClick={() => navigate('/opened-academy')}
          className="text-sm text-optio-purple font-medium">Back</button>
        <button type="button" onClick={() => window.print()}
          className="min-h-[40px] px-5 rounded-lg text-white text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink">
          Print / Save PDF
        </button>
      </div>

      <div className="no-print flex gap-2 mb-6" role="group" aria-label="Quarter">
        {QUARTERS.map((q) => (
          <button key={q} type="button" onClick={() => setTerm(q)}
            className={`flex-1 py-2 rounded-lg border text-sm ${
              term === q ? 'bg-optio-purple border-optio-purple text-white font-semibold'
                : 'border-neutral-200 text-neutral-700'
            }`}>
            Q{q}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16" data-testid="report-loading">
          <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div id="oea-report" className="bg-white border border-neutral-200 rounded-2xl p-8"
          style={{ fontFamily: 'Georgia, serif' }}>
          <div className="border-b-2 border-neutral-800 pb-4">
            <h1 className="text-2xl font-bold text-neutral-900">{orgName}</h1>
            <p className="text-sm text-neutral-600">
              Quarterly Progress Report — Q{data?.term_index} ({data?.school_year})
            </p>
            <p className="text-sm mt-1"><span className="text-neutral-500">Student:</span> <strong>{data?.student?.name}</strong></p>
          </div>

          {courses.length === 0 ? (
            <p className="text-sm text-neutral-600 py-6">No in-progress courses for this quarter.</p>
          ) : (
            courses.map((c) => (
              <div key={c.credit_id} className="border-b border-neutral-100 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-900">{c.course_name}</span>
                  <span className="text-sm">
                    {c.quarter_grade ? `Grade: ${c.quarter_grade}` : 'No quarter grade yet'}
                  </span>
                </div>
                {c.quarter_summary && (
                  <p className="text-sm text-neutral-700 mt-1">{c.quarter_summary}</p>
                )}
                <div className="mt-1"><ComplianceLine c={c.compliance} /></div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
