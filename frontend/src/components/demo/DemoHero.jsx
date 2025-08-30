import React, { useState, useEffect } from 'react';

const DemoHero = ({ title, ctaText, onCtaClick, onScrollToDemo }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentWord, setCurrentWord] = useState(0);
  
  const rotatingWords = ['Adventure', 'Portfolio', 'Achievement', 'Journey'];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWord((prev) => (prev + 1) % rotatingWords.length);
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 500);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        
        {/* Floating shapes */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-8">
          <span className="text-yellow-300 mr-2">✨</span>
          <span className="text-white font-medium">Interactive Demo - No Signup Required</span>
        </div>

        {/* Main Title */}
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
          {title || 'See How Learning Becomes an'}
          <span className="block mt-2">
            <span 
              className={`inline-block transition-all duration-500 ${
                isAnimating ? 'opacity-0 transform translate-y-4' : 'opacity-100'
              }`}
            >
              <span className="bg-gradient-to-r from-yellow-300 to-orange-400 bg-clip-text text-transparent">
                {rotatingWords[currentWord]}
              </span>
            </span>
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-purple-100 mb-12 max-w-3xl mx-auto">
          Watch Alex's journey from curious student to accomplished learner. 
          See real quests, real evidence, and a real portfolio in action.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <button
            onClick={onScrollToDemo}
            className="group px-8 py-4 bg-white text-purple-600 font-bold rounded-lg hover:bg-purple-50 transform hover:scale-105 transition-all shadow-2xl flex items-center justify-center"
          >
            <span className="mr-2">▶️</span>
            Try Demo Now
            <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </button>
          
          <button
            onClick={onCtaClick}
            className="px-8 py-4 bg-purple-700/50 backdrop-blur-sm text-white font-bold rounded-lg hover:bg-purple-700 transition-all border-2 border-purple-400/50"
          >
            {ctaText || 'Start Your Journey'}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mb-12">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">12</div>
            <div className="text-purple-200">Quests Completed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">1,450</div>
            <div className="text-purple-200">XP Earned</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">67</div>
            <div className="text-purple-200">Hours Learning</div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <button 
          onClick={onScrollToDemo}
          className="animate-bounce"
          aria-label="Scroll to demo"
        >
          <span className="text-3xl text-white/70 hover:text-white transition-colors">⌄</span>
        </button>
      </div>

      {/* Feature highlights */}
      <div className="absolute bottom-10 left-10 right-10 flex justify-between text-white/70 text-sm">
        <div className="hidden md:flex items-center">
          <span className="mr-2">✓</span> No credit card required
        </div>
        <div className="hidden md:flex items-center">
          <span className="mr-2">✓</span> See real student work
        </div>
        <div className="hidden md:flex items-center">
          <span className="mr-2">✓</span> Interactive experience
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default DemoHero;