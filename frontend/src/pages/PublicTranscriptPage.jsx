import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const CREDIT_REQUIREMENTS = {
  'Language Arts': 4.0, 'Mathematics': 3.0, 'Science': 3.0, 'Social Studies': 3.5,
  'Financial Literacy': 0.5, 'Health': 0.5, 'Physical Education': 2.0, 'Fine Arts': 1.5,
  'Career & Technical Education': 1.0, 'Digital Literacy': 0.5, 'Electives': 4.0
};

const SUBJECT_DISPLAY_NAMES = {
  'language_arts': 'Language Arts', 'math': 'Mathematics', 'science': 'Science',
  'social_studies': 'Social Studies', 'financial_literacy': 'Financial Literacy',
  'health': 'Health', 'pe': 'Physical Education', 'fine_arts': 'Fine Arts',
  'cte': 'Career & Technical Education', 'digital_literacy': 'Digital Literacy',
  'electives': 'Electives'
};

const PublicTranscriptPage = () => {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get(`/api/public/transcript/${userId}`);
        setData(response.data?.data || response.data);
      } catch (err) {
        setError(err.response?.status === 404 ? 'Transcript not found' : 'Failed to load transcript');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Transcript Not Available</h1>
          <p className="text-gray-600">{error || 'This transcript does not exist.'}</p>
        </div>
      </div>
    );
  }

  const { student, earned_credits, transfer_credits, planned_credits, overrides, totals } = data;
  const field = (key, fallback) => overrides?.[key] !== undefined && overrides[key] !== '' ? overrides[key] : fallback;
  const formatDate = (d) => {
    if (!d) return '';
    // Handle ISO dates
    const dateStr = d.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
    }
    return d;
  };

  // Build credit rows
  const rows = [];

  Object.entries(earned_credits || {}).forEach(([subject, info]) => {
    if (info.credits > 0) {
      const overrideKey = `earned_course_${subject}`;
      rows.push({
        subject: info.display_name,
        course: field(overrideKey, 'Optio Competency-Based'),
        source: 'Optio',
        credits: info.credits,
        status: 'Completed'
      });
    }
  });

  (transfer_credits || []).forEach(tc => {
    const courseNames = tc.course_names || {};
    Object.entries(tc.subjects || {}).forEach(([subject, info]) => {
      const courses = courseNames[subject];
      if (courses && courses.length > 0) {
        courses.forEach((course, idx) => {
          const overrideKey = `tc_course_${tc.id}_${subject}_${idx}`;
          rows.push({
            subject: info.display_name,
            course: field(overrideKey, course.name),
            source: tc.school_name || 'Transfer',
            credits: course.credits,
            status: 'Completed'
          });
        });
      } else {
        const overrideKey = `tc_course_${tc.id}_${subject}`;
        rows.push({
          subject: info.display_name,
          course: field(overrideKey, info.display_name),
          source: tc.school_name || 'Transfer',
          credits: info.credits,
          status: 'Completed'
        });
      }
    });
  });

  (planned_credits || []).forEach(pc => {
    rows.push({
      subject: SUBJECT_DISPLAY_NAMES[pc.school_subject] || pc.display_name || pc.school_subject,
      course: pc.course_name,
      source: pc.source || '',
      credits: pc.credits,
      status: pc.status === 'in_progress' ? 'In Progress' : pc.status === 'completed' ? 'Completed' : 'Dropped'
    });
  });

  rows.sort((a, b) => {
    if (a.status === 'Completed' && b.status !== 'Completed') return -1;
    if (a.status !== 'Completed' && b.status === 'Completed') return 1;
    return a.subject.localeCompare(b.subject);
  });

  const subjectTotals = {};
  rows.forEach(row => {
    if (row.status === 'Completed') {
      subjectTotals[row.subject] = (subjectTotals[row.subject] || 0) + row.credits;
    }
  });

  const studentName = field('student_name', `${student.last_name}, ${student.first_name}`);
  const dateIssued = field('date_issued', formatDate(new Date().toISOString().split('T')[0]));
  const dateOfBirth = field('date_of_birth', student.date_of_birth ? formatDate(student.date_of_birth) : '');
  const enrollmentDate = field('enrollment_date', formatDate(student.enrolled_date));
  const orgName = field('organization_name', student.organization_name || '');
  const footerText = field('footer_text', "This transcript is an official record of the student's academic achievements.");

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Transcript */}
      <div className="max-w-5xl mx-auto px-2 sm:px-6 pb-8">
        <div id="printable-transcript" className="bg-white shadow-sm" style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
          {/* Header */}
          <div className="border-b-4 border-double border-gray-900 px-4 sm:px-10 pt-6 sm:pt-10 pb-4 sm:pb-6">
            <div className="text-center">
              <img
                src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
                alt="Optio"
                className="h-8 sm:h-10 mx-auto"
              />
              {orgName && <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{orgName}</p>}
              <p className="text-[10px] sm:text-xs text-gray-500 mt-1 tracking-widest uppercase">
                Official Academic Transcript
              </p>
            </div>
          </div>

          {/* Student info */}
          <div className="border-b border-gray-300 px-4 sm:px-10 py-3 sm:py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-1 text-xs sm:text-sm">
              <div className="flex">
                <span className="w-28 sm:w-32 text-gray-500 flex-shrink-0">Student Name:</span>
                <span className="font-semibold text-gray-900">{studentName}</span>
              </div>
              <div className="flex">
                <span className="w-28 sm:w-32 text-gray-500 flex-shrink-0">Date Issued:</span>
                <span className="text-gray-900">{dateIssued}</span>
              </div>
              {dateOfBirth && (
                <div className="flex">
                  <span className="w-28 sm:w-32 text-gray-500 flex-shrink-0">Date of Birth:</span>
                  <span className="text-gray-900">{dateOfBirth}</span>
                </div>
              )}
              <div className="flex">
                <span className="w-28 sm:w-32 text-gray-500 flex-shrink-0">Enrollment Date:</span>
                <span className="text-gray-900">{enrollmentDate}</span>
              </div>
            </div>
          </div>

          {/* Credit summary */}
          <div className="border-b border-gray-300 px-4 sm:px-10 py-3 sm:py-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs sm:text-sm">
              <div>
                <span className="text-gray-500">Completed: </span>
                <span className="font-bold text-gray-900">{totals.total_completed.toFixed(1)}</span>
              </div>
              {totals.planned_credits > 0 && (
                <div>
                  <span className="text-gray-500">In Progress: </span>
                  <span className="font-bold text-gray-900">{totals.planned_credits.toFixed(1)}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Total: </span>
                <span className="font-bold text-gray-900">
                  {(totals.total_completed + totals.planned_credits).toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Credit table - desktop */}
          <div className="hidden sm:block px-4 sm:px-10 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left py-2 font-semibold text-gray-900">Subject Area</th>
                  <th className="text-left py-2 font-semibold text-gray-900">Course</th>
                  <th className="text-left py-2 font-semibold text-gray-900">Source</th>
                  <th className="text-center py-2 font-semibold text-gray-900">Credits</th>
                  <th className="text-center py-2 font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-200 ${row.status === 'Dropped' ? 'text-gray-400 line-through' : ''}`}
                  >
                    <td className="py-2 text-gray-900">{row.subject}</td>
                    <td className="py-2 text-gray-700">{row.course}</td>
                    <td className="py-2 text-gray-700">{row.source}</td>
                    <td className="py-2 text-center font-medium text-gray-900">{row.credits.toFixed(2)}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        row.status === 'Completed' ? 'bg-green-100 text-green-800 print:bg-transparent print:text-gray-900'
                        : row.status === 'In Progress' ? 'bg-amber-100 text-amber-800 print:bg-transparent print:text-gray-600 print:italic'
                        : 'bg-gray-100 text-gray-500'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Credit cards - mobile */}
          <div className="sm:hidden px-4 py-4 space-y-3">
            {rows.map((row, i) => (
              <div
                key={i}
                className={`border border-gray-200 rounded-lg p-3 ${row.status === 'Dropped' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">{row.subject}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ml-2 ${
                    row.status === 'Completed' ? 'bg-green-100 text-green-800'
                    : row.status === 'In Progress' ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {row.status}
                  </span>
                </div>
                <p className="text-xs text-gray-700">{row.course}</p>
                {row.source && <p className="text-xs text-gray-500">{row.source}</p>}
                <p className="text-xs font-bold text-gray-900 mt-1">{row.credits.toFixed(2)} credits</p>
              </div>
            ))}
          </div>

          {/* Subject summary */}
          {Object.keys(subjectTotals).length > 0 && (
            <div className="border-t border-gray-300 px-4 sm:px-10 py-4">
              <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                Completed Credits by Subject
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1 text-xs sm:text-sm">
                {Object.entries(subjectTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([subject, credits]) => {
                    const required = CREDIT_REQUIREMENTS[subject];
                    return (
                      <div key={subject} className="flex justify-between">
                        <span className="text-gray-700">{subject}</span>
                        <span className="font-semibold text-gray-900">
                          {credits.toFixed(1)}{required != null && ` / ${required.toFixed(1)}`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t-4 border-double border-gray-900 px-4 sm:px-10 py-4 sm:py-6 mt-4">
            <div className="flex flex-col sm:flex-row justify-between gap-2 text-[10px] sm:text-xs text-gray-500">
              <div>
                <p>{footerText}</p>
                <p className="mt-1">Optio -- www.optioeducation.com</p>
              </div>
              <div className="sm:text-right">
                <p>Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p className="mt-1">Page 1 of 1</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print button */}
      <div className="no-print max-w-5xl mx-auto px-2 sm:px-6 pb-8 flex justify-center">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Transcript
        </button>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #printable-transcript, #printable-transcript * { visibility: visible; }
          #printable-transcript { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
          .min-h-screen { min-height: auto !important; }
          #main-content { min-height: auto !important; padding: 0 !important; margin: 0 !important; }
          html, body { height: auto !important; overflow: visible !important; }
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
          @page { margin: 0.75in; size: letter; }
        }
      `}</style>
    </div>
  );
};

export default PublicTranscriptPage;
