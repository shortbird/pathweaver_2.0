import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../services/api';

const AdminReviewQueue = () => {
  const [pendingQuests, setPendingQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPendingQuests();
  }, []);

  const fetchPendingQuests = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/pending-quests`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setPendingQuests(data.quests || []);
      }
    } catch (error) {
      console.error('Error fetching pending quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (questId) => {
    setProcessing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/approve-quest/${questId}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        setPendingQuests(prev => prev.filter(q => q.id !== questId));
        setSelectedQuest(null);
      }
    } catch (error) {
      console.error('Error approving quest:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (questId) => {
    setProcessing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/reject-quest/${questId}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        setPendingQuests(prev => prev.filter(q => q.id !== questId));
        setSelectedQuest(null);
      }
    } catch (error) {
      console.error('Error rejecting quest:', error);
    } finally {
      setProcessing(false);
    }
  };

  const parseFeedback = (feedbackString) => {
    try {
      return JSON.parse(feedbackString);
    } catch {
      return { feedback: feedbackString, strengths: [], weaknesses: [] };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Quest Review Queue</h2>
      
      {pendingQuests.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500">No quests pending review</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quest List */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Pending Quests ({pendingQuests.length})</h3>
            {pendingQuests.map(quest => (
              <div
                key={quest.id}
                onClick={() => setSelectedQuest(quest)}
                className={`bg-white rounded-lg shadow-sm p-4 cursor-pointer transition-all hover:shadow-md ${
                  selectedQuest?.id === quest.id ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-gray-900">{quest.title}</h4>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                    Score: {quest.ai_grade_score || 0}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{quest.description || quest.big_idea}</p>
                <div className="mt-2 flex gap-2">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                    {quest.primary_pillar || quest.pillar || 'N/A'}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                    {quest.difficulty_level || quest.difficulty || 'N/A'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quest Details */}
          {selectedQuest && (
            <div className="bg-white rounded-xl shadow-sm p-6 h-fit sticky top-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">{selectedQuest.title}</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Description</label>
                  <p className="text-gray-600 mt-1">{selectedQuest.description || selectedQuest.big_idea}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Pillar</label>
                    <p className="text-gray-600">{selectedQuest.primary_pillar || selectedQuest.pillar || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Difficulty</label>
                    <p className="text-gray-600">{selectedQuest.difficulty_level || selectedQuest.difficulty || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">AI Grade</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Score:</span>
                      <span className="font-bold text-lg">{selectedQuest.ai_grade_score}/100</span>
                    </div>
                    {selectedQuest.ai_grade_feedback && (() => {
                      const feedback = parseFeedback(selectedQuest.ai_grade_feedback);
                      return (
                        <>
                          <p className="text-sm text-gray-600 mb-2">{feedback.feedback}</p>
                          {feedback.strengths?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-sm font-medium text-green-700">Strengths:</span>
                              <ul className="text-sm text-gray-600 ml-4 list-disc">
                                {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                          {feedback.weaknesses?.length > 0 && (
                            <div>
                              <span className="text-sm font-medium text-red-700">Concerns:</span>
                              <ul className="text-sm text-gray-600 ml-4 list-disc">
                                {feedback.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => handleApprove(selectedQuest.id)}
                    disabled={processing}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Approve Quest
                  </button>
                  <button
                    onClick={() => handleReject(selectedQuest.id)}
                    disabled={processing}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Reject Quest
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminReviewQueue;