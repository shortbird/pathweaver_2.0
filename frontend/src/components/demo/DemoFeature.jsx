import React, { useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import DemoHero from './DemoHero';
import DemoQuestGrid from './DemoQuestGrid';
import DemoPersonalization from './DemoPersonalization';
import DemoEvidence from './DemoEvidence';
import DemoPortfolio from './DemoPortfolio';
import { ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const DemoFeature = () => {
  const { demoState, actions } = useDemo();
  const { currentStep } = demoState;

  useEffect(() => {
    // Scroll to top when step changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DemoHero />;
      case 1:
        return <DemoQuestGrid />;
      case 2:
        return <DemoPersonalization />;
      case 3:
        return <DemoEvidence />;
      case 4:
        return <DemoPortfolio />;
      default:
        return <DemoHero />;
    }
  };

  const getStepInfo = () => {
    const steps = [
      { title: 'Experience Learning That Fits You', subtitle: 'See how interests become school credit' },
      { title: 'Pick Something That Excites You', subtitle: 'Every quest earns real school credit' },
      { title: 'Your Interests Shape Your Learning', subtitle: 'AI creates tasks just for you' },
      { title: 'Submit Evidence, Earn Credit', subtitle: 'Photos, videos, reflections - all count' },
      { title: 'Your Portfolio Is Building', subtitle: 'Ready to start your real journey?' }
    ];
    return steps[currentStep] || steps[0];
  };

  const canGoBack = currentStep > 0 && currentStep < 4;

  const canGoForward = () => {
    if (currentStep === 0) return false; // Hero has its own CTA
    if (currentStep >= 4) return false;
    if (currentStep === 1) return !!demoState.selectedQuest; // Need quest selected
    if (currentStep === 2) return demoState.generatedTasks.length > 0; // Need tasks generated
    if (currentStep === 3) return demoState.submittedEvidence !== null; // Need evidence submitted
    return true;
  };

  const stepInfo = getStepInfo();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6d469b]/5 via-white to-[#ef597b]/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Header - show only on steps 1-4 */}
        {currentStep > 0 && currentStep <= 4 && (
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent leading-tight">
                  {stepInfo.title}
                </h2>
                <p className="text-gray-600 mt-1 text-sm sm:text-base">{stepInfo.subtitle}</p>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-4 flex-shrink-0">
                <span className="text-sm text-gray-600">Step {currentStep} of 4</span>
                <button
                  onClick={actions.resetDemo}
                  className="flex items-center gap-1 text-sm text-optio-purple hover:underline py-1 px-2 -mx-2 rounded touch-manipulation"
                >
                  <ArrowPathIcon className="w-4 h-4 flex-shrink-0" />
                  <span>Restart</span>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-primary transition-all duration-500"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="relative">
          <div className={`bg-white rounded-xl sm:rounded-2xl shadow-xl ${currentStep === 0 ? 'p-0' : 'p-4 sm:p-6 lg:p-8'} min-h-[400px] sm:min-h-[500px]`}>
            {renderStep()}
          </div>

          {/* Navigation Buttons - show only on steps 1-3 */}
          {currentStep > 0 && currentStep < 4 && (
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

              {currentStep < 4 && (
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
