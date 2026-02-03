import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { transferCreditsAPI } from '../../services/api';
import Button from '../../components/ui/Button';

// Subject display names matching the school_subject enum
const SUBJECT_NAMES = {
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

// Subject colors for visual distinction
const SUBJECT_COLORS = {
  'language_arts': 'bg-blue-100 border-blue-300',
  'math': 'bg-green-100 border-green-300',
  'science': 'bg-purple-100 border-purple-300',
  'social_studies': 'bg-amber-100 border-amber-300',
  'financial_literacy': 'bg-emerald-100 border-emerald-300',
  'health': 'bg-rose-100 border-rose-300',
  'pe': 'bg-cyan-100 border-cyan-300',
  'fine_arts': 'bg-pink-100 border-pink-300',
  'cte': 'bg-slate-100 border-slate-300',
  'digital_literacy': 'bg-indigo-100 border-indigo-300',
  'electives': 'bg-gray-100 border-gray-300'
};

const XP_PER_CREDIT = 2000;
const MAX_TRANSCRIPT_SIZE = 25 * 1024 * 1024; // 25MB

const TransferCreditForm = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  // List of all transfer credit records
  const [transferCreditsList, setTransferCreditsList] = useState([]);

  // Currently editing record (null = new record)
  const [editingId, setEditingId] = useState(null);

  // Form state
  const [schoolName, setSchoolName] = useState('');
  const [notes, setNotes] = useState('');
  const [subjectCredits, setSubjectCredits] = useState({});
  const [transcriptUrl, setTranscriptUrl] = useState('');

  // UI state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Calculate totals for current form
  const calculateTotals = useCallback(() => {
    let totalCredits = 0;
    let totalXP = 0;

    Object.values(subjectCredits).forEach(credits => {
      const numCredits = parseFloat(credits) || 0;
      totalCredits += numCredits;
      totalXP += numCredits * XP_PER_CREDIT;
    });

    return { totalCredits, totalXP };
  }, [subjectCredits]);

  // Calculate grand totals across all records
  const calculateGrandTotals = useCallback(() => {
    let grandTotalCredits = 0;
    let grandTotalXP = 0;

    transferCreditsList.forEach(tc => {
      grandTotalCredits += tc.total_credits || 0;
      grandTotalXP += tc.total_xp || 0;
    });

    return { grandTotalCredits, grandTotalXP };
  }, [transferCreditsList]);

  // Fetch existing transfer credits on mount
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await transferCreditsAPI.get(userId);
      // API returns { success: true, data: { transfer_credits, user } }
      const data = response.data?.data || response.data;

      setUser(data.user);
      setTransferCreditsList(data.transfer_credits || []);
    } catch (err) {
      console.error('Error fetching transfer credits:', err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load transfer credits');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset form to new record
  const resetForm = () => {
    setEditingId(null);
    setSchoolName('');
    setNotes('');
    setSubjectCredits({});
    setTranscriptUrl('');
  };

  // Load a record into the form for editing
  const loadRecordForEditing = (tc) => {
    setEditingId(tc.id);
    setSchoolName(tc.school_name || '');
    setNotes(tc.notes || '');
    setTranscriptUrl(tc.transcript_url || '');

    // Convert subject_xp to subject_credits for form
    const credits = {};
    if (tc.subject_xp) {
      Object.entries(tc.subject_xp).forEach(([subject, xp]) => {
        // Use toFixed(2) to preserve quarter credits (0.25, 0.50, 0.75)
        const creditValue = xp / XP_PER_CREDIT;
        credits[subject] = creditValue % 1 === 0 ? creditValue.toString() : creditValue.toFixed(2);
      });
    }
    setSubjectCredits(credits);
  };

  // Handle subject credit change
  const handleCreditChange = (subject, value) => {
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setSubjectCredits(prev => ({
        ...prev,
        [subject]: value
      }));
    }
  };

  // Adjust credit by step (0.25)
  const adjustCredit = (subject, delta) => {
    const current = parseFloat(subjectCredits[subject]) || 0;
    const newValue = Math.max(0, Math.min(10, current + delta));
    // Round to avoid floating point issues
    const rounded = Math.round(newValue * 4) / 4;
    setSubjectCredits(prev => ({
      ...prev,
      [subject]: rounded > 0 ? rounded.toString() : ''
    }));
  };

  // Handle transcript file selection and auto-upload
  const handleFileSelect = async (file) => {
    if (!file) return;

    if (file.size > MAX_TRANSCRIPT_SIZE) {
      setError('File size must be less than 25MB');
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF and image files (JPEG, PNG, GIF, WEBP) are allowed');
      return;
    }

    // Auto-upload immediately after validation
    try {
      setUploading(true);
      setError('');

      const response = await transferCreditsAPI.uploadTranscript(userId, file, editingId);
      const data = response.data?.data || response.data;
      setTranscriptUrl(data.transcript_url);
      setSuccessMessage('Transcript uploaded successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error uploading transcript:', err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to upload transcript');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Save transfer credits
  const handleSave = async () => {
    if (!schoolName.trim()) {
      setError('School name is required');
      return;
    }

    const hasCredits = Object.values(subjectCredits).some(c => parseFloat(c) > 0);
    if (!hasCredits) {
      setError('At least one subject must have credits entered');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const creditsForApi = {};
      Object.entries(subjectCredits).forEach(([subject, credits]) => {
        const numCredits = parseFloat(credits);
        if (numCredits > 0) {
          creditsForApi[subject] = numCredits;
        }
      });

      await transferCreditsAPI.save(userId, {
        id: editingId, // Include ID if editing existing record
        subject_credits: creditsForApi,
        school_name: schoolName.trim(),
        notes: notes.trim() || null,
        transcript_url: transcriptUrl || null
      });

      setSuccessMessage(editingId ? 'Transfer credits updated successfully' : 'Transfer credits added successfully');
      setTimeout(() => setSuccessMessage(''), 3000);

      // Refresh the list and reset form
      await fetchData();
      resetForm();
    } catch (err) {
      console.error('Error saving transfer credits:', err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save transfer credits');
    } finally {
      setSaving(false);
    }
  };

  // Delete a specific transfer credit
  const handleDeleteOne = async (tc) => {
    if (!window.confirm(`Are you sure you want to delete transfer credits from "${tc.school_name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setSaving(true);
      setError('');

      await transferCreditsAPI.deleteOne(userId, tc.id);

      setSuccessMessage('Transfer credits deleted successfully');
      setTimeout(() => setSuccessMessage(''), 3000);

      // Refresh the list
      await fetchData();

      // If we were editing this record, reset the form
      if (editingId === tc.id) {
        resetForm();
      }
    } catch (err) {
      console.error('Error deleting transfer credits:', err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to delete transfer credits');
    } finally {
      setSaving(false);
    }
  };

  const { totalCredits, totalXP } = calculateTotals();
  const { grandTotalCredits, grandTotalXP } = calculateGrandTotals();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-600 hover:text-gray-900 flex items-center mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>

          <h1 className="text-3xl font-bold text-gray-900">Transfer Credits</h1>
          {user && (
            <p className="text-gray-600 mt-2">
              For: {user.first_name} {user.last_name}
              {user.email && <span className="text-gray-400 ml-2">({user.email})</span>}
            </p>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* Existing Transfer Credits List */}
        {transferCreditsList.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Source Institutions ({transferCreditsList.length})
              </h2>
              <div className="text-right">
                <div className="text-sm text-gray-600">Total across all sources</div>
                <div className="text-lg font-bold text-optio-purple">
                  {grandTotalCredits.toFixed(2)} credits ({grandTotalXP.toLocaleString()} XP)
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {transferCreditsList.map((tc) => (
                <div
                  key={tc.id}
                  className={`bg-white rounded-lg shadow-sm border-2 p-4 transition-colors ${
                    editingId === tc.id ? 'border-optio-purple' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{tc.school_name}</h3>
                      <p className="text-sm text-gray-600">
                        {tc.total_credits?.toFixed(2)} credits ({tc.total_xp?.toLocaleString()} XP)
                      </p>
                      {tc.transcript_url && (
                        <a
                          href={tc.transcript_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-optio-purple hover:underline"
                        >
                          View Transcript
                        </a>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => loadRecordForEditing(tc)}
                        className="p-2 text-gray-500 hover:text-optio-purple hover:bg-purple-50 rounded"
                        title="Edit"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteOne(tc)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingId ? 'Edit Transfer Credits' : 'Add New Source Institution'}
            </h2>
            {editingId && (
              <button
                onClick={resetForm}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* School Info */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Source Institution</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      School Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="e.g., Lincoln High School"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Subject Credits Grid */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Subject Credits</h3>
                <p className="text-sm text-gray-600 mb-4">
                  1 credit = {XP_PER_CREDIT.toLocaleString()} XP
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(SUBJECT_NAMES).map(([key, name]) => (
                    <div
                      key={key}
                      className={`p-3 rounded-lg border-2 ${SUBJECT_COLORS[key]}`}
                    >
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        {name}
                      </label>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => adjustCredit(key, -0.25)}
                          className="w-7 h-7 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600 font-bold"
                          title="Decrease by 0.25"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={subjectCredits[key] || ''}
                          onChange={(e) => handleCreditChange(key, e.target.value)}
                          placeholder="0"
                          className="w-14 px-1 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => adjustCredit(key, 0.25)}
                          className="w-7 h-7 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600 font-bold"
                          title="Increase by 0.25"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <span className="text-xs text-gray-600 ml-1">credits</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transcript Upload */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Transcript (optional)</h3>
                {transcriptUrl ? (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <a href={transcriptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple hover:underline">
                        View Transcript
                      </a>
                    </div>
                    <button onClick={() => setTranscriptUrl('')} className="text-gray-400 hover:text-red-500">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : uploading ? (
                  <div className="border-2 border-dashed border-optio-purple rounded-lg p-6 text-center bg-purple-50">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-optio-purple"></div>
                      <span className="text-sm text-optio-purple">Uploading transcript...</span>
                    </div>
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-optio-purple transition-colors"
                  >
                    <p className="text-sm text-gray-600">
                      Drag and drop or{' '}
                      <label className="text-optio-purple hover:underline cursor-pointer">
                        browse
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={(e) => handleFileSelect(e.target.files[0])} />
                      </label>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">PDF or images up to 25MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Summary */}
            <div className="lg:col-span-1">
              <div className="bg-gray-50 rounded-lg p-4 sticky top-8">
                <h3 className="font-semibold text-gray-900 mb-3">This Entry</h3>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Credits</span>
                    <span className="font-bold">{totalCredits.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">XP</span>
                    <span className="font-semibold text-optio-purple">{totalXP.toLocaleString()}</span>
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saving || !schoolName.trim()}
                  className="w-full"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Credits' : 'Add Credits'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransferCreditForm;
