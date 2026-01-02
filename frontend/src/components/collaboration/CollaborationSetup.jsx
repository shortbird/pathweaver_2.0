import React, { useState, useEffect } from 'react';
import { XMarkIcon, MagnifyingGlassIcon, UserGroupIcon, ArrowPathIcon, PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const CollaborationSetup = ({ organizationId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [quests, setQuests] = useState([]);
  const [existingGroups, setExistingGroups] = useState([]);

  // Form state
  const [groupName, setGroupName] = useState('');
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [questSearchTerm, setQuestSearchTerm] = useState('');

  // View state
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'manage'
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, questsRes, groupsRes] = await Promise.all([
        api.get(`/api/admin/organizations/${organizationId}/students`),
        api.get(`/api/admin/organizations/${organizationId}/quests`),
        api.get(`/api/collaboration/groups?organization_id=${organizationId}`)
      ]);

      setStudents(studentsRes.data.students || []);
      setQuests(questsRes.data.quests || []);
      setExistingGroups(groupsRes.data.groups || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      // Silently handle - data may not exist yet
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
      await api.post('/api/collaboration/groups', {
        name: groupName.trim(),
        quest_id: selectedQuest.id,
        organization_id: organizationId,
        member_ids: selectedStudents.map(s => s.id)
      });

      toast.success('Collaboration group created!');
      resetForm();
      fetchData();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error(error.response?.data?.error || 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;

    setSaving(true);
    try {
      await api.put(`/api/collaboration/groups/${editingGroup.id}`, {
        name: groupName.trim(),
        member_ids: selectedStudents.map(s => s.id)
      });

      toast.success('Group updated!');
      setEditingGroup(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error(error.response?.data?.error || 'Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure you want to delete this collaboration group?')) {
      return;
    }

    try {
      await api.delete(`/api/collaboration/groups/${groupId}`);
      toast.success('Group deleted');
      fetchData();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setSelectedQuest(quests.find(q => q.id === group.quest_id) || null);
    setSelectedStudents(group.members || []);
    setActiveTab('create');
  };

  const resetForm = () => {
    setGroupName('');
    setSelectedQuest(null);
    setSelectedStudents([]);
    setStudentSearchTerm('');
    setQuestSearchTerm('');
    setEditingGroup(null);
  };

  const filteredStudents = students.filter(student => {
    if (!studentSearchTerm.trim()) return true;
    const term = studentSearchTerm.toLowerCase();
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
    return fullName.includes(term) || (student.email || '').toLowerCase().includes(term);
  });

  const filteredQuests = quests.filter(quest => {
    if (!questSearchTerm.trim()) return true;
    const term = questSearchTerm.toLowerCase();
    return quest.title.toLowerCase().includes(term);
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-full sm:max-w-4xl mx-2 sm:mx-0 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex justify-between items-center bg-gradient-primary">
          <div className="text-white">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <UserGroupIcon className="w-7 h-7" />
              Collaboration Groups
            </h2>
            <p className="text-sm opacity-90">Create and manage student collaboration groups</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full text-white min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b px-6 bg-gray-50">
          <div className="flex gap-4">
            <button
              onClick={() => { setActiveTab('create'); resetForm(); }}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                activeTab === 'create'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {editingGroup ? 'Edit Group' : 'Create Group'}
            </button>
            <button
              onClick={() => { setActiveTab('manage'); setEditingGroup(null); }}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                activeTab === 'manage'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Manage Groups ({existingGroups.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-optio-purple" />
            </div>
          ) : activeTab === 'create' ? (
            <div className="space-y-6">
              {/* Group Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Team Alpha, Study Group 1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]"
                />
              </div>

              {/* Quest Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Quest
                </label>
                <div className="relative mb-2">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search quests..."
                    value={questSearchTerm}
                    onChange={(e) => setQuestSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]"
                    disabled={!!editingGroup}
                  />
                </div>
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {filteredQuests.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No quests available
                    </div>
                  ) : (
                    filteredQuests.map(quest => (
                      <div
                        key={quest.id}
                        onClick={() => !editingGroup && setSelectedQuest(quest)}
                        className={`p-3 border-b last:border-b-0 cursor-pointer transition-colors ${
                          selectedQuest?.id === quest.id
                            ? 'bg-optio-purple/10 border-l-4 border-l-optio-purple'
                            : editingGroup
                              ? 'bg-gray-50 cursor-not-allowed'
                              : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{quest.title}</div>
                            {quest.big_idea && (
                              <div className="text-sm text-gray-500 line-clamp-1">{quest.big_idea}</div>
                            )}
                          </div>
                          {selectedQuest?.id === quest.id && (
                            <CheckIcon className="w-5 h-5 text-optio-purple" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Student Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Students ({selectedStudents.length} selected)
                </label>

                {/* Selected Students */}
                {selectedStudents.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedStudents.map(student => (
                      <div
                        key={student.id}
                        className="flex items-center gap-2 bg-optio-purple/10 text-optio-purple px-3 py-1.5 rounded-full text-sm"
                      >
                        <span>{student.first_name} {student.last_name}</span>
                        <button
                          onClick={() => handleRemoveStudent(student.id)}
                          className="hover:bg-optio-purple/20 rounded-full p-0.5"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Student Search */}
                <div className="relative mb-2">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]"
                  />
                </div>

                {/* Student List */}
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {filteredStudents.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No students found
                    </div>
                  ) : (
                    filteredStudents.map(student => {
                      const isSelected = selectedStudents.some(s => s.id === student.id);
                      return (
                        <div
                          key={student.id}
                          onClick={() => handleStudentToggle(student)}
                          className={`p-3 border-b last:border-b-0 cursor-pointer transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-optio-purple/10'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div>
                            <div className="font-medium text-gray-900">
                              {student.first_name} {student.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{student.email}</div>
                          </div>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-optio-purple border-optio-purple'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Manage Groups Tab */
            <div className="space-y-4">
              {existingGroups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <UserGroupIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">No collaboration groups yet</p>
                  <p className="text-sm mt-1">Create a group to get started</p>
                </div>
              ) : (
                existingGroups.map(group => (
                  <div
                    key={group.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{group.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Quest: {group.quest_title || 'Unknown'}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(group.members || []).map(member => (
                            <span
                              key={member.id}
                              className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs"
                            >
                              {member.first_name} {member.last_name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditGroup(group)}
                          className="p-2 text-gray-500 hover:text-optio-purple hover:bg-optio-purple/10 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Edit group"
                        >
                          <PlusIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete group"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {activeTab === 'create' && selectedStudents.length > 0 && (
              <span>{selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={editingGroup ? () => { setEditingGroup(null); resetForm(); } : onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px] touch-manipulation"
            >
              {editingGroup ? 'Cancel' : 'Close'}
            </button>
            {activeTab === 'create' && (
              <button
                onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                disabled={saving || !groupName.trim() || (!editingGroup && !selectedQuest) || selectedStudents.length < 2}
                className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation flex items-center gap-2"
              >
                {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                {editingGroup ? 'Update Group' : 'Create Group'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborationSetup;
