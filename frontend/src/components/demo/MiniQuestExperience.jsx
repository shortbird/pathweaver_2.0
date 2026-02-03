import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';

const MiniQuestExperience = () => {
  const { demoState, actions } = useDemo();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [taskComplete, setTaskComplete] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // Get first selected quest or default to family-recipes
  const selectedQuest = demoState.selectedQuests[0] || {
    id: 'family-recipes',
    title: "Build Your Family's Recipe Book",
    tasks: [
      { id: 'interview', title: 'Interview family members', pillar: 'communication', xp: 75 }
    ]
  };

  const demoTask = selectedQuest.tasks[0];

  useEffect(() => {
    // Auto-start recording after 1 second
    const timer = setTimeout(() => {
      startRecording();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const startRecording = () => {
    setIsRecording(true);

    // Simulate recording progress
    const interval = setInterval(() => {
      setRecordingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          completeTask();
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  const completeTask = () => {
    setIsRecording(false);
    setTaskComplete(true);
    setShowCelebration(true);

    // Award XP
    actions.completeSimulatedTask(demoTask.pillar, demoTask.xp);

    // Track interaction
    actions.trackInteraction('mini_quest_completed', {
      questId: selectedQuest.id,
      taskId: demoTask.id,
      xpEarned: demoTask.xp
    });
  };

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="text-center space-y-2">
        <p className="text-sm font-semibold text-optio-purple uppercase">
          {selectedQuest.title}
        </p>
        <h3 className="text-2xl font-bold text-text-primary">
          {demoTask.title}
        </h3>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-primary transition-all duration-300"
          style={{ width: '25%' }}
        >
          <div className="h-full w-full bg-white/20 animate-pulse" />
        </div>
      </div>
      <p className="text-center text-sm text-gray-600">Task 1 of 4 • 25% complete</p>

      {/* Simulated Task Interface */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100">
        <div className="space-y-6">
          {/* Task Instructions */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-2">
              Question for your family member:
            </p>
            <p className="text-gray-700 italic">
              "What's your earliest memory of this recipe?"
            </p>
          </div>

          {/* Recording Interface */}
          <div className="relative">
            {isRecording && (
              <div className="absolute inset-0 bg-gradient-primary rounded-lg opacity-10 animate-pulse" />
            )}

            <div className="bg-white rounded-lg p-6 shadow-md relative">
              {/* Audio Waveform Visualization */}
              <div className="flex items-center justify-center gap-1 h-24 mb-4">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 bg-gradient-primary rounded-full transition-all duration-150 ${
                      isRecording ? 'animate-pulse' : ''
                    }`}
                    style={{
                      height: isRecording
                        ? `${Math.random() * 60 + 20}px`
                        : '10px',
                      animationDelay: `${i * 50}ms`
                    }}
                  />
                ))}
              </div>

              {/* Recording Progress */}
              {isRecording && (
                <div className="mb-4">
                  <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary transition-all duration-100"
                      style={{ width: `${recordingProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-center text-gray-600 mt-2">
                    Recording response...
                  </p>
                </div>
              )}

              {/* Simulated Response Text */}
              {recordingProgress > 30 && (
                <div className="space-y-3">
                  <p className="text-gray-700 leading-relaxed">
                    "My grandmother made this every Sunday morning when I was growing up..."
                  </p>
                  {recordingProgress > 60 && (
                    <p className="text-gray-700 leading-relaxed">
                      "She'd wake up before dawn to start the dough. The whole house would smell amazing by the time we woke up..."
                    </p>
                  )}
                </div>
              )}

              {/* Completion Checkmark */}
              {taskComplete && (
                <div className="flex items-center justify-center gap-2 text-green-600 font-semibold mt-4">
                  <CheckCircleIcon className="w-6 h-6" />
                  <span>CAPTURED ✓</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Celebration Message */}
      {showCelebration && (
        <div className="bg-gradient-primary rounded-xl p-6 text-white text-center space-y-4 animate-fadeIn">
          <div className="flex items-center justify-center gap-2">
            <SparklesIcon className="w-8 h-8 animate-spin" />
            <h3 className="text-2xl font-bold">Amazing!</h3>
            <SparklesIcon className="w-8 h-8 animate-spin" />
          </div>

          <p className="text-lg">
            You're discovering stories that might have been lost.
          </p>

          <div className="bg-white/20 rounded-lg p-4 backdrop-blur">
            <p className="text-3xl font-bold mb-1">+{demoTask.xp} XP</p>
            <p className="text-sm opacity-90">
              Your {getPillarName(demoTask.pillar)} skills are growing
            </p>
          </div>

          {/* XP Bar Animation */}
          <div className="bg-white/30 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-1000 ease-out"
              style={{ width: '75%' }}
            />
          </div>
        </div>
      )}

      {/* Info Box */}
      {!taskComplete && (
        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
          <p className="text-sm text-gray-700 text-center italic">
            This is how learning feels on Optio - engaging, meaningful, and automatically documented.
          </p>
        </div>
      )}
    </div>
  );
};

// Helper function for pillar names
const getPillarName = (pillar) => {
  const names = {
    stem: 'STEM',
    wellness: 'Wellness',
    communication: 'Communication',
    civics: 'Civics',
    art: 'Art'
  };
  return names[pillar] || pillar;
};

export default MiniQuestExperience;
