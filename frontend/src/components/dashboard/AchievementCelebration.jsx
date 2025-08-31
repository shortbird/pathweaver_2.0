import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';

const AchievementCelebration = ({ latestAchievement, onDismiss }) => {
  const [show, setShow] = useState(false);
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    if (latestAchievement) {
      setShow(true);
      // Generate confetti particles
      const particles = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2
      }));
      setConfetti(particles);
      
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [latestAchievement]);

  const handleDismiss = () => {
    setShow(false);
    setTimeout(() => {
      onDismiss && onDismiss();
    }, 300);
  };

  if (!show || !latestAchievement) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      {/* Confetti Animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confetti.map(particle => (
          <div
            key={particle.id}
            className="absolute w-2 h-2 bg-gradient-to-br from-purple-500 to-pink-500"
            style={{
              left: `${particle.x}%`,
              animation: `fall ${particle.duration}s linear ${particle.delay}s infinite`,
              transform: 'rotate(45deg)'
            }}
          />
        ))}
      </div>

      {/* Celebration Card */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale">
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white text-center">
          <div className="text-6xl mb-4 animate-bounce">🎉</div>
          <h2 className="text-3xl font-bold mb-2">Congratulations!</h2>
          <p className="text-white/90">You've achieved something amazing!</p>
        </div>
        
        <div className="p-6">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {latestAchievement.type === 'quest' ? 'Quest Completed!' : 'Milestone Reached!'}
            </h3>
            <p className="text-gray-600">
              {latestAchievement.title || 'Great job on your progress!'}
            </p>
          </div>

          {/* Achievement Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">
                +{latestAchievement.xpEarned || 0}
              </div>
              <div className="text-xs text-gray-600">XP Earned</div>
            </div>
            <div className="bg-pink-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-pink-600">
                {latestAchievement.tasksCompleted || 0}
              </div>
              <div className="text-xs text-gray-600">Tasks Done</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => window.location.href = '/diploma'}
            >
              View Diploma
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDismiss}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
        @keyframes scale {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default AchievementCelebration;