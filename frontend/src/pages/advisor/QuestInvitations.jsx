import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import toast from 'react-hot-toast';

const QuestInvitations = () => {
  const { user } = useAuth();
  const [myQuests, setMyQuests] = useState([]);
  const [libraryQuests, setLibraryQuests] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [invitationMessage, setInvitationMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sentInvitations, setSentInvitations] = useState([]);
  const [activeTab, setActiveTab] = useState('my'); // 'my' or 'library'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [questsRes, studentsRes] = await Promise.all([
        api.get('/api/advisor/invitable-quests'),
        api.get('/api/advisor/students')
      ]);
      setMyQuests(questsRes.data.my_quests || []);
      setLibraryQuests(questsRes.data.library_quests || []);
      setStudents(studentsRes.data.students || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentToggle = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(s => s.id));
    }
  };

  // Get current quests based on active tab
  const currentQuests = activeTab === 'my' ? myQuests : libraryQuests;

  const handleSendInvitations = async () => {
    if (!selectedQuest) {
      toast.error('Please select a quest');
      return;
    }
    if (selectedStudents.length === 0) {
      toast.error('Please select at least one student');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/api/advisor/invite-to-quest', {
        quest_id: selectedQuest,
        user_ids: selectedStudents
      });

      const allQuests = [...myQuests, ...libraryQuests];
      const questTitle = allQuests.find(q => q.id === selectedQuest)?.title;
      toast.success(
        `Invited ${selectedStudents.length} student${selectedStudents.length > 1 ? 's' : ''} to "${questTitle}"`
      );

      // Record sent invitation
      setSentInvitations(prev => [
        {
          id: Date.now(),
          quest_title: questTitle,
          student_count: selectedStudents.length,
          sent_at: new Date()
        },
        ...prev
      ]);

      // Reset form
      setSelectedQuest(null);
      setSelectedStudents([]);
      setInvitationMessage('');
    } catch (error) {
      console.error('Error sending invitations:', error);
      toast.error(error.response?.data?.error || 'Failed to send invitations');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Invite Students to Quests
        </h1>
        <p className="text-gray-600">
          Select a quest and students to send invitations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quest Selection */}
          <Card>
            <CardHeader gradient>
              <CardTitle className="text-white">1. Select Quest</CardTitle>
            </CardHeader>
            <CardBody>
              {/* Tabs for My Quests vs Library */}
              <div className="flex border-b border-gray-200 mb-4">
                <button
                  onClick={() => { setActiveTab('my'); setSelectedQuest(null); }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'my'
                      ? 'border-optio-purple text-optio-purple'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  My Quests ({myQuests.length})
                </button>
                <button
                  onClick={() => { setActiveTab('library'); setSelectedQuest(null); }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'library'
                      ? 'border-optio-purple text-optio-purple'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Quest Library ({libraryQuests.length})
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {currentQuests.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {activeTab === 'my'
                      ? 'You haven\'t created any quests yet. Create a quest first to invite students.'
                      : 'No public quests available in the library.'}
                  </p>
                ) : (
                  currentQuests.map((quest) => (
                    <div
                      key={quest.id}
                      onClick={() => setSelectedQuest(quest.id)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedQuest === quest.id
                          ? 'border-optio-purple bg-gradient-to-r from-optio-purple/10 to-optio-pink/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 mb-1">
                            {quest.title}
                          </h3>
                          {(quest.description || quest.big_idea) && (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {quest.description || quest.big_idea}
                            </p>
                          )}
                          {activeTab === 'my' && !quest.is_active && (
                            <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                              Draft
                            </span>
                          )}
                        </div>
                        {selectedQuest === quest.id && (
                          <svg
                            className="w-6 h-6 text-optio-purple flex-shrink-0 ml-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          {/* Student Selection */}
          <Card>
            <CardHeader gradient>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white">2. Select Students</CardTitle>
                <button
                  onClick={handleSelectAll}
                  className="text-white text-sm underline hover:no-underline"
                >
                  {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {students.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No students in your advisory group
                  </p>
                ) : (
                  students.map((student) => (
                    <label
                      key={student.id}
                      className="flex items-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={() => handleStudentToggle(student.id)}
                        className="w-4 h-4 text-optio-purple focus:ring-optio-purple border-gray-300 rounded"
                      />
                      <span className="ml-3 text-gray-900 font-medium">
                        {student.display_name || student.first_name || 'Student'}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          {/* Optional Message */}
          <Card>
            <CardHeader gradient>
              <CardTitle className="text-white">3. Add Message (Optional)</CardTitle>
            </CardHeader>
            <CardBody>
              <textarea
                value={invitationMessage}
                onChange={(e) => setInvitationMessage(e.target.value)}
                placeholder="Add a personal message to encourage students..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                maxLength={500}
              />
              <p className="text-sm text-gray-500 mt-2">
                {invitationMessage.length}/500 characters
              </p>
            </CardBody>
          </Card>

          {/* Send Button */}
          <button
            onClick={handleSendInvitations}
            disabled={submitting || !selectedQuest || selectedStudents.length === 0}
            className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white py-4 rounded-lg font-bold text-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? 'Sending Invitations...'
              : `Send ${selectedStudents.length > 0 ? `to ${selectedStudents.length} student${selectedStudents.length > 1 ? 's' : ''}` : 'Invitations'}`}
          </button>
        </div>

        {/* Sidebar - Recent Invitations */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader gradient>
              <CardTitle className="text-white">Recent Invitations</CardTitle>
            </CardHeader>
            <CardBody>
              {sentInvitations.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  Invitations you send will appear here
                </p>
              ) : (
                <div className="space-y-3">
                  {sentInvitations.slice(0, 10).map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <p className="font-semibold text-sm text-gray-900 mb-1 line-clamp-1">
                        {inv.quest_title}
                      </p>
                      <p className="text-xs text-gray-600">
                        {inv.student_count} student{inv.student_count > 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(inv.sent_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QuestInvitations;
