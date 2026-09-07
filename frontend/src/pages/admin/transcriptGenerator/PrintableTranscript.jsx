// The transcript itself: the document that prints and becomes the PDF a
// registrar receives. Everything above it in the page is chrome that carries a
// no-print class; this is the part that must survive the print stylesheet.
import React from 'react';
import api from '../../../services/api';
import TranscriptSignatureBlock from '../../../components/transcript/TranscriptSignatureBlock';
import {
  WASC_LOGO_SRC, WASC_LOGO_ALT, COMMISSION_NAME, COMMISSION_ADDRESS, COMMISSION_WEBSITE,
} from '../../../constants/accreditation';
import { EditableField, DatePickerField } from './EditableFields';
import { SUBJECT_OPTIONS } from './subjectOptions';

const PrintableTranscript = ({
  accreditation, creditRows, dateIssued, dateOfBirth, handleDeletePlannedCredit,
  isWascAccredited, orgName, overrides, saveOverrides, setOverrides,
  startEdit, startSplit, student, studentName, transferCredits, updateOverride, userId,
}) => (
  <div className="max-w-5xl mx-auto px-6 py-8">
    <div id="printable-transcript" className="bg-white shadow-sm" style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
      {/* Transcript header */}
      <div className="border-b-4 border-double border-gray-900 px-10 pt-10 pb-6">
        <div className="text-center">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
            alt="Optio"
            className="h-10 mx-auto"
          />
          {orgName && (
            <p className="text-sm text-gray-600 mt-0.5">
              <EditableField value={orgName} onChange={v => updateOverride('organization_name', v)} />
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1 tracking-widest uppercase">
            Official Academic Transcript
          </p>
        </div>
      </div>

      {/* Student info */}
      <div className="border-b border-gray-300 px-10 py-4">
        <div className="grid grid-cols-2 gap-x-12 gap-y-1 text-sm">
          <div className="flex">
            <span className="w-32 text-gray-500 flex-shrink-0">Student Name:</span>
            <EditableField
              value={studentName}
              onChange={v => updateOverride('student_name', v)}
              className="font-semibold text-gray-900"
            />
          </div>
          <div className="flex">
            <span className="w-32 text-gray-500 flex-shrink-0">Date of Birth:</span>
            <DatePickerField
              value={dateOfBirth}
              rawDate={overrides.date_of_birth_raw || student.date_of_birth || ''}
              onChange={(display, raw) => {
                setOverrides(prev => {
                  const updated = { ...prev, date_of_birth: display, date_of_birth_raw: raw };
                  saveOverrides(updated);
                  if (raw && !student?.date_of_birth) {
                    api.put(`/api/admin/users/${userId}`, { date_of_birth: raw }).catch(() => {});
                  }
                  return updated;
                });
              }}
              className="text-gray-900"
            />
          </div>
        </div>
      </div>

      {/* Credit table */}
      <div className="px-10 py-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-2 font-semibold text-gray-900">Subject Area</th>
              <th className="text-left py-2 font-semibold text-gray-900">Course</th>
              <th className="text-left py-2 font-semibold text-gray-900 no-print">Source</th>
              <th className="text-center py-2 font-semibold text-gray-900">Credits</th>
              <th className="text-center py-2 font-semibold text-gray-900">Grade</th>
              <th className="text-center py-2 font-semibold text-gray-900 no-print w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creditRows.map((row, i) => (
              <tr
                key={`${row.type}-${row.subject}-${i}`}
                className={`border-b border-gray-200 ${row.status === 'In Progress' ? 'bg-amber-50 print:bg-transparent' : ''} ${row.status === 'Dropped' ? 'text-gray-400 line-through' : ''}`}
              >
                <td className="py-2 text-gray-900">{row.subject}</td>
                <td className="py-2 text-gray-700">
                  {row.courseOverrideKey ? (
                    <EditableField
                      value={row.course}
                      onChange={v => updateOverride(row.courseOverrideKey, v)}
                    />
                  ) : row.course}
                </td>
                <td className="py-2 text-gray-700 no-print">
                  {row.source}
                  {row.transcriptUrl && (
                    <a
                      href={row.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 text-emerald-600 hover:text-emerald-700 no-print"
                      title="View transcript"
                    >
                      <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </td>
                <td className="py-2 text-center font-medium text-gray-900">{row.credits.toFixed(2)}</td>
                <td className="py-2 text-center">
                  {row.status === 'Completed' ? (
                    <span className="font-bold text-gray-900">A</span>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      row.status === 'In Progress'
                        ? 'bg-amber-100 text-amber-800 print:bg-transparent print:text-gray-600 print:italic'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {row.status}
                    </span>
                  )}
                </td>
                <td className="py-2 text-center no-print">
                  {row.type === 'planned' && (
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => startEdit({
                          id: row.id,
                          school_subject: SUBJECT_OPTIONS.find(o => o.label === row.subject)?.value || '',
                          course_name: row.course,
                          credits: row.credits,
                          source: row.source,
                          notes: '',
                          status: row.status === 'In Progress' ? 'in_progress' : row.status.toLowerCase()
                        })}
                        className="text-gray-400 hover:text-gray-600"
                        title="Edit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeletePlannedCredit(row.id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {row.type === 'transfer' && !row.hasCourseBreakdown && row.totalSubjectCredits && (
                    <button
                      onClick={() => startSplit(row)}
                      className="text-gray-400 hover:text-emerald-600"
                      title="Break into individual courses"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                    </button>
                  )}
                  {row.type === 'transfer' && row.hasCourseBreakdown && (
                    <button
                      onClick={() => {
                        const tc = (transferCredits || []).find(t => t.id === row.transferCreditId);
                        const subjectInfo = tc?.subjects?.[row.subjectKey];
                        startSplit({
                          ...row,
                          totalSubjectCredits: subjectInfo?.credits || 0
                        });
                      }}
                      className="text-emerald-500 hover:text-emerald-700"
                      title="Edit course breakdown"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {creditRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                  No credits recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Certification */}
      <TranscriptSignatureBlock show={accreditation?.source === 'optio'} issuedDate={dateIssued} />

      {/* Footer */}
      <div className="border-t-4 border-double border-gray-900 px-10 py-6 mt-4">
        <div className="flex justify-between gap-3 text-xs text-gray-500">
          <div>
            {isWascAccredited && (
              <div>
                <p>{COMMISSION_NAME}</p>
                <p>{COMMISSION_ADDRESS} · {COMMISSION_WEBSITE}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {isWascAccredited && (
              <img
                src={WASC_LOGO_SRC}
                alt={WASC_LOGO_ALT}
                className="h-12 w-auto"
                style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
              />
            )}
            <p>Page 1 of 1</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default PrintableTranscript;
