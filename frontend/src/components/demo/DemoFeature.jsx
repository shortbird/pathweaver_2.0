import React, { useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import DemoHero from './DemoHero';
import QuestSelector from './QuestSelector';
import WorkSubmission from './WorkSubmission';
import DiplomaDemoDisplay from './DiplomaDemoDisplay';
import ValidationComparison from './ValidationComparison';
import ConversionPanel from './ConversionPanel';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

const DemoFeature = () => {
  const { demoState, actions } = useDemo();
  const { currentStep } = demoState;

  useEffect(() => {
    // Track demo start
    if (currentStep === 0) {
      actions.trackInteraction('demo_started');
    }
  }, []);

  useEffect(() => {
    // Scroll to top when step changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DemoHero onStart={() => actions.nextStep()} />;
      case 1:
        return <QuestSelector />;
      case 2:
        return <WorkSubmission />;
      case 3:
        return <DiplomaDemoDisplay />;
      case 4:
        return <ValidationComparison />;
      case 5:
        return <ConversionPanel />;
      default:
        return <DemoHero onStart={() => actions.nextStep()} />;
    }
  };

  const getStepInfo = () => {
    const steps = [
      { title: 'Welcome', subtitle: 'Get Your Diploma Day 1' },
      { title: 'Choose Your Quests', subtitle: 'Start Multiple Learning Paths' },
      { title: 'Submit Your Work', subtitle: 'Public or Confidential' },
      { title: 'Your Living Diploma', subtitle: 'See It Fill with Achievements' },
      { title: 'Student vs Teacher Validation', subtitle: 'Why Public Work Matters' },
      { title: 'Start Your Journey', subtitle: 'Join Optio Today' }
    ];
    return steps[currentStep] || steps[0];
  };

  const canGoBack = currentStep > 0 && currentStep < 5;
  const canGoForward = currentStep > 0 && currentStep < 5 && 
    (currentStep !== 1 || demoState.selectedQuests.length > 0) &&
    (currentStep !== 2 || demoState.submittedWork.length > 0 || currentStep > 2);

  const stepInfo = getStepInfo();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6d469b]/5 via-white to-[#ef597b]/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Header */}
        {currentStep > 0 && currentStep <= 5 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
                  {stepInfo.title}
                </h2>
                <p className="text-gray-600 mt-1">{stepInfo.subtitle}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Step {currentStep} of 5</span>
                <button
                  onClick={actions.resetDemo}
                  className="flex items-center gap-1 text-sm text-[#6d469b] hover:underline"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restart
                </button>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] transition-all duration-500"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="relative">
          <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[500px]">
            {renderStep()}
          </div>

          {/* Navigation Buttons */}
          {currentStep > 0 && (
            <div className="flex justify-between mt-6">
              {canGoBack && (
                <button
                  onClick={actions.previousStep}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all bg-white text-[#6d469b] border-2 border-[#6d469b] hover:bg-[#6d469b]/10"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Back
                </button>
              )}

              {currentStep < 5 && (
                <button
                  onClick={actions.nextStep}
                  disabled={!canGoForward}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ml-auto
                    ${canGoForward 
                      ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg transform hover:scale-105' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DemoFeature;