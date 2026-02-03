import React from 'react';
import { XMarkIcon, BoltIcon, ArrowTrendingUpIcon, MoonIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

/**
 * RhythmExplainerModal - Explains the rhythm tracking feature
 *
 * Opens when user clicks on the rhythm indicator to learn more.
 */
const RhythmExplainerModal = ({ isOpen, onClose, currentState }) => {
  if (!isOpen) return null;

  const rhythmStates = [
    {
      state: 'in_flow',
      icon: BoltIcon,
      name: 'In Flow',
      description: 'You have a consistent learning rhythm, engaging regularly.',
      color: 'text-optio-purple',
      bgColor: 'bg-purple-50'
    },
    {
      state: 'building',
      icon: ArrowTrendingUpIcon,
      name: 'Building Momentum',
      description: 'Your engagement is increasing. Keep exploring!',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      state: 'resting',
      icon: MoonIcon,
      name: 'Resting',
      description: 'Taking time to absorb what you\'ve learned. Breaks are part of the process.',
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      state: 'fresh_return',
      icon: ArrowPathIcon,
      name: 'Welcome Back',
      description: 'You\'ve returned after a break. Great to see you again!',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 animate-fade-in">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
              Your Learning Rhythm
            </h2>
            <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Poppins' }}>
              We track your engagement patterns, not completion percentages
            </p>
          </div>

          {/* Philosophy */}
          <div className="bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins' }}>
              <strong>The Process Is The Goal.</strong> Learning isn't about racing to finish.
              It's about finding a sustainable rhythm that works for you. Breaks are healthy
              and part of the journey.
            </p>
          </div>

          {/* Rhythm states */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>
              Rhythm States
            </h3>
            {rhythmStates.map((item) => {
              const Icon = item.icon;
              const isCurrentState = currentState === item.state;
              return (
                <div
                  key={item.state}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                    isCurrentState ? `${item.bgColor} ring-2 ring-offset-1 ring-optio-purple/30` : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-2 rounded-full ${item.bgColor}`}>
                    <Icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${item.color}`} style={{ fontFamily: 'Poppins' }}>
                        {item.name}
                      </span>
                      {isCurrentState && (
                        <span className="text-xs bg-optio-purple text-white px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5" style={{ fontFamily: 'Poppins' }}>
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 text-center" style={{ fontFamily: 'Poppins' }}>
              Your journey calendar shows your activity pattern over time
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RhythmExplainerModal;
