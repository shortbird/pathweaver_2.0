import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeftIcon, UserGroupIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon, CheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

export default function CollaborationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [quests, setQuests] = useState([]);
  const [existingGroups, setExistingGroups] = useState([]);
  const [organizationId, setOrganizationId] = useState(null);

  // Form state
  const [groupName, setGroupName] = useState('');
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [questSearchTerm, setQuestSearchTerm] = useState('');

  // View state
  const [activeTab, setActiveTab] = useState('create');
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    fetchUserOrg();
  }, [user]);

  const fetchUserOrg = async () => {
    try {
      const res = await api.get('/api/auth/me');
      const orgId = res.data?.organization_id;
      if (orgId) {
        setOrganizationId(orgId);
        fetchData(orgId);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching user org:', error);
      setLoading(false);
    }
  };

  const fetchData = async (orgId) => {
    setLoading(true);
    try {
      const [studentsRes, questsRes, groupsRes] = await Promise.all([
        api.get('/api/advisor/students'),
        api.get('/api/quests'),
        api.get('/api/collaborations')
      ]);

      setStudents(studentsRes.data.students || []);
      setQuests(questsRes.data.quests || questsRes.data.data || []);
      setExistingGroups(groupsRes.data.collaborations || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setStudents([]);
      setQuests([]);
      setExistingGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentToggle = (student) => {
    setSelectedStudents(prev => {
      const isSelected = prev.some(s => s.id === student.id);
      if (isSelected) {
        return prev.filter(s => s.id !== student.id);
      } else {
        return [...prev, student];
      }
    });
  };

  const handleRemoveStudent = (studentId) => {
    setSelectedStudents(prev => prev.filter(s => s.id !== studentId));
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    if (!selectedQuest) {
      toast.error('Please select a quest');
      return;
    }
    if (selectedStudents.length < 2) {
      toast.error('Please select at least 2 students');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/collaborations', {
        name: groupName.trim(),
        quest_id: selectedQuest.id,
        member_ids: selectedStudents.map(s => s.id),
        organization_id: organizationId
      });

      toast.success('Collaboration group created');
      setGroupName('');
      setSelectedQuest(null);
      setSelectedStudents([]);
      fetchData(organizationId);
      setActiveTab('manage');
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error(error.response?.data?.error || 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this collaboration group?')) {
      return;
    }

    try {
      await api.delete(`/api/collaborations/${groupId}`);
      toast.success('Collaboration group deleted');
      fetchData(organizationId);
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

  const filteredStudents = students.filter(s =>
    (s.display_name || s.email || '').toLowerCase().includes(studentSearchTerm.toLowerCase())
  );

  const filteredQuests = quests.filter(q =>
    (q.title || '').toLowerCase().includes(questSearchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-pink mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No organization assigned</p>
          <button
            onClick={() => navigate('/advisor/dashboard')}
            className="mt-4 px-4 py-2 bg-gradient-primary text-white rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-primary text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/advisor/dashboard')}
            className="flex items-center text-white/80 hover:text-white mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <UserGroupIcon className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Manage Collaborations</h1>
              <p className="mt-1 text-white/90">Connect students to work together on quests</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-gradient-primary text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Create Group
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'manage'
                ? 'bg-gradient-primary text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Manage Groups ({existingGroups.length})
          </button>
        </div>

        {activeTab === 'create' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Quest Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Select a Quest</h2>
              <div className="relative mb-4">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search quests..."
                  value={questSearchTerm}
                  onChange={(e) => setQuestSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredQuests.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No quests found</p>
                ) : (
                  filteredQuests.map(quest => (
                    <button
                      key={quest.id}
                      onClick={() => setSelectedQuest(quest)}
                      className={`w-full p-3 text-left rounded-lg border transition-colors ${
                        selectedQuest?.id === quest.id
                          ? 'border-optio-purple bg-optio-purple/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{quest.title}</div>
                      {quest.quest_type && (
                        <div className="text-sm text-gray-500">{quest.quest_type}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Column - Student Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Select Students</h2>
              <div className="relative mb-4">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No students found</p>
                ) : (
                  filteredStudents.map(student => {
                    const isSelected = selectedStudents.some(s => s.id === student.id);
                    return (
                      <button
                        key={student.id}
                        onClick={() => handleStudentToggle(student)}
                        className={`w-full p-3 text-left rounded-lg border transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'border-optio-purple bg-optio-purple/10'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {student.display_name || student.email}
                          </div>
                          {student.display_name && (
                            <div className="text-sm text-gray-500">{student.email}</div>
                          )}
                        </div>
                        {isSelected && (
                          <CheckIcon className="h-5 w-5 text-optio-purple" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom - Group Details & Create */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">3. Group Details</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g., Team Alpha"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selected ({selectedStudents.length} students)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedStudents.map(student => (
                      <span
                        key={student.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-optio-purple/10 text-optio-purple rounded-full text-sm"
                      >
                        {student.display_name || student.email?.split('@')[0]}
                        <button
                          onClick={() => handleRemoveStudent(student.id)}
                          className="hover:text-red-600"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleCreateGroup}
                  disabled={saving || !groupName.trim() || !selectedQuest || selectedStudents.length < 2}
                  className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-5 w-5" />
                      Create Collaboration Group
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Manage Groups Tab */
          <div className="bg-white rounded-lg shadow">
            {existingGroups.length === 0 ? (
              <div className="p-12 text-center">
                <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No collaboration groups yet</h3>
                <p className="text-gray-500 mb-4">Create a group to let students collaborate on quests</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90"
                >
                  Create Your First Group
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {existingGroups.map(group => (
                  <div key={group.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{group.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Quest: {group.quest?.title || 'Unknown Quest'}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {group.members?.map(member => (
                            <span
                              key={member.id}
                              className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                            >
                              {member.display_name || member.email}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
