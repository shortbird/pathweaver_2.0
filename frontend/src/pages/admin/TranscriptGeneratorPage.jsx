import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

const SUBJECT_OPTIONS = [
  { value: 'language_arts', label: 'Language Arts' },
  { value: 'math', label: 'Mathematics' },
  { value: 'science', label: 'Science' },
  { value: 'social_studies', label: 'Social Studies' },
  { value: 'financial_literacy', label: 'Financial Literacy' },
  { value: 'health', label: 'Health' },
  { value: 'pe', label: 'Physical Education' },
  { value: 'fine_arts', label: 'Fine Arts' },
  { value: 'cte', label: 'Career & Technical Education' },
  { value: 'digital_literacy', label: 'Digital Literacy' },
  { value: 'electives', label: 'Electives' }
];

const TranscriptGeneratorPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Planned credit form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCredit, setEditingCredit] = useState(null);
  const [formData, setFormData] = useState({
    school_subject: '',
    course_name: '',
    credits: '1.0',
    source: '',
    notes: '',
    status: 'in_progress'
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/transcript/${userId}`);
      setData(response.data?.data || response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load transcript data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setFormData({ school_subject: '', course_name: '', credits: '1.0', source: '', notes: '', status: 'in_progress' });
    setEditingCredit(null);
    setShowAddForm(false);
  };

  const handleSavePlannedCredit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingCredit) {
        await api.put(`/api/admin/transcript/${userId}/planned-credits/${editingCredit}`, formData);
        toast.success('Credit updated');
      } else {
        await api.post(`/api/admin/transcript/${userId}/planned-credits`, formData);
        toast.success('Credit added');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlannedCredit = async (creditId) => {
    if (!window.confirm('Delete this planned credit?')) return;
    try {
      await api.delete(`/api/admin/transcript/${userId}/planned-credits/${creditId}`);
      toast.success('Deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const startEdit = (pc) => {
    setFormData({
      school_subject: pc.school_subject,
      course_name: pc.course_name,
      credits: String(pc.credits),
      source: pc.source || '',
      notes: pc.notes || '',
      status: pc.status
    });
    setEditingCredit(pc.id);
    setShowAddForm(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  const { student, earned_credits, transfer_credits, planned_credits, totals } = data;

  // Build rows for the transcript table
  const buildCreditRows = () => {
    const rows = [];

    // Earned credits from Optio
    Object.entries(earned_credits || {}).forEach(([subject, info]) => {
      if (info.credits > 0) {
        rows.push({
          type: 'earned',
          subject: info.display_name,
          course: 'Optio Education',
          credits: info.credits,
          status: 'Completed',
          source: 'Optio'
        });
      }
    });

    // Transfer credits
    (transfer_credits || []).forEach(tc => {
      Object.entries(tc.subjects || {}).forEach(([subject, info]) => {
        rows.push({
          type: 'transfer',
          subject: info.display_name,
          course: tc.school_name || 'Transfer',
          credits: info.credits,
          status: 'Completed',
          source: tc.school_name,
          transcriptUrl: tc.transcript_url
        });
      });
    });

    // Planned credits
    (planned_credits || []).forEach(pc => {
      rows.push({
        type: 'planned',
        subject: pc.display_name,
        course: pc.course_name,
        credits: pc.credits,
        status: pc.status === 'in_progress' ? 'In Progress' : pc.status === 'completed' ? 'Completed' : 'Dropped',
        source: pc.source || '',
        id: pc.id
      });
    });

    // Sort: completed first, then by subject
    rows.sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return -1;
      if (a.status !== 'Completed' && b.status === 'Completed') return 1;
      return a.subject.localeCompare(b.subject);
    });

    return rows;
  };

  const creditRows = buildCreditRows();
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  // Aggregate credits by subject for the summary
  const subjectTotals = {};
  creditRows.forEach(row => {
    if (row.status === 'Completed') {
      subjectTotals[row.subject] = (subjectTotals[row.subject] || 0) + row.credits;
    }
  });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Admin toolbar - no-print */}
      <div className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              Transcript: {student.first_name} {student.last_name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Planned Credit
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Planned credit form - no-print */}
      {showAddForm && (
        <div className="no-print max-w-5xl mx-auto px-6 pt-4">
          <form onSubmit={handleSavePlannedCredit} className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">
              {editingCredit ? 'Edit Planned Credit' : 'Add Planned Credit'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject Area</label>
                <select
                  value={formData.school_subject}
                  onChange={e => setFormData(f => ({ ...f, school_subject: e.target.value }))}
                  required
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Select...</option>
                  {SUBJECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Course Name</label>
                <input
                  type="text"
                  value={formData.course_name}
                  onChange={e => setFormData(f => ({ ...f, course_name: e.target.value }))}
                  required
                  placeholder="e.g. Spanish 1"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Credits</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="10"
                  value={formData.credits}
                  onChange={e => setFormData(f => ({ ...f, credits: e.target.value }))}
                  required
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source/Institution</label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={e => setFormData(f => ({ ...f, source: e.target.value }))}
                  placeholder="e.g. BYU Independent Study"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingCredit ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Printable transcript */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-white shadow-sm print:shadow-none" style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
          {/* Transcript header */}
          <div className="border-b-4 border-double border-gray-900 px-10 pt-10 pb-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wide text-gray-900 uppercase">
                Optio Education
              </h1>
              {student.organization_name && (
                <p className="text-sm text-gray-600 mt-0.5">{student.organization_name}</p>
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
                <span className="w-32 text-gray-500">Student Name:</span>
                <span className="font-semibold text-gray-900">
                  {student.last_name}, {student.first_name}
                </span>
              </div>
              <div className="flex">
                <span className="w-32 text-gray-500">Date Issued:</span>
                <span className="text-gray-900">{formatDate(new Date().toISOString())}</span>
              </div>
              {student.date_of_birth && (
                <div className="flex">
                  <span className="w-32 text-gray-500">Date of Birth:</span>
                  <span className="text-gray-900">{formatDate(student.date_of_birth)}</span>
                </div>
              )}
              <div className="flex">
                <span className="w-32 text-gray-500">Enrollment Date:</span>
                <span className="text-gray-900">{formatDate(student.enrolled_date)}</span>
              </div>
            </div>
          </div>

          {/* Credit summary */}
          <div className="border-b border-gray-300 px-10 py-4">
            <div className="flex justify-between text-sm">
              <div>
                <span className="text-gray-500">Credits Completed: </span>
                <span className="font-bold text-gray-900">{totals.total_completed.toFixed(1)}</span>
              </div>
              {totals.planned_credits > 0 && (
                <div>
                  <span className="text-gray-500">Credits In Progress: </span>
                  <span className="font-bold text-gray-900">{totals.planned_credits.toFixed(1)}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Total (incl. planned): </span>
                <span className="font-bold text-gray-900">
                  {(totals.total_completed + totals.planned_credits).toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Credit table */}
          <div className="px-10 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left py-2 font-semibold text-gray-900">Subject Area</th>
                  <th className="text-left py-2 font-semibold text-gray-900">Course / Source</th>
                  <th className="text-center py-2 font-semibold text-gray-900">Credits</th>
                  <th className="text-center py-2 font-semibold text-gray-900">Status</th>
                  <th className="text-center py-2 font-semibold text-gray-900 no-print w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creditRows.map((row, i) => (
                  <tr
                    key={`${row.type}-${row.subject}-${row.course}-${i}`}
                    className={`border-b border-gray-200 ${row.status === 'In Progress' ? 'bg-amber-50 print:bg-transparent' : ''} ${row.status === 'Dropped' ? 'text-gray-400 line-through' : ''}`}
                  >
                    <td className="py-2 text-gray-900">{row.subject}</td>
                    <td className="py-2 text-gray-700">
                      {row.course}
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
                      {row.type === 'transfer' && (
                        <span className="ml-1.5 text-xs text-gray-400 italic">(Transfer)</span>
                      )}
                    </td>
                    <td className="py-2 text-center font-medium text-gray-900">{row.credits.toFixed(2)}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        row.status === 'Completed'
                          ? 'bg-green-100 text-green-800 print:bg-transparent print:text-gray-900'
                          : row.status === 'In Progress'
                          ? 'bg-amber-100 text-amber-800 print:bg-transparent print:text-gray-600 print:italic'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {row.status}
                      </span>
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
                    </td>
                  </tr>
                ))}
                {creditRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                      No credits recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Subject summary */}
          {Object.keys(subjectTotals).length > 0 && (
            <div className="border-t border-gray-300 px-10 py-4">
              <h3 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">
                Completed Credits by Subject
              </h3>
              <div className="grid grid-cols-3 gap-x-8 gap-y-1 text-sm">
                {Object.entries(subjectTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([subject, credits]) => (
                    <div key={subject} className="flex justify-between">
                      <span className="text-gray-700">{subject}</span>
                      <span className="font-semibold text-gray-900">{credits.toFixed(1)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t-4 border-double border-gray-900 px-10 py-6 mt-4">
            <div className="flex justify-between text-xs text-gray-500">
              <div>
                <p>This transcript is an official record of the student's academic achievements.</p>
                <p className="mt-1">Optio Education -- www.optioeducation.com</p>
              </div>
              <div className="text-right">
                <p>Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p className="mt-1">Page 1 of 1</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .min-h-screen { min-height: auto; }
          .bg-gray-100 { background: white !important; }
          .shadow-sm { box-shadow: none !important; }
          .max-w-5xl { max-width: 100%; padding: 0; }
          @page { margin: 0.75in; size: letter; }
        }
      `}</style>
    </div>
  );
};

export default TranscriptGeneratorPage;
