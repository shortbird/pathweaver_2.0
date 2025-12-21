import React, { useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import DemoHero from './DemoHero';
import QuestSelector from './QuestSelector';
import MiniQuestExperience from './MiniQuestExperience';
import BadgeUnlock from './BadgeUnlock';
import ParentDashboardPreview from './ParentDashboardPreview';
import FamilyEngagementPreview from './FamilyEngagementPreview';
import DiplomaDemoDisplay from './DiplomaDemoDisplay';
import JoinJourney from './JoinJourney';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

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
        return <MiniQuestExperience />;
      case 3:
        return <BadgeUnlock />;
      case 4:
        return <ParentDashboardPreview />;
      case 5:
        return <FamilyEngagementPreview />;
      case 6:
        return <DiplomaDemoDisplay />;
      case 7:
        return <JoinJourney />;
      default:
        return <DemoHero onStart={() => actions.nextStep()} />;
    }
  };

  const getStepInfo = () => {
    const steps = [
      { title: 'Your Learning Story Starts Here', subtitle: 'What will you discover today?' },
      { title: 'Choose Your Next Adventure', subtitle: 'What are you curious about today?' },
      { title: 'Experience Learning', subtitle: 'Complete your first task' },
      { title: "You're Growing!", subtitle: 'Watch your skills take shape' },
      { title: 'Parents Can Cheer You On', subtitle: 'They see your rhythm, not every detail' },
      { title: 'Your Learning Community', subtitle: 'Family can celebrate with you' },
      { title: 'Your Living Portfolio', subtitle: 'This grows automatically as you learn' },
      { title: 'Ready to Start Your Story?', subtitle: 'Join thousands of learners' }
    ];
    return steps[currentStep] || steps[0];
  };

  const canGoBack = currentStep > 0 && currentStep < 7;
  const canGoForward = () => {
    if (currentStep === 0 || currentStep >= 7) return false;
    if (currentStep === 1) return demoState.selectedQuests.length > 0;
    if (currentStep === 2) return demoState.simulatedTaskCompleted;
    return true; // All other steps can proceed
  };

  const stepInfo = getStepInfo();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6d469b]/5 via-white to-[#ef597b]/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Header */}
        {currentStep > 0 && currentStep <= 7 && (
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent leading-tight">
                  {stepInfo.title}
                </h2>
                <p className="text-gray-600 mt-1 text-sm sm:text-base">{stepInfo.subtitle}</p>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4 flex-shrink-0">
                <span className="text-sm text-gray-600">Step {currentStep} of 7</span>
                <button
                  onClick={actions.resetDemo}
                  className="flex items-center gap-1 text-sm text-optio-purple hover:underline py-1 px-2 -mx-2 rounded touch-manipulation"
                >
                  <RotateCcw className="w-4 h-4 flex-shrink-0" />
                  <span>Restart</span>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-primary transition-all duration-500"
                style={{ width: `${(currentStep / 7) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="relative">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 min-h-[400px] sm:min-h-[500px]">
            {renderStep()}
          </div>

          {/* Navigation Buttons */}
          {currentStep > 0 && (
            <div className="flex flex-col sm:flex-row justify-between gap-3 mt-4 sm:mt-6">
              {canGoBack && (
                <button
                  onClick={actions.previousStep}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all bg-white text-optio-purple border-2 border-optio-purple hover:bg-optio-purple/10 min-h-[48px] touch-manipulation order-2 sm:order-1"
                >
                  <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" />
                  <span>Back</span>
                </button>
              )}

              {currentStep < 7 && (
                <button
                  onClick={actions.nextStep}
                  disabled={!canGoForward()}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all min-h-[48px] touch-manipulation order-1 sm:order-2 sm:ml-auto
                    ${canGoForward()
                      ? 'bg-gradient-primary text-white hover:shadow-lg transform hover:scale-105'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <span>Continue</span>
                  <ChevronRightIcon className="w-5 h-5 flex-shrink-0" />
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