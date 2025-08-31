import React, { useState, useEffect } from 'react';
import axios from 'axios';

const QuestSubmissionsManager = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedQuest, setEditedQuest] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');

  useEffect(() => {
    fetchSubmissions();
  }, [statusFilter]);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/v3/admin/submissions?status=${statusFilter}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      setSubmissions(response.data.submissions || []);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Failed to load quest submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmission = (submission) => {
    setSelectedSubmission(submission);
    setEditedQuest({
      title: submission.title,
      description: submission.description,
      pillar: submission.pillar || 'creativity',
      xp_value: submission.suggested_xp || 100,
      tasks: submission.suggested_tasks || []
    });
    setEditMode(true);
  };

  const handleApprove = async () => {
    if (!selectedSubmission || !editedQuest) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/v3/admin/submissions/${selectedSubmission.id}/approve`,
        editedQuest,
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        alert('Quest approved and created successfully!');
        setEditMode(false);
        setSelectedSubmission(null);
        fetchSubmissions();
      }
    } catch (err) {
      console.error('Error approving submission:', err);
      alert('Failed to approve quest');
    }
  };

  const handleReject = async (submissionId, reason) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/v3/admin/submissions/${submissionId}/reject`,
        { reason: reason || 'Does not meet requirements' },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        alert('Quest submission rejected');
        fetchSubmissions();
      }
    } catch (err) {
      console.error('Error rejecting submission:', err);
      alert('Failed to reject submission');
    }
  };

  const handleTaskChange = (index, field, value) => {
    const newTasks = [...(editedQuest.tasks || [])];
    if (!newTasks[index]) {
      newTasks[index] = { title: '', description: '' };
    }
    newTasks[index][field] = value;
    setEditedQuest({ ...editedQuest, tasks: newTasks });
  };

  const addTask = () => {
    setEditedQuest({
      ...editedQuest,
      tasks: [...(editedQuest.tasks || []), { title: '', description: '' }]
    });
  };

  const removeTask = (index) => {
    const newTasks = editedQuest.tasks.filter((_, i) => i !== index);
    setEditedQuest({ ...editedQuest, tasks: newTasks });
  };

  if (loading) {
    return <div className="p-4">Loading submissions...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Quest Submissions</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
          No {statusFilter !== 'all' ? statusFilter : ''} submissions found
        </div>
      ) : (
        <div className="grid gap-4">
          {submissions.map(submission => (
            <div key={submission.id} className="bg-white border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{submission.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Submitted by: {submission.users?.username || 'Unknown'} | 
                    {new Date(submission.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  submission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  submission.status === 'approved' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {submission.status}
                </span>
              </div>

              <p className="text-gray-700 mb-4">{submission.description}</p>

              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <span className="font-medium">Skill Pillar:</span> {submission.pillar || 'Not specified'}
                </div>
                <div>
                  <span className="font-medium">Suggested XP:</span> {submission.suggested_xp || 'Not specified'}
                </div>
                <div>
                  <span className="font-medium">Make Public:</span> {submission.make_public ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="font-medium">Tasks:</span> {submission.suggested_tasks?.length || 0} suggested
                </div>
              </div>

              {submission.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditSubmission(submission)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Review & Edit
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Rejection reason (optional):');
                      if (reason !== null) {
                        handleReject(submission.id, reason);
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              )}

              {submission.status === 'rejected' && submission.rejection_reason && (
                <div className="mt-2 p-3 bg-red-50 rounded text-red-700 text-sm">
                  <strong>Rejection reason:</strong> {submission.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editMode && selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full m-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-4">Review & Edit Quest Submission</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Quest Title</label>
                <input
                  type="text"
                  value={editedQuest.title}
                  onChange={(e) => setEditedQuest({ ...editedQuest, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={editedQuest.description}
                  onChange={(e) => setEditedQuest({ ...editedQuest, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Skill Pillar</label>
                  <select
                    value={editedQuest.pillar}
                    onChange={(e) => setEditedQuest({ ...editedQuest, pillar: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="creativity">Creativity</option>
                    <option value="critical_thinking">Critical Thinking</option>
                    <option value="practical_skills">Practical Skills</option>
                    <option value="communication">Communication</option>
                    <option value="cultural_literacy">Cultural Literacy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">XP Value</label>
                  <input
                    type="number"
                    value={editedQuest.xp_value}
                    onChange={(e) => setEditedQuest({ ...editedQuest, xp_value: parseInt(e.target.value) })}
                    min="50"
                    step="50"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Quest Tasks</label>
                {editedQuest.tasks?.map((task, index) => (
                  <div key={index} className="mb-3 p-3 border rounded">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium">Task {index + 1}</span>
                      <button
                        onClick={() => removeTask(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={task.title || ''}
                      onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                      placeholder="Task title"
                      className="w-full px-3 py-2 mb-2 border rounded"
                    />
                    <textarea
                      value={task.description || ''}
                      onChange={(e) => handleTaskChange(index, 'description', e.target.value)}
                      placeholder="Task description"
                      rows={2}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                ))}
                <button
                  onClick={addTask}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  + Add Task
                </button>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> This quest will be {selectedSubmission.make_public ? 'publicly available' : 'assigned only to the submitter'}.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setEditMode(false);
                    setSelectedSubmission(null);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Approve & Create Quest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestSubmissionsManager;