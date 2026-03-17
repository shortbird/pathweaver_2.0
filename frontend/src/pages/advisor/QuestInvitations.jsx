import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  CheckCircleIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import QuestForm from '../../components/admin/QuestForm';

const QuestInvitations = () => {
  const { user } = useAuth();
  const [myQuests, setMyQuests] = useState([]);
  const [libraryQuests, setLibraryQuests] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('my');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [questsRes, studentsRes] = await Promise.allSettled([
        api.get('/api/advisor/invitable-quests'),
        api.get('/api/advisor/students'),
      ]);

      if (questsRes.status === 'fulfilled') {
        setMyQuests(questsRes.value.data.my_quests || []);
        setLibraryQuests(questsRes.value.data.library_quests || []);
      }
      if (studentsRes.status === 'fulfilled') {
        setStudents(studentsRes.value.data.students || []);
      }

      const failed = [questsRes, studentsRes].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('Some data failed to load:', failed.map(f => f.reason));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleQuestCreated = (newQuest) => {
    if (newQuest?.id) {
      setMyQuests(prev => [newQuest, ...prev]);
      setSelectedQuest(newQuest.id);
    } else {
      // Refetch to pick up the new quest
      fetchData();
    }
    setShowCreateForm(false);
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

  const currentQuests = activeTab === 'my' ? myQuests : libraryQuests;

  const filteredQuests = currentQuests.filter(q => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (q.title || '').toLowerCase().includes(term) ||
      (q.description || q.big_idea || '').toLowerCase().includes(term);
  });

  const handleSend = async () => {
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
      const response = await api.post('/api/advisor/invite-to-quest', {
        quest_id: selectedQuest,
        user_ids: selectedStudents
      });
      const { enrolled, skipped, quest_title } = response.data;

      if (enrolled > 0) {
        toast.success(
          `Added ${enrolled} student${enrolled > 1 ? 's' : ''} to "${quest_title}"${skipped > 0 ? ` (${skipped} already had it)` : ''}`
        );
      } else if (skipped > 0) {
        toast(`All selected students already have "${quest_title}"`);
      }

      setSelectedQuest(null);
      setSelectedStudents([]);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.error || 'Failed to assign quest');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedQuestTitle = [...myQuests, ...libraryQuests].find(q => q.id === selectedQuest)?.title;
  const canSend = !!selectedQuest && selectedStudents.length > 0;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Assign Quests to Students
        </h1>
        <p className="text-gray-500 mt-1">
          Select a quest and students to add it directly to their library.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Panel: Quest Selection (3/5) */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {[
                { id: 'my', label: 'My Quests', count: myQuests.length },
                { id: 'library', label: 'Library', count: libraryQuests.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedQuest(null);
                    setSearchTerm('');
                    setShowCreateForm(false);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-optio-purple text-optio-purple'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <BookOpenIcon className="w-4 h-4" />
                  {tab.label}
                  <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id ? 'bg-optio-purple/10 text-optio-purple' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Search */}
              <input
                type="text"
                placeholder="Search quests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent mb-3"
              />

              {/* Create New Quest (My Quests tab only) */}
              {activeTab === 'my' && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full mb-3 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border-2 border-dashed border-optio-purple/30 text-optio-purple rounded-lg hover:bg-optio-purple/5 hover:border-optio-purple/50 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Create New Quest
                </button>
              )}

              {/* Quest List */}
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {filteredQuests.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-400 text-sm">
                      {currentQuests.length === 0
                        ? (activeTab === 'my' ? 'No quests yet.' : 'No library quests available.')
                        : 'No quests match your search.'}
                    </p>
                    {activeTab === 'my' && currentQuests.length === 0 && (
                      <button
                        onClick={() => setShowCreateForm(true)}
                        className="mt-1 text-optio-purple hover:underline text-sm"
                      >
                        Create your first quest
                      </button>
                    )}
                  </div>
                ) : (
                  filteredQuests.map((quest) => (
                    <button
                      key={quest.id}
                      onClick={() => setSelectedQuest(quest.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedQuest === quest.id
                          ? 'border-optio-purple bg-optio-purple/5 ring-1 ring-optio-purple'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {selectedQuest === quest.id ? (
                          <CheckCircleSolidIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                        ) : (
                          <CheckCircleIcon className="w-5 h-5 text-gray-300 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{quest.title}</p>
                          {(quest.description || quest.big_idea) && (
                            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                              {quest.description || quest.big_idea}
                            </p>
                          )}
                        </div>
                        {activeTab === 'my' && !quest.is_active && (
                          <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded flex-shrink-0">
                            Draft
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Students + Send (2/5) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                Students
                {students.length > 0 && (
                  <span className="ml-1.5 text-gray-400 font-normal">
                    {selectedStudents.length}/{students.length}
                  </span>
                )}
              </h2>
              {students.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-optio-purple hover:underline"
                >
                  {selectedStudents.length === students.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {/* Student List */}
            <div className="max-h-[400px] overflow-y-auto">
              {students.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8 px-4">
                  No students in your advisory group
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {students.map((student) => {
                    const isSelected = selectedStudents.includes(student.id);
                    return (
                      <label
                        key={student.id}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          isSelected ? 'bg-optio-purple/5' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleStudentToggle(student.id)}
                          className="w-4 h-4 text-optio-purple focus:ring-optio-purple border-gray-300 rounded"
                        />
                        <span className={`text-sm ${isSelected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                          {`${student.first_name || ''} ${student.last_name || ''}`.trim() || student.display_name || 'Student'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Send summary + button */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {canSend && (
              <p className="text-xs text-gray-500 mb-3">
                Assigning{' '}
                <span className="font-medium text-gray-700">{selectedQuestTitle}</span>
                {' '}to{' '}
                <span className="font-medium text-gray-700">
                  {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''}
                </span>
              </p>
            )}
            <button
              onClick={handleSend}
              disabled={submitting || !canSend}
              className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white py-3 rounded-lg font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {submitting ? 'Assigning...' : 'Assign Quest'}
            </button>
          </div>
        </div>
      </div>

      {/* Quest Creation Modal */}
      {showCreateForm && (
        <QuestForm
          mode="create"
          onClose={() => setShowCreateForm(false)}
          onSuccess={handleQuestCreated}
          organizationId={user?.organization_id || null}
        />
      )}
    </div>
  );
};

export default QuestInvitations;
