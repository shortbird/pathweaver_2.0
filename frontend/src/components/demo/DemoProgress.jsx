import React, { useState, useEffect } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const DemoProgress = ({ progress, sectionsViewed, onSectionClick }) => {
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (progress === 100 && !showConfetti) {
      setShowConfetti(true);
      // Show confetti for 3 seconds
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [progress]);

  const checkpoints = [
    { id: 'hero', name: 'Started Demo', percent: 0, icon: '🚀' },
    { id: 'diploma', name: 'Viewed Diploma', percent: 25, icon: '🎓' },
    { id: 'quests', name: 'Browsed Quests', percent: 50, icon: '🎯' },
    { id: 'how-it-works', name: 'Learned Process', percent: 75, icon: '📚' },
    { id: 'testimonials', name: 'Demo Complete', percent: 100, icon: '🏆' }
  ];

  const getCheckpointStatus = (checkpoint) => {
    if (sectionsViewed.has(checkpoint.id)) return 'completed';
    if (progress >= checkpoint.percent) return 'active';
    return 'inactive';
  };

  // Desktop Progress Bar
  const DesktopProgress = () => (
    <div className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-lg z-40 px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Demo Progress</span>
          <span className="text-sm font-bold text-purple-600">{progress}% Complete</span>
        </div>
        
        {/* Progress Bar */}
        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
          
          {/* Checkpoint Markers */}
          {checkpoints.map(checkpoint => (
            <div
              key={checkpoint.id}
              className="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 cursor-pointer group"
              style={{ left: `${checkpoint.percent}%` }}
              onClick={() => onSectionClick && onSectionClick({ current: document.querySelector(`[data-section="${checkpoint.id}"]`) })}
            >
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                getCheckpointStatus(checkpoint) === 'completed'
                  ? 'bg-purple-600 border-purple-600'
                  : getCheckpointStatus(checkpoint) === 'active'
                  ? 'bg-white border-purple-600'
                  : 'bg-white border-gray-300'
              }`}>
                {getCheckpointStatus(checkpoint) === 'completed' ? (
                  <CheckCircleIcon className="w-4 h-4 text-white" />
                ) : (
                  <div className={`w-2 h-2 rounded-full ${
                    getCheckpointStatus(checkpoint) === 'active' ? 'bg-purple-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
              
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap">
                  <span className="mr-1">{checkpoint.icon}</span>
                  {checkpoint.name}
                </div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Achievement Message */}
        {progress === 100 && (
          <div className="mt-2 text-center">
            <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium animate-pulse">
              <span className="mr-1">🎉</span>
              Demo Master Achievement Unlocked!
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // Mobile Circular Progress
  const MobileProgress = () => (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="relative">
        {/* Circular Progress */}
        <svg className="w-16 h-16 transform -rotate-90">
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="rgb(229, 231, 235)"
            strokeWidth="4"
            fill="white"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="url(#gradient)"
            strokeWidth="4"
            fill="none"
            strokeDasharray={`${2 * Math.PI * 28}`}
            strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
            className="transition-all duration-500 ease-out"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(168, 85, 247)" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Percentage Text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-purple-600">
            {progress}%
          </span>
        </div>

        {/* Completion Badge */}
        {progress === 100 && (
          <div className="absolute -top-2 -right-2">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center animate-bounce">
              <span className="text-white text-xs">✓</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Confetti Animation
  const Confetti = () => (
    <div className="fixed inset-0 pointer-events-none z-50">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute animate-fall"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 2}s`
          }}
        >
          <div
            className="text-2xl"
            style={{
              transform: `rotate(${Math.random() * 360}deg)`,
              animation: 'spin 3s linear infinite'
            }}
          >
            {['🎉', '🎊', '✨', '🌟', '🎈'][Math.floor(Math.random() * 5)]}
          </div>
        </div>
      ))}
      
      <style jsx>{`
        @keyframes fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-fall {
          animation: fall linear;
        }
      `}</style>
    </div>
  );

  return (
    <>
      {isMobile ? <MobileProgress /> : <DesktopProgress />}
      {showConfetti && <Confetti />}
    </>
  );
};

export default DemoProgress;