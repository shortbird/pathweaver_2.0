import React, { useState, useEffect, useRef } from 'react';
import { 
  PlayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { DEMO_DATA } from '../../utils/demoData';

const DemoHowItWorks = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasStartedAnimation, setHasStartedAnimation] = useState({});
  const sectionRef = useRef(null);
  
  const steps = DEMO_DATA.howItWorksSteps;

  useEffect(() => {
    // Auto-play animations when section comes into view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasStartedAnimation[currentStep]) {
            setIsAnimating(true);
            setHasStartedAnimation(prev => ({ ...prev, [currentStep]: true }));
            
            // Auto-advance after animation
            setTimeout(() => {
              if (currentStep < steps.length - 1) {
                setCurrentStep(prev => prev + 1);
              }
            }, 3000);
          }
        });
      },
      { threshold: 0.5 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, [currentStep, hasStartedAnimation, steps.length]);

  const handleStepClick = (index) => {
    setCurrentStep(index);
    setIsAnimating(true);
    setHasStartedAnimation(prev => ({ ...prev, [index]: true }));
  };

  const handleReplay = () => {
    setIsAnimating(false);
    setTimeout(() => setIsAnimating(true), 100);
  };

  const getAnimationComponent = (animationType) => {
    switch(animationType) {
      case 'quest-cards-shuffle':
        return <QuestCardsShuffle isAnimating={isAnimating} />;
      case 'task-checkoff':
        return <TaskCheckoff isAnimating={isAnimating} />;
      case 'xp-counter':
        return <XPCounter isAnimating={isAnimating} />;
      case 'diploma-share':
        return <DiplomaShare isAnimating={isAnimating} />;
      default:
        return null;
    }
  };

  return (
    <div ref={sectionRef} className="max-w-6xl mx-auto">
      {/* Desktop Layout */}
      <div className="hidden md:block">
        <div className="grid grid-cols-2 gap-12 items-center">
          {/* Left: Step Content */}
          <div className="space-y-8">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`p-6 rounded-xl cursor-pointer transition-all ${
                  currentStep === index
                    ? 'bg-purple-50 border-2 border-purple-500 shadow-lg'
                    : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                }`}
                onClick={() => handleStepClick(index)}
              >
                <div className="flex items-start">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold ${
                    currentStep === index
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {step.number}
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
                      <span className="mr-2 text-2xl">{step.icon}</span>
                      {step.title}
                    </h3>
                    <p className="text-gray-600">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Animation Display */}
          <div className="relative">
            <div className="bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl p-8 h-96 flex items-center justify-center">
              {getAnimationComponent(steps[currentStep].animation)}
            </div>
            
            {/* Animation Controls */}
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                onClick={handleReplay}
                className="p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-all"
                title="Replay animation"
              >
                <ArrowPathIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center mt-8 gap-2">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => handleStepClick(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                currentStep === index
                  ? 'bg-purple-600 w-8'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden"
            >
              {/* Step Header */}
              <div className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
                    {step.number}
                  </div>
                  <h3 className="ml-3 text-lg font-bold flex items-center">
                    <span className="mr-2">{step.icon}</span>
                    {step.title}
                  </h3>
                </div>
              </div>
              
              {/* Step Content */}
              <div className="p-4">
                <p className="text-gray-600 mb-4">{step.description}</p>
                
                {/* Simple Animation Placeholder */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-6 h-40 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-2">{step.icon}</div>
                    <p className="text-sm text-gray-500">Animation preview</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Animation Components
const QuestCardsShuffle = ({ isAnimating }) => {
  const cards = ['🎯', '🎨', '🧠', '🔧'];
  
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {cards.map((icon, index) => (
        <div
          key={index}
          className={`absolute w-24 h-32 bg-white rounded-lg shadow-xl flex items-center justify-center text-4xl transition-all duration-1000 ${
            isAnimating
              ? `transform rotate-${index * 15} translate-x-${(index - 1.5) * 20}`
              : 'transform rotate-0 translate-x-0'
          }`}
          style={{
            transform: isAnimating
              ? `translateX(${(index - 1.5) * 60}px) rotate(${(index - 1.5) * 10}deg)`
              : 'translateX(0) rotate(0)',
            transition: 'all 1s ease-out',
            transitionDelay: `${index * 0.1}s`
          }}
        >
          {icon}
        </div>
      ))}
    </div>
  );
};

const TaskCheckoff = ({ isAnimating }) => {
  const tasks = ['Research', 'Build', 'Document', 'Share'];
  
  return (
    <div className="space-y-3">
      {tasks.map((task, index) => (
        <div
          key={index}
          className={`flex items-center bg-white p-3 rounded-lg shadow transition-all duration-500`}
          style={{
            opacity: isAnimating ? 1 : 0,
            transform: isAnimating ? 'translateX(0)' : 'translateX(-20px)',
            transitionDelay: `${index * 0.2}s`
          }}
        >
          <div className={`w-6 h-6 rounded-full border-2 mr-3 transition-all duration-300 ${
            isAnimating
              ? 'bg-green-500 border-green-500'
              : 'bg-white border-gray-300'
          }`}
          style={{ transitionDelay: `${index * 0.2 + 0.5}s` }}>
            {isAnimating && (
              <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <span className="text-gray-700">{task}</span>
        </div>
      ))}
    </div>
  );
};

const XPCounter = ({ isAnimating }) => {
  const [xp, setXp] = useState(0);
  const targetXP = 250;
  
  useEffect(() => {
    if (isAnimating) {
      const increment = targetXP / 50;
      const timer = setInterval(() => {
        setXp(prev => {
          const next = prev + increment;
          if (next >= targetXP) {
            clearInterval(timer);
            return targetXP;
          }
          return next;
        });
      }, 30);
      return () => clearInterval(timer);
    } else {
      setXp(0);
    }
  }, [isAnimating]);
  
  return (
    <div className="text-center">
      <div className="text-6xl font-bold text-purple-600 mb-4">
        {Math.round(xp)} XP
      </div>
      <div className="flex justify-center gap-2">
        {['🎨', '🧠', '🔧', '💬', '🌍'].map((icon, index) => (
          <div
            key={index}
            className="flex flex-col items-center"
            style={{
              opacity: isAnimating ? 1 : 0,
              transform: isAnimating ? 'scale(1)' : 'scale(0.5)',
              transition: 'all 0.5s ease-out',
              transitionDelay: `${index * 0.1}s`
            }}
          >
            <div className="text-2xl mb-1">{icon}</div>
            <div className="h-16 w-4 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-t from-purple-600 to-purple-400 transition-all duration-1000"
                style={{
                  height: isAnimating ? `${60 + Math.random() * 40}%` : '0%',
                  transitionDelay: `${index * 0.1}s`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DiplomaShare = ({ isAnimating }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Diploma Card */}
      <div className={`bg-white rounded-lg shadow-2xl p-6 w-64 transition-all duration-1000 ${
        isAnimating ? 'transform scale-100 opacity-100' : 'transform scale-75 opacity-0'
      }`}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🎓</div>
          <h4 className="font-bold text-gray-900">Alex's Diploma</h4>
          <p className="text-sm text-gray-600">1,450 XP Earned</p>
        </div>
        <div className="space-y-1">
          <div className="h-2 bg-purple-200 rounded"></div>
          <div className="h-2 bg-blue-200 rounded"></div>
          <div className="h-2 bg-green-200 rounded"></div>
        </div>
      </div>
      
      {/* Share Icons */}
      {isAnimating && (
        <div className="absolute inset-0 pointer-events-none">
          {['📧', '🔗', '📱', '💼'].map((icon, index) => (
            <div
              key={index}
              className="absolute text-2xl"
              style={{
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) rotate(${index * 90}deg) translateY(-80px)`,
                animation: 'pulse 2s infinite',
                animationDelay: `${index * 0.2}s`
              }}
            >
              {icon}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DemoHowItWorks;