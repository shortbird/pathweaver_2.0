import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

const SUBJECT_DISPLAY_NAMES = {
  'language_arts': 'Language Arts',
  'math': 'Mathematics',
  'science': 'Science',
  'social_studies': 'Social Studies',
  'financial_literacy': 'Financial Literacy',
  'health': 'Health',
  'pe': 'Physical Education',
  'fine_arts': 'Fine Arts',
  'cte': 'Career & Technical Education',
  'digital_literacy': 'Digital Literacy',
  'electives': 'Electives'
};

const TranscriptSection = ({ studentId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!studentId) return;

    const check = async () => {
      try {
        const res = await api.get(`/api/admin/transcript/${studentId}/exists`);
        const doesExist = res.data?.data?.exists || res.data?.exists;
        setExists(doesExist);
        if (doesExist) {
          const response = await api.get(`/api/admin/transcript/${studentId}`);
          setData(response.data?.data || response.data);
        }
      } catch {
        setExists(false);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [studentId]);

  if (loading || !exists || !data) return null;

  const { student, earned_credits, transfer_credits, planned_credits, overrides, totals } = data;
  const field = (key, fallback) => overrides?.[key] !== undefined && overrides[key] !== '' ? overrides[key] : fallback;
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

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
      subject: SUBJECT_DISPLAY_NAMES[pc.school_subject] || pc.school_subject,
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

  const studentName = field('student_name', `${student.last_name}, ${student.first_name}`);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {/* Mini header */}
      <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
            alt="Optio"
            className="h-6"
          />
          <span className="text-xs text-gray-500 tracking-widest uppercase">Official Transcript</span>
        </div>
        <div className="text-xs text-gray-500">
          {studentName}
        </div>
      </div>

      {/* Credit summary bar */}
      <div className="px-6 py-2 border-b border-gray-100 flex gap-6 text-xs text-gray-600">
        <span>Completed: <strong className="text-gray-900">{totals.total_completed.toFixed(1)}</strong></span>
        {totals.planned_credits > 0 && (
          <span>In Progress: <strong className="text-gray-900">{totals.planned_credits.toFixed(1)}</strong></span>
        )}
      </div>

      {/* Credit table */}
      <div className="px-6 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-1.5 font-semibold text-gray-700">Subject</th>
              <th className="text-left py-1.5 font-semibold text-gray-700">Course</th>
              <th className="text-left py-1.5 font-semibold text-gray-700">Source</th>
              <th className="text-center py-1.5 font-semibold text-gray-700">Credits</th>
              <th className="text-center py-1.5 font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-gray-100 ${row.status === 'Dropped' ? 'text-gray-400 line-through' : ''}`}
              >
                <td className="py-1.5 text-gray-900">{row.subject}</td>
                <td className="py-1.5 text-gray-700">{row.course}</td>
                <td className="py-1.5 text-gray-700">{row.source}</td>
                <td className="py-1.5 text-center font-medium text-gray-900">{row.credits.toFixed(2)}</td>
                <td className="py-1.5 text-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    row.status === 'Completed' ? 'bg-green-100 text-green-800'
                    : row.status === 'In Progress' ? 'bg-amber-100 text-amber-800'
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

      {/* Link to full transcript */}
      <div className="px-6 py-2 border-t border-gray-100 bg-gray-50 flex justify-end">
        <Link
          to={`/admin/user/${studentId}/transcript`}
          className="text-xs text-optio-purple hover:text-purple-700 font-medium flex items-center gap-1"
        >
          View Full Transcript
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default TranscriptSection;
