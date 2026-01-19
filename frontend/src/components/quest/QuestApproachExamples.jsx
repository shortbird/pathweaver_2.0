import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import ApproachExampleCard from './ApproachExampleCard';
import toast from 'react-hot-toast';
import { SparklesIcon, PlusIcon } from '@heroicons/react/24/outline';

/**
 * QuestApproachExamples - Display starter paths for a quest
 *
 * Shows different ways students can approach the quest, each with pre-defined tasks.
 * Selecting a path enrolls the student and creates those tasks.
 * Also provides option to start with a blank slate.
 */
const QuestApproachExamples = ({
  questId,
  questTitle,
  questDescription,
  cachedApproaches,
  isEnrolled = false,
  onEnrollmentComplete,
  className = ''
}) => {
  // Don't even initialize state if enrolled - component won't render
  const [approaches, setApproaches] = useState(cachedApproaches || null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectingIndex, setSelectingIndex] = useState(null);
  const queryClient = useQueryClient();

  const accentColors = ['purple-50', 'pink-50', 'blue-50', 'teal-50'];

  useEffect(() => {
    // Don't fetch if enrolled - this component won't show anyway
    if (isEnrolled) {
      return;
    }

    // Use cached approaches if available
    if (cachedApproaches && cachedApproaches.length > 0) {
      setApproaches(cachedApproaches);
      setIsLoading(false);
      return;
    }

    // Only fetch if we don't have cached data
    const fetchApproaches = async () => {
      if (!questId) return;

      try {
        setIsLoading(true);
        const response = await api.get(`/api/quest-ai/approach-examples/${questId}`);

        if (response.data.success && response.data.approaches?.length > 0) {
          setApproaches(response.data.approaches);
        } else {
          setApproaches([]);
        }
      } catch (err) {
        console.debug('Failed to load approaches:', err);
        setApproaches([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchApproaches();
  }, [questId, cachedApproaches, isEnrolled]);

  // Early return if enrolled - don't render anything
  if (isEnrolled) {
    return null;
  }

  const handleSelectApproach = async (index) => {
    if (selectingIndex !== null) return;

    setSelectingIndex(index);

    try {
      const response = await api.post(`/api/quest-ai/accept-approach/${questId}`, {
        approach_index: index
      });

      if (response.data.success) {
        toast.success(`Started with "${approaches[index].label}" path`);

        // Invalidate quest data to refetch with new enrollment
        queryClient.invalidateQueries({ queryKey: ['quest', questId] });
        queryClient.invalidateQueries({ queryKey: ['quests'] });

        if (onEnrollmentComplete) {
          onEnrollmentComplete(response.data);
        }
      } else {
        toast.error(response.data.error || 'Failed to start quest');
      }
    } catch (err) {
      console.error('Error selecting approach:', err);
      toast.error(err.response?.data?.error || 'Failed to start quest');
    } finally {
      setSelectingIndex(null);
    }
  };

  const handleStartFromScratch = async () => {
    if (selectingIndex !== null) return;

    setSelectingIndex('scratch');

    try {
      // Use -1 as approach_index to indicate "start from scratch" (no tasks)
      const response = await api.post(`/api/quest-ai/accept-approach/${questId}`, {
        approach_index: -1
      });

      if (response.data.success) {
        toast.success('Started quest - add your own tasks!');

        // Invalidate quest data to refetch with new enrollment
        queryClient.invalidateQueries({ queryKey: ['quest', questId] });
        queryClient.invalidateQueries({ queryKey: ['quests'] });

        if (onEnrollmentComplete) {
          onEnrollmentComplete(response.data);
        }
      } else {
        toast.error(response.data.error || 'Failed to start quest');
      }
    } catch (err) {
      console.error('Error starting from scratch:', err);
      toast.error(err.response?.data?.error || 'Failed to start quest');
    } finally {
      setSelectingIndex(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-white rounded-xl shadow-md p-4 sm:p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border-2 border-gray-100 rounded-xl p-5">
                <div className="h-5 bg-gray-200 rounded w-24 mb-3"></div>
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-4 bg-gray-100 rounded w-full"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Hide if no approaches (isEnrolled already checked above)
  if (!approaches || approaches.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white rounded-xl shadow-md p-4 sm:p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <SparklesIcon className="w-5 h-5 text-optio-purple" />
        <h2
          className="text-lg sm:text-xl font-bold text-gray-900"
          style={{ fontFamily: 'Poppins' }}
        >
          Choose Your Path
        </h2>
      </div>
      <p
        className="text-sm text-gray-600 mb-4"
        style={{ fontFamily: 'Poppins' }}
      >
        Pick a starter path that matches your interests, or start from scratch.
      </p>

      {/* Approach Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {approaches.map((approach, index) => (
          <ApproachExampleCard
            key={`${approach.label}-${index}`}
            label={approach.label}
            description={approach.description}
            tasks={approach.tasks || []}
            accentColor={accentColors[index % accentColors.length]}
            isEnrolled={isEnrolled}
            isSelecting={selectingIndex === index}
            onSelect={() => handleSelectApproach(index)}
          />
        ))}
      </div>

      {/* Start from Scratch option */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-500 text-center mb-2">
          Want to create your own tasks?
        </p>
        <button
          onClick={handleStartFromScratch}
          disabled={selectingIndex === 'scratch'}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg font-medium text-sm hover:border-optio-purple hover:text-optio-purple transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'Poppins' }}
        >
          <PlusIcon className="w-4 h-4" />
          {selectingIndex === 'scratch' ? 'Starting...' : 'Start from Scratch'}
        </button>
      </div>
    </div>
  );
};

export default QuestApproachExamples;
