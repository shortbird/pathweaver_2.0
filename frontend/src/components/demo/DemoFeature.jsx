import React, { useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import DemoHero from './DemoHero';
import PersonaSelector from './PersonaSelector';
import DiplomaIntroduction from './DiplomaIntroduction';
import QuestExperience from './QuestExperience';
import DiplomaCertificate from './DiplomaCertificate';
import ComparisonView from './ComparisonView';
import ConversionPanel from './ConversionPanel';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DemoFeature = () => {
  const { demoState, actions } = useDemo();
  const { currentStep, persona } = demoState;

  useEffect(() => {
    // Track demo start
    if (currentStep === 0) {
      actions.trackInteraction('demo_started');
    }
  }, []);

  useEffect(() => {
    // Scroll to top when step changes
    window.scrollTo(0, 0);
  }, [currentStep]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DemoHero onStart={() => actions.nextStep()} />;
      case 1:
        return <PersonaSelector />;
      case 2:
        return <DiplomaIntroduction />;
      case 3:
        return <QuestExperience />;
      case 4:
        return <DiplomaCertificate />;
      case 5:
        return <ComparisonView />;
      case 6:
        return <ConversionPanel />;
      default:
        return <DemoHero onStart={() => actions.nextStep()} />;
    }
  };

  const getStepTitle = () => {
    const titles = [
      'Welcome to Optio',
      'Who are you?',
      'Understanding Your Diploma',
      'Experience a Quest',
      'Your Optio Portfolio Diploma',
      'See the Difference',
      'Start Your Journey'
    ];
    return titles[currentStep] || '';
  };

  const canGoBack = currentStep > 0 && currentStep < 7;
  const canGoForward = currentStep > 1 && currentStep < 6 && 
    (currentStep !== 3 || demoState.completedTasks.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6d469b]/5 via-white to-[#ef597b]/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Indicator */}
        {currentStep > 0 && currentStep <= 6 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-[#003f5c]">{getStepTitle()}</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Step {currentStep} of 6</span>
                <button
                  onClick={actions.resetDemo}
                  className="text-sm text-[#6d469b] hover:underline"
                >
                  Restart Demo
                </button>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] transition-all duration-500"
                style={{ width: `${(currentStep / 6) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="relative">
          <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[500px]">
            {renderStep()}
          </div>

          {/* Navigation */}
          {(canGoBack || canGoForward) && (
            <div className="flex justify-between mt-6">
              <button
                onClick={actions.previousStep}
                disabled={!canGoBack}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
                  ${canGoBack 
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' 
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
              >
                <ChevronLeft className="w-5 h-5" />
                Back
              </button>

              <button
                onClick={currentStep === 6 ? actions.resetDemo : actions.nextStep}
                disabled={currentStep === 6 ? false : !canGoForward}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
                  ${(currentStep === 6 || canGoForward) 
                    ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg' 
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
              >
                {currentStep === 6 ? 'Exit Demo' : 'Next'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Demo Timer */}
      </div>
    </div>
  );
};

export default DemoFeature;