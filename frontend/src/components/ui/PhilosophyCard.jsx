import React from 'react';
import { Clock, TrendingUp, Heart } from 'lucide-react';

const PhilosophyCard = ({ 
  icon: Icon,
  title, 
  description, 
  gradientClasses = "from-purple-50 to-blue-50"
}) => {
  return (
    <div className={`p-6 rounded-xl bg-gradient-to-br ${gradientClasses} border border-gray-100`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <Icon className="w-5 h-5 text-optio-purple mt-1" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
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
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-optio-pink/5 to-optio-purple/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 rounded-full blur-3xl" />
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
          <div className="grid md:grid-cols-3 gap-6">
            <PhilosophyCard
              icon={Clock}
              title="Learn Today"
              description="Each skill you build has immediate value. Your growth matters now."
              gradientClasses="from-purple-50 to-blue-50"
            />
            
            <PhilosophyCard
              icon={TrendingUp}
              title="Progress Over Perfection"
              description="Every attempt teaches. Mistakes are data. Forward is forward."
              gradientClasses="from-[#ef597b]/10 to-[#6d469b]/10"
            />
            
            <PhilosophyCard
              icon={Heart}
              title="Joy of Discovery"
              description="Follow curiosity, not credentials. Create because you want to."
              gradientClasses="from-pink-50 to-purple-50"
            />
          </div>
          
          {/* Core message */}
          <div className="mt-12 p-8 bg-gradient-to-r from-optio-pink/5 to-optio-purple/5 rounded-xl text-center relative overflow-hidden">
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
              className="inline-flex items-center text-optio-pink hover:text-[#e54469] font-medium transition-all duration-300 hover:scale-105 group"
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