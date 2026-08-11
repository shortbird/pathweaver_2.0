import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import LearningEventCard from '../learning-events/LearningEventCard';
import CreateTrackModal from './CreateTrackModal';
import EmptyState from '../ui/EmptyState';
import { FolderOpenIcon } from '@heroicons/react/24/outline';

const InterestTrackDetail = ({
  trackId,
  refreshKey = 0,
  onDelete,
  onGraduate,
  studentId = null  // Optional - when parent views child's track
}) => {
  const isParentView = !!studentId;
  const [track, setTrack] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (trackId) {
      fetchTrack();
    }
  }, [trackId, refreshKey]);

  const fetchTrack = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const endpoint = isParentView
        ? `/api/parent/children/${studentId}/topics/${trackId}`
        : `/api/interest-tracks/${trackId}`;
      const response = await api.get(endpoint);
      if (response.data.success) {
        setTrack(response.data.track);
      } else {
        setLoadError(response.data.error || 'Failed to load topic');
      }
    } catch (error) {
      setLoadError(error?.response?.data?.error || 'Failed to load topic');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (trackData) => {
    try {
      const response = await api.put(`/api/interest-tracks/${trackId}`, trackData);
      if (response.data.success) {
        toast.success('Topic updated!');
        setShowEditModal(false);
        fetchTrack();
      }
    } catch (error) {
      console.error('Failed to update track:', error);
      toast.error('Failed to update topic');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/api/interest-tracks/${trackId}`);
      if (response.data.success) {
        toast.success('Topic deleted');
        setShowDeleteConfirm(false);
        onDelete?.(trackId);
      }
    } catch (error) {
      console.error('Failed to delete track:', error);
      toast.error('Failed to delete topic');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded mb-4" />
        <div className="h-4 w-64 bg-gray-100 rounded mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 mb-3">{loadError}</p>
        <button onClick={fetchTrack} className="btn-quiet">
          Retry
        </button>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Topic not found</p>
      </div>
    );
  }

  const canGraduate = (track.moment_count || track.moments?.length || 0) >= 5;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="p-6 border-b"
        style={{ backgroundColor: `${track.color}10` }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{track.name}</h2>
            {track.description && (
              <p className="text-sm text-gray-600 mt-1">{track.description}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {track.moment_count || track.moments?.length || 0} learning moment{(track.moment_count || track.moments?.length) !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchTrack}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
              title="Edit topic"
            >
              <PencilIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-white/50 rounded-lg transition-colors"
              title="Delete topic"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Evolved quest link or evolve prompt */}
        {track.evolved_to_quest_id ? (
          <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-green-800">
                  This topic has evolved into a quest
                </span>
                <p className="text-xs text-green-600 mt-0.5">
                  Continue your learning journey there
                </p>
              </div>
              <Link
                to={`/quests/${track.evolved_to_quest_id}`}
                className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5"
              >
                View Quest
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : canGraduate && (
          <div className="mt-4 p-3 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg border border-optio-purple/20">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-optio-purple-dark">
                  Ready to evolve this topic into a quest?
                </span>
                <p className="text-xs text-optio-purple mt-0.5">
                  Turn your learning into a quest and earn XP
                </p>
              </div>
              <button
                onClick={() => onGraduate?.(track)}
                className="btn-primary"
              >
                Evolve
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Moments List */}
      <div className="flex-1 overflow-y-auto p-6">
        {track.moments && track.moments.length > 0 ? (
          <div className="space-y-4">
            {track.moments.map(moment => (
              <LearningEventCard
                key={moment.id}
                event={moment}
                studentId={studentId}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            plain
            icon={FolderOpenIcon}
            title="No moments in this topic yet"
            hint="Capture a learning moment and assign it to this topic"
          />
        )}
      </div>

      {/* Edit Modal */}
      <CreateTrackModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onCreate={handleUpdate}
        initialData={track}
      />

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Topic?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will delete the topic "{track.name}". Your learning moments will become unassigned but will not be deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-quiet flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger flex-1"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterestTrackDetail;
