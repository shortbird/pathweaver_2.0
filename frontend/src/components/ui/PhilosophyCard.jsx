import React, { useState, useEffect } from 'react';
import { PresentFocusIcon, GrowthOverAchievementIcon, InternalMotivationIcon } from './PhilosophyIcons';

const PhilosophyCard = ({ 
  type, 
  title, 
  description, 
  gradientClasses = "from-purple-50 to-blue-50",
  delay = 0 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Entrance animation trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const getIcon = () => {
    const iconProps = {
      className: "w-full h-full",
      isHovered
    };

    switch (type) {
      case 'present':
        return <PresentFocusIcon {...iconProps} />;
      case 'growth':
        return <GrowthOverAchievementIcon {...iconProps} />;
      case 'internal':
        return <InternalMotivationIcon {...iconProps} />;
      default:
        return null;
    }
  };

  return (
    <div 
      className={`
        text-center p-6 rounded-xl bg-gradient-to-br ${gradientClasses}
        transform transition-all duration-700 ease-out
        hover:shadow-2xl hover:-translate-y-2
        cursor-pointer group
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Icon Container */}
      <div className={`
        w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 
        shadow-lg transition-all duration-500 ease-out
        ${isHovered ? 'shadow-2xl scale-110 rotate-3' : 'shadow-md'}
        group-hover:bg-gradient-to-br group-hover:from-white group-hover:to-gray-50
      `}>
        <div className="w-12 h-12 transition-transform duration-500 ease-out">
          {getIcon()}
        </div>
      </div>

      {/* Title */}
      <h3 className={`
        text-xl font-bold mb-4 text-gray-800 
        transition-all duration-300 ease-out
        ${isHovered ? 'text-transparent bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text' : ''}
      `}>
        {title}
      </h3>

      {/* Description */}
      <p className={`
        text-gray-600 leading-relaxed transition-all duration-300 ease-out
        ${isHovered ? 'text-gray-700' : ''}
      `}>
        {description}
      </p>

      {/* Hover overlay effect */}
      <div className={`
        absolute inset-0 rounded-xl pointer-events-none
        bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5
        transition-opacity duration-500 ease-out
        ${isHovered ? 'opacity-100' : 'opacity-0'}
      `} />

      {/* Animated border */}
      <div className={`
        absolute inset-0 rounded-xl pointer-events-none
        bg-gradient-to-r from-[#ef597b] via-[#d946ef] to-[#6d469b] p-[2px]
        transition-opacity duration-500 ease-out
        ${isHovered ? 'opacity-100' : 'opacity-0'}
      `}>
        <div className={`w-full h-full rounded-[10px] bg-gradient-to-br ${gradientClasses}`} />
      </div>
    </div>
  );
};

// Main Philosophy Section Component
export const PhilosophySection = ({ onPhilosophyModalOpen }) => {
  return (
    <div className="py-16 sm:py-20 bg-white relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-[#6d469b]/5 to-[#ef597b]/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">The Process Is The Goal</h2>
          <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mx-auto">
            Focus on the journey of learning, not the destination of a credential.
          </p>
        </div>
        
        {/* Philosophy pillars */}
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 relative">
            <PhilosophyCard
              type="present"
              title="Present-Focused Value"
              description="Your learning is valuable now, not someday. Each skill you build, each idea you explore enriches your life today."
              gradientClasses="from-emerald-50 to-green-50"
              delay={0}
            />
            
            <PhilosophyCard
              type="growth"
              title="Growth Over Achievement"
              description="Celebrate attempts, effort, and learning from mistakes. Every step forward is progress, regardless of the outcome."
              gradientClasses="from-[#ef597b]/10 to-[#6d469b]/10"
              delay={200}
            />
            
            <PhilosophyCard
              type="internal"
              title="Internal Motivation"
              description="Learn for the joy of discovery, not external validation. Your curiosity and creativity are the real rewards."
              gradientClasses="from-purple-50 to-pink-50"
              delay={400}
            />
          </div>
          
          {/* Core message */}
          <div className="mt-12 p-8 bg-gradient-to-r from-[#ef597b]/5 to-[#6d469b]/5 rounded-xl text-center relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 25% 25%, #ef597b 1px, transparent 1px),
                                  radial-gradient(circle at 75% 75%, #6d469b 1px, transparent 1px)`,
                backgroundSize: '20px 20px'
              }} />
            </div>
            
            <p className="text-xl font-semibold text-gray-800 mb-4 relative">
              "You're not building a resume. You're becoming who you're meant to be."
            </p>
            <p className="text-gray-600 max-w-2xl mx-auto relative">
              The diploma isn't the goal – it's the beautiful byproduct of a meaningful learning journey. 
              Every quest you complete, every skill you develop, transforms you in ways that matter right now.
            </p>
          </div>
          
          {/* Learn more button */}
          <div className="text-center mt-8">
            <button
              onClick={onPhilosophyModalOpen}
              className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium transition-all duration-300 hover:scale-105 group"
            >
              <div className="mr-2 w-4 h-4 transition-transform duration-300 group-hover:rotate-12">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />
                </svg>
              </div>
              Read Our Full Philosophy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhilosophyCard;