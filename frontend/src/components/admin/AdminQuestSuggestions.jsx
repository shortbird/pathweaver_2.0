import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import UnifiedQuestForm from './UnifiedQuestForm';

const AdminQuestSuggestions = () => {
  const [questIdeas, setQuestIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [processing, setProcessing] = useState(false);
  const [questCreationModal, setQuestCreationModal] = useState(null);
  const [showQuestForm, setShowQuestForm] = useState(false);
  const [selectedIdeaForQuest, setSelectedIdeaForQuest] = useState(null);

  useEffect(() => {
    fetchQuestIdeas();
  }, [statusFilter, currentPage]);

  const fetchQuestIdeas = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/v3/admin/quest-ideas?status=${statusFilter}&page=${currentPage}&per_page=10`);
      setQuestIdeas(response.data.quest_ideas || []);
      setTotalPages(response.data.total_pages || 1);
    } catch (error) {
      console.error('Error fetching quest ideas:', error);
      toast.error('Failed to load quest suggestions');
      setQuestIdeas([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (ideaId) => {
    setProcessing(true);
    try {
      await api.put(`/api/v3/admin/quest-ideas/${ideaId}/approve`, {
        feedback: feedback
      });
      toast.success('Quest suggestion approved!');
      setFeedbackModal(null);
      setFeedback('');
      fetchQuestIdeas();
    } catch (error) {
      console.error('Error approving quest idea:', error);
      toast.error('Failed to approve quest suggestion');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (ideaId) => {
    setProcessing(true);
    try {
      await api.put(`/api/v3/admin/quest-ideas/${ideaId}/reject`, {
        feedback: feedback
      });
      toast.success('Quest suggestion rejected');
      setFeedbackModal(null);
      setFeedback('');
      fetchQuestIdeas();
    } catch (error) {
      console.error('Error rejecting quest idea:', error);
      toast.error('Failed to reject quest suggestion');
    } finally {
      setProcessing(false);
    }
  };

  const openFeedbackModal = (idea, action) => {
    setFeedbackModal({ idea, action });
    setFeedback('');
  };

  const closeFeedbackModal = () => {
    setFeedbackModal(null);
    setFeedback('');
  };

  const handleGenerateQuestAI = async (ideaId) => {
    setProcessing(true);
    try {
      const response = await api.post(`/api/v3/admin/quest-ideas/${ideaId}/generate-quest`);
      toast.success('Quest generated successfully using AI!');
      setQuestCreationModal(null);
      fetchQuestIdeas();
    } catch (error) {
      console.error('Error generating quest with AI:', error);
      toast.error(error.response?.data?.error || 'Failed to generate quest using AI');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateQuestManual = async (ideaId) => {
    setProcessing(true);
    try {
      const response = await api.post(`/api/v3/admin/quest-ideas/${ideaId}/create-quest-manual`);
      toast.success('Basic quest structure created! Please edit it to add proper tasks and details.');
      setQuestCreationModal(null);
      fetchQuestIdeas();

      // Optionally redirect to quest edit page
      if (response.data.redirect_to_edit && response.data.quest) {
        // You could add navigation here if needed
        // navigate(`/admin/quests/edit/${response.data.quest.id}`);
      }
    } catch (error) {
      console.error('Error creating manual quest:', error);
      toast.error(error.response?.data?.error || 'Failed to create quest manually');
    } finally {
      setProcessing(false);
    }
  };

  const openQuestCreationModal = (idea) => {
    setQuestCreationModal(idea);
  };

  const closeQuestCreationModal = () => {
    setQuestCreationModal(null);
  };

  const handleCreateQuestFromIdea = (idea) => {
    setSelectedIdeaForQuest(idea);
    setShowQuestForm(true);
  };

  const handleQuestFormClose = () => {
    setShowQuestForm(false);
    setSelectedIdeaForQuest(null);
  };

  const handleQuestFormSuccess = async (newQuest) => {
    // Mark the quest idea as having an associated quest
    try {
      await api.put(`/api/v3/admin/quest-ideas/${selectedIdeaForQuest.id}/approve`, {
        feedback: `Quest created: ${newQuest.title}`
      });

      // Update the quest idea to link it to the created quest
      // This could be done in the backend, but for now we'll just refresh the list
      fetchQuestIdeas();

      setShowQuestForm(false);
      setSelectedIdeaForQuest(null);
      toast.success('Quest created successfully from suggestion!');
    } catch (error) {
      console.error('Error updating quest idea status:', error);
      toast.error('Quest created but failed to update suggestion status');
    }
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return statusStyles[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6d469b]"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Quest Suggestions</h2>
        
        {/* Status Filter */}
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status);
                setCurrentPage(1);
              }}
              className={`px-3 py-2 rounded-lg font-medium capitalize ${
                statusFilter === status
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {questIdeas.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No quest suggestions found</h3>
          <p className="text-gray-600">
            {statusFilter === 'pending' 
              ? 'No pending quest suggestions to review'
              : `No ${statusFilter} quest suggestions found`
            }
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {questIdeas.map((idea) => (
              <div key={idea.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{idea.title}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(idea.status)}`}>
                        {idea.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-3">{idea.description}</p>
                    <div className="text-sm text-gray-500">
                      <p>
                        Submitted by: <span className="font-medium">
                          {idea.users?.first_name} {idea.users?.last_name} (@{idea.users?.username})
                        </span>
                      </p>
                      <p>Date: {formatDate(idea.created_at)}</p>
                      {idea.reviewed_at && (
                        <p>Reviewed: {formatDate(idea.reviewed_at)}</p>
                      )}
                      {idea.admin_feedback && (
                        <div className="mt-2 p-2 bg-gray-50 rounded">
                          <p className="text-xs font-medium text-gray-700">Admin Feedback:</p>
                          <p className="text-sm text-gray-600">{idea.admin_feedback}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {idea.status === 'pending' && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleCreateQuestFromIdea(idea)}
                        className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 font-medium"
                      >
                        Create This Quest
                      </button>
                      <button
                        onClick={() => openFeedbackModal(idea, 'reject')}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {idea.status === 'approved' && !idea.approved_quest_id && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => openQuestCreationModal(idea)}
                        className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 font-medium"
                      >
                        Create Quest
                      </button>
                    </div>
                  )}

                  {idea.status === 'approved' && idea.approved_quest_id && (
                    <div className="flex gap-2 ml-4">
                      <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium">
                        ✅ Quest Created
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Feedback Modal */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">
              {feedbackModal.action === 'approve' ? 'Approve' : 'Reject'} Quest Suggestion
            </h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Quest: "{feedbackModal.idea.title}"</p>
              <p className="text-sm text-gray-600">
                By: {feedbackModal.idea.users?.first_name} {feedbackModal.idea.users?.last_name}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin Feedback (Optional)
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  feedbackModal.action === 'approve' 
                    ? "Add any notes about the approval..."
                    : "Explain why this suggestion is being rejected..."
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                rows="3"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeFeedbackModal}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={() => feedbackModal.action === 'approve' 
                  ? handleApprove(feedbackModal.idea.id)
                  : handleReject(feedbackModal.idea.id)
                }
                className={`px-4 py-2 text-white rounded-lg font-medium flex items-center gap-2 ${
                  feedbackModal.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={processing}
              >
                {processing && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                )}
                {feedbackModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Quest Form */}
      {showQuestForm && selectedIdeaForQuest && (
        <UnifiedQuestForm
          mode="create"
          quest={{
            title: selectedIdeaForQuest.title,
            big_idea: selectedIdeaForQuest.description,
            source: 'custom',
            // Pre-fill with one task based on the suggestion
            quest_tasks: [{
              title: `Complete ${selectedIdeaForQuest.title}`,
              description: selectedIdeaForQuest.description,
              pillar: 'critical_thinking', // Default pillar
              xp_amount: 100, // Default XP
              order_index: 0,
              is_required: true
            }]
          }}
          onClose={handleQuestFormClose}
          onSuccess={handleQuestFormSuccess}
        />
      )}

      {/* Quest Creation Modal */}
      {questCreationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create Quest from Idea</h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Quest: "{questCreationModal.title}"</p>
              <p className="text-sm text-gray-600 mb-4">
                By: {questCreationModal.users?.first_name} {questCreationModal.users?.last_name}
              </p>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                {questCreationModal.description}
              </p>
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Choose creation method:</p>
              <div className="space-y-3">
                <button
                  onClick={() => handleGenerateQuestAI(questCreationModal.id)}
                  disabled={processing}
                  className="w-full px-4 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 font-medium flex flex-col items-center gap-1"
                >
                  <div className="flex items-center gap-2">
                    {processing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    🤖 Generate with AI
                  </div>
                  <span className="text-xs opacity-90">(Creates complete quest with tasks)</span>
                </button>

                <button
                  onClick={() => handleCreateQuestManual(questCreationModal.id)}
                  disabled={processing}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex flex-col items-center gap-1"
                >
                  <div className="flex items-center gap-2">
                    {processing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    ✏️ Create Manual Template
                  </div>
                  <span className="text-xs opacity-90">(Creates basic structure for manual editing)</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeQuestCreationModal}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={processing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminQuestSuggestions;