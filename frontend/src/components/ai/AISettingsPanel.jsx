import React from 'react';
import {
  SparklesIcon,
  CpuChipIcon,
  EyeSlashIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useAI } from '../../contexts/AIContext';

/**
 * Panel for managing AI assistance settings.
 * Can be used standalone or embedded in a settings page.
 */
const AISettingsPanel = ({ className = '' }) => {
  const {
    aiLevel,
    updateAILevel,
    isLoading,
    AI_LEVELS,
    featureToggles,
    toggleFeature
  } = useAI();

  const levelOptions = [
    {
      value: AI_LEVELS.OFF,
      label: 'Off',
      description: "I'll do everything manually",
      icon: EyeSlashIcon,
      color: 'gray'
    },
    {
      value: AI_LEVELS.SUGGESTIONS,
      label: 'Suggestions',
      description: "Show AI ideas, I'll decide",
      icon: SparklesIcon,
      color: 'purple'
    },
    {
      value: AI_LEVELS.AUTO,
      label: 'Auto-apply',
      description: 'Let AI handle routine tagging',
      icon: CpuChipIcon,
      color: 'pink'
    }
  ];

  const featureOptions = [
    { key: 'titleSuggestions', label: 'Title suggestions', description: 'Suggest titles for learning moments' },
    { key: 'pillarSuggestions', label: 'Pillar suggestions', description: 'Suggest learning pillars' },
    { key: 'trackSuggestions', label: 'Track suggestions', description: 'Suggest interest tracks' },
    { key: 'threadSuggestions', label: 'Thread connections', description: 'Find related moments' },
    { key: 'reflectionPrompts', label: 'Reflection prompts', description: 'Ask deepening questions' },
    { key: 'weeklyDigest', label: 'Weekly digest', description: 'Summarize weekly learning' }
  ];

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-8 bg-gray-200 rounded mb-4 w-1/3" />
        <div className="space-y-3">
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-purple-600" />
          AI Assistance
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Control how AI helps with your learning moments
        </p>
      </div>

      {/* Level Selection */}
      <div className="space-y-3 mb-8">
        {levelOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = aiLevel === option.value;

          return (
            <button
              key={option.value}
              onClick={() => updateAILevel(option.value)}
              className={`
                w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all
                ${isSelected
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'}
              `}
            >
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center
                ${isSelected ? 'bg-purple-100' : 'bg-gray-100'}
              `}>
                <Icon className={`w-5 h-5 ${isSelected ? 'text-purple-600' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1">
                <p className={`font-medium ${isSelected ? 'text-purple-900' : 'text-gray-900'}`}>
                  {option.label}
                </p>
                <p className="text-sm text-gray-500">{option.description}</p>
              </div>
              {isSelected && (
                <CheckCircleIcon className="w-6 h-6 text-purple-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Feature Toggles (only show if AI is not off) */}
      {aiLevel !== AI_LEVELS.OFF && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Feature Settings
          </h4>
          <div className="space-y-2">
            {featureOptions.map((feature) => (
              <label
                key={feature.key}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{feature.label}</p>
                  <p className="text-xs text-gray-500">{feature.description}</p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={featureToggles[feature.key]}
                    onChange={() => toggleFeature(feature.key)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-300 peer-checked:bg-purple-600 rounded-full transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Privacy note */}
      <div className="mt-6 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-500">
          AI suggestions are processed using Gemini and help organize your learning.
          Your data is used only to improve your experience and is never shared externally.
          You can turn off AI assistance at any time.
        </p>
      </div>
    </div>
  );
};

export default AISettingsPanel;
