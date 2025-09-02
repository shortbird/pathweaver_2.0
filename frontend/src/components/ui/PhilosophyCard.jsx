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
        relative overflow-hidden rounded-xl
        transform transition-all duration-700 ease-out
        hover:shadow-2xl hover:-translate-y-2
        cursor-pointer group h-48
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Icon as background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientClasses} flex items-center justify-center transition-all duration-500`}>
        <div className={`w-full h-full flex items-center justify-center transition-all duration-500 ${isHovered ? 'opacity-20 scale-110' : 'opacity-40'}`}>
          <div className="w-28 h-28 mt-4">
            {getIcon()}
          </div>
        </div>
      </div>

      {/* Title - always visible at top */}
      <div className={`
        absolute top-0 left-0 right-0 p-4 transition-all duration-500 ease-out
        ${isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}>
        <h3 className="text-lg font-bold text-gray-800 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md inline-block">
          {title}
        </h3>
      </div>

      {/* Description - visible on hover */}
      <div className={`
        absolute inset-0 flex flex-col justify-center items-center p-6 transition-all duration-500 ease-out
        bg-gradient-to-br from-white/95 to-white/90 backdrop-blur-sm
        ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}>
        <div className="text-center">
          <h3 className="text-lg font-bold mb-3 text-transparent bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text">
            {title}
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed font-medium">
            {description}
          </p>
        </div>
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
            Learn for today, not someday.
          </p>
        </div>
        
        {/* Philosophy pillars */}
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 relative">
            <PhilosophyCard
              type="present"
              title="Learn Today"
              description="Each skill you build has immediate value. Your growth matters now."
              gradientClasses="from-emerald-100 to-green-100"
              delay={0}
            />
            
            <PhilosophyCard
              type="growth"
              title="Progress Over Perfection"
              description="Every attempt teaches. Mistakes are data. Forward is forward."
              gradientClasses="from-[#ef597b]/20 to-[#6d469b]/20"
              delay={200}
            />
            
            <PhilosophyCard
              type="internal"
              title="Joy of Discovery"
              description="Follow curiosity, not credentials. Create because you want to."
              gradientClasses="from-purple-100 to-pink-100"
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
              Build skills that matter to you, today.
            </p>
            <p className="text-gray-600 max-w-2xl mx-auto relative">
              The diploma is a byproduct of meaningful learning. Focus on growth, not grades.
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