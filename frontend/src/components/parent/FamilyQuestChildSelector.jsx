import { useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, UserIcon, CheckIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const FamilyQuestChildSelector = ({
  isOpen,
  onClose,
  questId,
  questTitle,
  children = [],
  dependents = [],
  onComplete
}) => {
  // Build unified list of all children
  const allChildren = [
    ...children.map(c => ({
      id: c.student_id,
      name: c.student_first_name + (c.student_last_name ? ` ${c.student_last_name}` : ''),
      type: 'linked'
    })),
    ...dependents.map(d => ({
      id: d.id,
      name: d.display_name,
      type: 'dependent'
    }))
  ];

  // All pre-selected by default
  const [selectedIds, setSelectedIds] = useState(new Set(allChildren.map(c => c.id)));
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const allSelected = selectedIds.size === allChildren.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allChildren.map(c => c.id)));
    }
  };

  const toggleChild = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one child');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post(`/api/family/quests/${questId}/enroll-children`, {
        child_ids: Array.from(selectedIds)
      });

      if (response.data.success) {
        const enrolledCount = response.data.enrolled?.length || 0;
        const failedCount = response.data.failed?.length || 0;

        if (failedCount > 0) {
          toast.success(`Quest assigned to ${enrolledCount} children (${failedCount} failed)`);
        } else {
          toast.success(`Quest assigned to ${enrolledCount} ${enrolledCount === 1 ? 'child' : 'children'}`);
        }

        onComplete && onComplete();
        onClose();
      } else {
        toast.error(response.data.error || 'Failed to assign quest');
      }
    } catch (error) {
      console.error('Error enrolling children:', error);
      toast.error(error.response?.data?.error || 'Failed to assign quest to children');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        {/* Header */}
        <div className="border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Assign Quest to Children
            </h2>
            <p className="text-sm text-gray-500 mt-1 truncate max-w-[280px]">{questTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full" disabled={loading}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Child List */}
        <div className="p-6">
          {allChildren.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No children found</p>
          ) : (
            <>
              {/* Select All */}
              <button
                onClick={toggleAll}
                className="w-full flex items-center gap-3 px-3 py-2 mb-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  allSelected ? 'bg-optio-purple border-optio-purple' : 'border-gray-300'
                }`}>
                  {allSelected && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm font-semibold text-gray-700">Select All</span>
              </button>

              {/* Individual children */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allChildren.map(child => {
                  const isSelected = selectedIds.has(child.id);
                  return (
                    <button
                      key={child.id}
                      onClick={() => toggleChild(child.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border-2 transition-colors ${
                        isSelected
                          ? 'border-optio-purple bg-optio-purple/5'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-optio-purple border-optio-purple' : 'border-gray-300'
                      }`}>
                        {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                      </div>
                      <UserIcon className="w-5 h-5 text-gray-400" />
                      <span className="flex-1 text-left font-medium text-gray-900">{child.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        child.type === 'dependent'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {child.type === 'dependent' ? 'Under 13' : '13+'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium min-h-[44px]"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={loading || selectedIds.size === 0}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Assigning...' : `Assign Quest (${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FamilyQuestChildSelector;
