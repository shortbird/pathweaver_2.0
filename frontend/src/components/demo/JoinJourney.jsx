import React, { useState } from 'react';
import { ArrowRightIcon, SparklesIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const JoinJourney = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Navigate to register page with email pre-filled
    navigate('/register', { state: { email } });
  };

  const features = [
    {
      icon: '✨',
      text: 'Your child chooses quests that match their interests'
    },
    {
      icon: '🎨',
      text: 'They create real work that builds college-ready portfolios'
    },
    {
      icon: '📈',
      text: 'Track their progress without micromanaging'
    },
    {
      icon: '👨‍👩‍👧‍👦',
      text: 'Stay connected with parent dashboard access'
    },
    {
      icon: '🤖',
      text: '24/7 AI tutor provides safe, monitored support'
    },
    {
      icon: '🎯',
      text: 'Automatic documentation - zero friction for families'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center gap-2">
          <SparklesIcon className="w-8 h-8 text-optio-purple animate-pulse" />
          <h2 className="text-4xl font-bold text-text-primary">
            Ready to Give Your Child This Experience?
          </h2>
          <SparklesIcon className="w-8 h-8 text-optio-pink animate-pulse" />
        </div>

        <p className="text-xl text-gray-700 max-w-2xl mx-auto">
          Join 5,000+ families who are empowering their children's education
        </p>
      </div>

      {/* Features Grid */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100">
        <h3 className="text-center font-bold text-gray-800 mb-6 text-lg">
          What Your Family Gets:
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-start gap-3 bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="text-2xl flex-shrink-0">{feature.icon}</span>
              <p className="text-gray-700 leading-relaxed">{feature.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Email Capture Form */}
      <div className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-6 py-4 rounded-lg border-2 border-gray-300 focus:border-optio-purple focus:outline-none text-lg"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-primary text-white font-bold text-lg px-8 py-4 rounded-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
          >
            <span>Create Your Free Account</span>
            <ArrowRightIcon className="w-6 h-6" />
          </button>
        </form>

        <div className="text-center mt-4 space-y-2">
          <p className="text-sm text-gray-600">
            Free to start • No credit card required
          </p>
          <p className="text-sm text-gray-600">
            Your child can begin their first quest in 2 minutes
          </p>
        </div>
      </div>

      {/* Already Have Account */}
      <div className="text-center pt-4 border-t border-gray-200">
        <p className="text-gray-600">
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-optio-purple font-semibold hover:underline"
          >
            Log In
          </button>
        </p>
      </div>
    </div>
  );
};

export default JoinJourney;
