import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import {
  CameraIcon,
  LinkIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  SparklesIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';

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

// Subject colors
const subjectColors = {
  science: { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-700' },
  math: { bg: 'bg-indigo-500', light: 'bg-indigo-100', text: 'text-indigo-700' },
  language_arts: { bg: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-700' },
  fine_arts: { bg: 'bg-pink-500', light: 'bg-pink-100', text: 'text-pink-700' },
  digital_literacy: { bg: 'bg-cyan-500', light: 'bg-cyan-100', text: 'text-cyan-700' },
  pe: { bg: 'bg-green-500', light: 'bg-green-100', text: 'text-green-700' },
  health: { bg: 'bg-teal-500', light: 'bg-teal-100', text: 'text-teal-700' },
  social_studies: { bg: 'bg-orange-500', light: 'bg-orange-100', text: 'text-orange-700' },
  financial_literacy: { bg: 'bg-purple-500', light: 'bg-purple-100', text: 'text-purple-700' },
  cte: { bg: 'bg-slate-500', light: 'bg-slate-100', text: 'text-slate-700' },
  electives: { bg: 'bg-gray-500', light: 'bg-gray-100', text: 'text-gray-700' }
};

const EvidenceButton = ({ icon: Icon, label, type, onSubmit, disabled }) => {
  return (
    <button
      onClick={() => onSubmit(type)}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 transition-all min-h-[120px] touch-manipulation
        ${disabled
          ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-50'
          : 'bg-white border-gray-200 hover:border-optio-purple hover:shadow-lg hover:scale-105 active:scale-95'
        }`}
    >
      <div className={`p-3 rounded-full ${disabled ? 'bg-gray-100' : 'bg-gradient-primary/10'}`}>
        <Icon className={`w-8 h-8 ${disabled ? 'text-gray-400' : 'text-optio-purple'}`} />
      </div>
      <span className={`font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
    </button>
  );
};

const AnimatedXPCounter = ({ targetValue, duration = 1500 }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime;
    let animationFrame;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayValue(Math.round(eased * targetValue));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [targetValue, duration]);

  return <span>{displayValue}</span>;
};

const CreditProgressBar = ({ subject, xp, maxXp = 500, animate = false, delay = 0 }) => {
  const [width, setWidth] = useState(0);
  const colors = subjectColors[subject] || subjectColors.electives;
  const percentage = Math.min((xp / maxXp) * 100, 100);
  const credits = (xp / 2000).toFixed(2);

  useEffect(() => {
    if (animate) {
      const timer = setTimeout(() => {
        setWidth(percentage);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setWidth(percentage);
    }
  }, [animate, percentage, delay]);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className={`font-medium ${colors.text}`}>
          {subjectDisplayNames[subject] || subject}
        </span>
        <span className="text-gray-600">{xp} XP ({credits} credits)</span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors.bg} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
};

const DemoEvidence = () => {
  const { demoState, actions, subjectNames } = useDemo();
  const { generatedTasks, submittedEvidence, totalXPEarned, demoCredits } = demoState;

  const [showAnimation, setShowAnimation] = useState(false);
  const [animationPhase, setAnimationPhase] = useState(0);

  // Get the first task for submission (in demo, we just use one)
  const taskToComplete = generatedTasks[0] || {
    title: 'Complete your task',
    description: 'Submit evidence of your work',
    xp: 150,
    subjects: ['electives']
  };

  const handleSubmitEvidence = (type) => {
    // Submit the evidence
    actions.submitEvidence(type, taskToComplete);

    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#6d469b', '#ef597b', '#ffd700']
    });

    // Start animation sequence
    setShowAnimation(true);
    setAnimationPhase(1);

    // Phase 2: Show XP animation
    setTimeout(() => setAnimationPhase(2), 500);

    // Phase 3: Show credit bars
    setTimeout(() => setAnimationPhase(3), 1500);

    // Complete animation
    setTimeout(() => {
      setAnimationPhase(4);
      actions.completeEvidenceAnimation();
    }, 3000);

    // Track interaction
    actions.trackInteraction('evidence_submitted', {
      type,
      task_xp: taskToComplete.xp,
      subjects: taskToComplete.subjects
    });
  };

  // Show the completion animation
  if (showAnimation) {
    return (
      <div className="space-y-8 py-4">
        {/* Success header */}
        <div className={`text-center transform transition-all duration-500 ${animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircleIcon className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Evidence Submitted!</h3>
          <p className="text-gray-600">Your work has been added to your portfolio</p>
        </div>

        {/* XP animation */}
        <div className={`text-center transform transition-all duration-500 ${animationPhase >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <div className="inline-flex items-center gap-3 px-6 py-4 bg-gradient-primary rounded-xl text-white shadow-lg">
            <SparklesIcon className="w-8 h-8" />
            <div className="text-left">
              <p className="text-sm opacity-80">XP Earned</p>
              <p className="text-3xl font-bold">
                +<AnimatedXPCounter targetValue={taskToComplete.xp} />
              </p>
            </div>
          </div>
        </div>

        {/* Credit tracking */}
        <div className={`transform transition-all duration-500 ${animationPhase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <AcademicCapIcon className="w-6 h-6 text-optio-purple" />
              <h4 className="font-semibold text-gray-900">Credit Progress</h4>
            </div>

            {/* Show progress for subjects that have XP */}
            {Object.entries(demoCredits)
              .filter(([_, xp]) => xp > 0)
              .map(([subject, xp], index) => (
                <CreditProgressBar
                  key={subject}
                  subject={subject}
                  xp={xp}
                  animate={true}
                  delay={index * 200}
                />
              ))}

            {/* Total XP */}
            <div className="pt-4 border-t border-gray-200 mt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Total XP Earned</span>
                <span className="text-lg font-bold text-optio-purple">
                  {totalXPEarned} XP
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Continue prompt */}
        <div className={`text-center transform transition-all duration-500 ${animationPhase >= 4 ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-gray-600 mb-2">
            This is just the beginning. Complete more tasks to build your portfolio!
          </p>
        </div>
      </div>
    );
  }

  // Show evidence submission options
  return (
    <div className="space-y-6">
      {/* Task card to complete */}
      <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-6 border border-optio-purple/20">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <span className="text-xs font-medium text-optio-purple uppercase tracking-wide">Task to Complete</span>
            <h3 className="text-xl font-bold text-gray-900 mt-1">{taskToComplete.title}</h3>
            <p className="text-gray-600 mt-2">{taskToComplete.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {taskToComplete.subjects?.map((subject) => {
                const colors = subjectColors[subject] || subjectColors.electives;
                return (
                  <span
                    key={subject}
                    className={`text-xs px-2 py-1 rounded-full font-medium ${colors.light} ${colors.text}`}
                  >
                    {subjectDisplayNames[subject] || subject}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="text-center sm:text-right">
            <div className="bg-gradient-primary text-white px-4 py-2 rounded-lg inline-block">
              <span className="text-2xl font-bold">{taskToComplete.xp}</span>
              <span className="text-sm ml-1">XP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Evidence submission prompt */}
      <div className="text-center">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">How did you complete this task?</h4>
        <p className="text-gray-600">Choose how you want to document your evidence:</p>
      </div>

      {/* Evidence type buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <EvidenceButton
          icon={CameraIcon}
          label="Photo"
          type="photo"
          onSubmit={handleSubmitEvidence}
          disabled={false}
        />
        <EvidenceButton
          icon={LinkIcon}
          label="Link"
          type="link"
          onSubmit={handleSubmitEvidence}
          disabled={false}
        />
        <EvidenceButton
          icon={PencilSquareIcon}
          label="Reflection"
          type="reflection"
          onSubmit={handleSubmitEvidence}
          disabled={false}
        />
      </div>

      {/* Demo note */}
      <p className="text-center text-sm text-gray-500">
        In the demo, clicking any option will simulate evidence submission.
        In the real platform, you would upload actual evidence.
      </p>
    </div>
  );
};

export default DemoEvidence;
