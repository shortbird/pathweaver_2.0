import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import api from '../../services/api';
import {
  SparklesIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

// Subject display names
const subjectDisplayNames = {
  science: 'Science',
  math: 'Math',
  cte: 'CTE',
  digital_literacy: 'Digital',
  fine_arts: 'Arts',
  language_arts: 'English',
  financial_literacy: 'Finance',
  pe: 'PE',
  health: 'Health',
  social_studies: 'Social Studies',
  electives: 'Electives'
};

// Subject colors for tags
const subjectColors = {
  science: 'bg-blue-100 text-blue-700',
  math: 'bg-indigo-100 text-indigo-700',
  language_arts: 'bg-amber-100 text-amber-700',
  fine_arts: 'bg-pink-100 text-pink-700',
  digital_literacy: 'bg-cyan-100 text-cyan-700',
  pe: 'bg-green-100 text-green-700',
  health: 'bg-teal-100 text-teal-700',
  social_studies: 'bg-orange-100 text-orange-700',
  financial_literacy: 'bg-purple-100 text-purple-700',
  cte: 'bg-slate-100 text-slate-700',
  electives: 'bg-gray-100 text-gray-700'
};

const InterestChip = ({ interest, isSelected, onToggle, disabled }) => {
  return (
    <button
      onClick={() => onToggle(interest.id)}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all
        ${isSelected
          ? 'bg-gradient-primary text-white shadow-md'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }
        ${disabled && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}
        min-h-[44px] touch-manipulation`}
      aria-pressed={isSelected}
    >
      {isSelected && <CheckCircleIcon className="w-4 h-4" />}
      <span>{interest.label}</span>
    </button>
  );
};

const TaskCard = ({ task, index }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-gray-900">{task.title}</h4>
        <span className="bg-gradient-primary text-white text-sm font-bold px-2 py-0.5 rounded">
          {task.xp} XP
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-3">{task.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {task.subjects?.map((subject) => (
          <span
            key={subject}
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${subjectColors[subject] || 'bg-gray-100 text-gray-700'}`}
          >
            {subjectDisplayNames[subject] || subject}
          </span>
        ))}
      </div>
    </div>
  );
};

const LoadingAnimation = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="w-16 h-16 border-4 border-optio-purple/20 rounded-full flex items-center justify-center animate-pulse">
        <SparklesIcon className="w-8 h-8 text-optio-purple animate-bounce" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-gray-900">Creating your personalized tasks...</p>
        <p className="text-sm text-gray-500 mt-1">AI is customizing learning just for you</p>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-optio-purple rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-optio-purple rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-optio-purple rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};

// Quest-specific placeholder examples
const questPlaceholders = {
  'build-robot': 'e.g., I love Minecraft and want my robot to build things',
  'compose-music': 'e.g., I play guitar and love pop music',
  'start-business': 'e.g., I want to sell handmade jewelry online',
  'train-5k': 'e.g., I play soccer and want to improve my endurance',
  'create-film': 'e.g., I love horror movies and want to make a scary short',
  'design-garden': 'e.g., I want to grow vegetables for my family'
};

const DemoPersonalization = () => {
  const { demoState, interestChips, actions } = useDemo();
  const {
    selectedQuest,
    selectedInterests,
    customInterestInput,
    generatedTasks,
    isGeneratingTasks,
    generationError,
    rateLimitRemaining
  } = demoState;

  const [localError, setLocalError] = useState(null);

  const maxInterests = 3;
  const hasInterestSelected = selectedInterests.length > 0 || customInterestInput.trim().length > 0;

  const handleGenerateTasks = async () => {
    if (!selectedQuest || !hasInterestSelected) return;

    setLocalError(null);
    actions.setGeneratingTasks(true);

    try {
      const response = await api.post('/api/demo/generate-tasks', {
        quest_id: selectedQuest.id,
        quest_title: selectedQuest.title,
        interests: selectedInterests,
        custom_input: customInterestInput.trim()
      });

      if (response.data.success && response.data.tasks) {
        actions.setGeneratedTasks(response.data.tasks);
        if (response.data.rate_limit_remaining !== undefined) {
          actions.setRateLimitRemaining(response.data.rate_limit_remaining);
        }
        actions.trackInteraction('tasks_generated', {
          quest_id: selectedQuest.id,
          interests: selectedInterests,
          task_count: response.data.tasks.length
        });
      } else {
        setLocalError('Failed to generate tasks. Please try again.');
        actions.setGeneratingTasks(false);
      }
    } catch (error) {
      console.error('Task generation error:', error);
      if (error.response?.status === 429) {
        setLocalError('You have reached the demo limit. Sign up to continue exploring!');
      } else {
        setLocalError('Something went wrong. Please try again.');
      }
      actions.setGeneratingTasks(false);
    }
  };

  // Show loading state
  if (isGeneratingTasks) {
    return <LoadingAnimation />;
  }

  // Show generated tasks
  if (generatedTasks.length > 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full mb-4">
            <SparklesIcon className="w-5 h-5" />
            <span className="font-medium">Tasks personalized for you!</span>
          </div>
          <p className="text-gray-600">
            Based on your interests, here are tasks tailored to make{' '}
            <span className="font-semibold text-optio-purple">{selectedQuest?.title}</span>
            {' '}uniquely yours.
          </p>
        </div>

        {/* Generated tasks grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {generatedTasks.map((task, index) => (
            <TaskCard key={index} task={task} index={index} />
          ))}
        </div>

        {/* Total XP calculation */}
        <div className="text-center p-4 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg">
          <p className="text-gray-700">
            Complete these tasks to earn{' '}
            <span className="font-bold text-optio-purple">
              {generatedTasks.reduce((sum, t) => sum + (t.xp || 0), 0)} XP
            </span>
            {' '}toward real academic credit.
          </p>
        </div>

        {/* Regenerate option */}
        {rateLimitRemaining > 0 && (
          <div className="text-center">
            <button
              onClick={() => {
                actions.setGeneratedTasks([]);
                setLocalError(null);
              }}
              className="text-sm text-optio-purple hover:underline"
            >
              Try different interests ({rateLimitRemaining} generations left)
            </button>
          </div>
        )}
      </div>
    );
  }

  // Show interest selection
  return (
    <div className="space-y-6">
      {/* Quest context */}
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-gray-600">
          Tell us what you are interested in, and AI will create personalized tasks for{' '}
          <span className="font-semibold text-optio-purple">{selectedQuest?.title}</span>.
        </p>
      </div>

      {/* Interest chips */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Select up to {maxInterests} interests:
        </label>
        <div className="flex flex-wrap gap-2">
          {interestChips.map((interest) => (
            <InterestChip
              key={interest.id}
              interest={interest}
              isSelected={selectedInterests.includes(interest.id)}
              onToggle={actions.toggleInterest}
              disabled={selectedInterests.length >= maxInterests && !selectedInterests.includes(interest.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Or describe what you are into:
        </label>
        <input
          type="text"
          value={customInterestInput}
          onChange={(e) => actions.setCustomInterestInput(e.target.value)}
          placeholder={questPlaceholders[selectedQuest?.id] || 'e.g., describe your hobbies or interests'}
          maxLength={100}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all"
        />
        <p className="text-xs text-gray-500 text-right">{customInterestInput.length}/100</p>
      </div>

      {/* Error message */}
      {(localError || generationError) && (
        <div className="flex items-start gap-2 p-4 bg-red-50 text-red-800 rounded-lg">
          <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{localError || generationError}</p>
        </div>
      )}

      {/* Generate button */}
      <div className="text-center">
        <button
          onClick={handleGenerateTasks}
          disabled={!hasInterestSelected || isGeneratingTasks}
          className={`inline-flex items-center gap-2 px-8 py-4 rounded-lg font-bold text-lg transition-all min-h-[56px] touch-manipulation
            ${hasInterestSelected
              ? 'bg-gradient-primary text-white hover:shadow-lg transform hover:scale-105'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
        >
          <SparklesIcon className="w-6 h-6" />
          <span>Generate My Tasks</span>
        </button>
        {rateLimitRemaining < 3 && (
          <p className="text-xs text-gray-500 mt-2">
            {rateLimitRemaining} generations remaining
          </p>
        )}
      </div>
    </div>
  );
};

export default DemoPersonalization;
