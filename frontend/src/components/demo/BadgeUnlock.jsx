import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { SparklesIcon, TrophyIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

const BadgeUnlock = () => {
  const { demoState, actions } = useDemo();
  const [showRadarChart, setShowRadarChart] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const { earnedXP } = demoState;

  // Badge data based on earned XP
  const badge = {
    id: 'story-seeker',
    name: 'Story Seeker',
    identityStatement: 'I discover and preserve stories that connect generations',
    pillar: 'communication',
    image: '📖',
    progress: {
      quests: 1,
      totalQuests: 5,
      xp: earnedXP.communication || 75,
      totalXP: 300
    }
  };

  const pillars = {
    stem: { name: 'STEM', color: '#4A90E2', value: earnedXP.stem || 0 },
    wellness: { name: 'Wellness', color: '#7ED321', value: earnedXP.wellness || 0 },
    communication: { name: 'Communication', color: '#F5A623', value: earnedXP.communication || 75 },
    civics: { name: 'Civics', color: '#BD10E0', value: earnedXP.civics || 0 },
    art: { name: 'Art', color: '#F8E71C', value: earnedXP.art || 0 }
  };

  useEffect(() => {
    // Animation sequence
    const timer1 = setTimeout(() => setShowRadarChart(true), 500);
    const timer2 = setTimeout(() => {
      setShowBadge(true);
      setShowConfetti(true);

      // Unlock badge in context
      actions.unlockBadge(badge);
      actions.trackInteraction('badge_unlocked', { badgeId: badge.id });
    }, 2000);
    const timer3 = setTimeout(() => setShowConfetti(false), 4000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const maxXP = 100; // For display purposes

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <ArrowTrendingUpIcon className="w-8 h-8 text-optio-purple" />
          <h2 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            You're Growing!
          </h2>
          <ArrowTrendingUpIcon className="w-8 h-8 text-optio-pink" />
        </div>
        <p className="text-gray-600">Watch your skills take shape</p>
      </div>

      {/* Radar Chart Visualization */}
      <div className={`relative transition-all duration-1000 ${showRadarChart ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100">
          <h3 className="text-center font-semibold text-gray-700 mb-6">
            Your Skill Growth Across Five Pillars
          </h3>

          {/* Simplified Radar Chart Representation */}
          <div className="grid grid-cols-5 gap-3 max-w-3xl mx-auto">
            {Object.entries(pillars).map(([key, pillar]) => (
              <div key={key} className="text-center space-y-2">
                <div className="flex flex-col items-center">
                  <div className="relative w-16 h-24 bg-gray-200 rounded-lg overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                      style={{
                        height: `${(pillar.value / maxXP) * 100}%`,
                        backgroundColor: pillar.color
                      }}
                    >
                      {pillar.value > 0 && (
                        <div className="absolute top-1 left-1/2 transform -translate-x-1/2">
                          <SparklesIcon className="w-4 h-4 text-white animate-pulse" />
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-700 mt-2">{pillar.name}</span>
                  <span className="text-lg font-bold" style={{ color: pillar.color }}>
                    {pillar.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-600 mt-6">
            Your Communication skills are taking shape. Keep exploring to unlock more!
          </p>
        </div>
      </div>

      {/* Confetti Effect */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10px',
                backgroundColor: ['#6D469B', '#EF597B', '#4A90E2', '#7ED321', '#F5A623'][Math.floor(Math.random() * 5)],
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      )}

      {/* Badge Unlock */}
      <div className={`transition-all duration-700 ${showBadge ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="bg-gradient-primary rounded-xl p-8 text-white text-center space-y-4 shadow-2xl relative overflow-hidden">
          {/* Animated background */}
          <div className="absolute inset-0 bg-white/10 animate-pulse" />

          <div className="relative z-10">
            <div className="inline-flex items-center justify-center gap-3 mb-4">
              <TrophyIcon className="w-10 h-10" />
              <h3 className="text-3xl font-bold">BADGE UNLOCKED!</h3>
              <TrophyIcon className="w-10 h-10" />
            </div>

            {/* Badge Display */}
            <div className="bg-white/20 backdrop-blur rounded-xl p-6 max-w-md mx-auto">
              <div className="text-6xl mb-4 animate-bounce">
                {badge.image}
              </div>

              <h4 className="text-2xl font-bold mb-3">{badge.name}</h4>

              <p className="text-lg italic mb-4 leading-relaxed">
                "{badge.identityStatement}"
              </p>

              {/* Progress Bars */}
              <div className="space-y-3 text-left">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Quests Completed</span>
                    <span className="font-semibold">{badge.progress.quests}/{badge.progress.totalQuests}</span>
                  </div>
                  <div className="bg-white/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-1000"
                      style={{ width: `${(badge.progress.quests / badge.progress.totalQuests) * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>XP Earned</span>
                    <span className="font-semibold">{badge.progress.xp}/{badge.progress.totalXP}</span>
                  </div>
                  <div className="bg-white/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-1000"
                      style={{ width: `${(badge.progress.xp / badge.progress.totalXP) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Encouragement Message */}
      {showBadge && (
        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6 animate-fadeIn">
          <p className="text-center text-gray-700">
            <span className="font-semibold">Keep going!</span> Each quest you complete helps you
            unlock more badges and discover new strengths.
          </p>
        </div>
      )}
    </div>
  );
};

export default BadgeUnlock;
