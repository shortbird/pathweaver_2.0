import React, { useState } from 'react';
import { ArrowRight, Sparkles, CheckCircle } from 'lucide-react';
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
      text: 'Choose quests that spark your curiosity'
    },
    {
      icon: '🎨',
      text: 'Create real things that matter to you'
    },
    {
      icon: '📈',
      text: 'Watch your skills grow naturally'
    },
    {
      icon: '👨‍👩‍👧‍👦',
      text: 'Share the journey with family'
    },
    {
      icon: '🤖',
      text: 'Get help whenever you need it'
    },
    {
      icon: '🎯',
      text: 'Build a portfolio that tells your unique story'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center gap-2">
          <Sparkles className="w-8 h-8 text-optio-purple animate-pulse" />
          <h2 className="text-4xl font-bold text-text-primary">
            Ready to Start Your Story?
          </h2>
          <Sparkles className="w-8 h-8 text-optio-pink animate-pulse" />
        </div>

        <p className="text-xl text-gray-700 max-w-2xl mx-auto">
          Join 5,000+ learners who are discovering what they're capable of
        </p>
      </div>

      {/* Features Grid */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100">
        <h3 className="text-center font-bold text-gray-800 mb-6 text-lg">
          What You'll Experience:
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
            <ArrowRight className="w-6 h-6" />
          </button>
        </form>

        <div className="text-center mt-4 space-y-2">
          <p className="text-sm text-gray-600">
            Free forever • No credit card required
          </p>
          <p className="text-sm text-gray-600">
            Start your first quest in 2 minutes
          </p>
        </div>
      </div>

      {/* Philosophy Reminder */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-8 max-w-3xl mx-auto">
        <div className="text-center space-y-4">
          <p className="text-gray-800 font-semibold text-lg">
            Remember:
          </p>
          <div className="space-y-2 text-gray-700">
            <p className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span>You're already enough</span>
            </p>
            <p className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span>You're growing at the perfect pace</span>
            </p>
            <p className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span>You're creating something meaningful</span>
            </p>
          </div>
          <p className="text-sm text-gray-600 italic mt-4">
            "The Process Is The Goal" - Learning happens through the journey
          </p>
        </div>
      </div>

      {/* Social Proof */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          {[...Array(5)].map((_, i) => (
            <span key={i} className="text-yellow-400 text-2xl">⭐</span>
          ))}
        </div>
        <p className="text-gray-600 italic">
          "Optio helped me discover skills I didn't know I had. Now colleges can see what I'm actually capable of!"
        </p>
        <p className="text-sm text-gray-500">- Sarah M., Optio Student</p>
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
