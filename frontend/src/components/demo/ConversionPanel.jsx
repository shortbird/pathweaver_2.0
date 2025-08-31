import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, Gift, Shield, Star, ArrowRight, CheckCircle,
  Users, Calendar, Trophy, Sparkles, Lock
} from 'lucide-react';
import DiplomaDisplay from './DiplomaDisplay';

const ConversionPanel = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const navigate = useNavigate();
  const [selectedTier, setSelectedTier] = useState('explorer');
  const [email, setEmail] = useState('');
  
  const isParent = demoState.persona === 'parent';

  const tiers = [
    {
      id: 'explorer',
      name: 'Explorer',
      price: 'Free',
      description: 'Perfect for trying out Optio',
      features: [
        '3 active quests at a time',
        'Basic portfolio features',
        'Community support',
        'Public diploma page'
      ],
      cta: 'Start Free',
      recommended: false
    },
    {
      id: 'creator',
      name: 'Creator',
      price: '$39.99/mo',
      description: 'For serious learners',
      features: [
        'Unlimited active quests',
        'Custom quest submissions',
        'Priority support',
        'Advanced portfolio features',
        'Progress analytics'
      ],
      cta: 'Start 7-Day Trial',
      recommended: !isParent
    },
    {
      id: 'visionary',
      name: 'Visionary',
      price: '$499.99/mo',
      description: 'Accredited education with support',
      features: [
        'ACCREDITED HIGH SCHOOL DIPLOMA',
        'Weekly 1-on-1 teacher sessions',
        'College prep & counseling',
        'Parent progress reports',
        'All Creator features',
        'Transcript management'
      ],
      cta: 'Schedule Consultation',
      recommended: isParent,
      badge: 'ACCREDITED'
    }
  ];

  const handleSignup = () => {
    actions.trackInteraction('signup_started', { 
      tier: selectedTier,
      email: email,
      persona: demoState.persona
    });
    
    // In real app, would handle signup
    navigate('/register', { 
      state: { 
        tier: selectedTier, 
        fromDemo: true,
        persona: demoState.persona 
      } 
    });
  };

  const completedQuest = demoState.selectedQuest?.title || 'your first quest';
  const earnedXP = Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0);

  return (
    <div className="space-y-8">
      {/* Congratulations Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex p-4 bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-full mb-4">
          <Trophy className="w-16 h-16 text-[#FFCA3A]" />
        </div>
        
        <h2 className="text-4xl font-bold text-[#003f5c]">
          Congratulations! 🎉
        </h2>
        
        <p className="text-xl text-gray-700 max-w-2xl mx-auto">
          You just completed <span className="font-semibold text-[#6d469b]">{completedQuest}</span> and 
          earned <span className="font-semibold text-[#ef597b]">{earnedXP} XP</span>!
        </p>
        
        <p className="text-lg text-gray-600">
          {isParent 
            ? "Your child's Optio diploma would look like this:"
            : "Your Optio diploma would look like this:"}
        </p>
      </div>

      {/* Full Diploma Display */}
      <DiplomaDisplay 
        userName={demoState.userInputs.name || demoState.userInputs.childName || 'Demo Student'}
        allQuests={demoQuests}
        earnedXP={demoState.earnedXP}
        isAccredited={selectedTier === 'visionary'}
      />

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            onClick={() => setSelectedTier(tier.id)}
            className={`relative cursor-pointer rounded-2xl p-6 transition-all duration-300
              ${selectedTier === tier.id 
                ? 'bg-gradient-to-br from-[#6d469b]/10 to-[#ef597b]/10 border-2 border-[#6d469b] shadow-xl transform -translate-y-2' 
                : 'bg-white border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg'}`}
          >
            {/* Recommended Badge */}
            {tier.recommended && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="px-4 py-1 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white text-xs font-bold rounded-full">
                  RECOMMENDED FOR YOU
                </span>
              </div>
            )}

            {/* Accredited Badge */}
            {tier.badge && (
              <div className="absolute -top-3 right-4">
                <div className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                  <Shield className="w-3 h-3" />
                  {tier.badge}
                </div>
              </div>
            )}

            {/* Tier Header */}
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-[#003f5c] mb-2">{tier.name}</h3>
              <div className="text-3xl font-bold text-[#6d469b] mb-2">{tier.price}</div>
              <p className="text-sm text-gray-600">{tier.description}</p>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-6">
              {tier.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5
                    ${feature.includes('ACCREDITED') ? 'text-green-500' : 'text-[#6d469b]'}`} />
                  <span className={`text-sm ${feature.includes('ACCREDITED') ? 'font-bold text-gray-800' : 'text-gray-700'}`}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            {/* Selection Indicator */}
            {selectedTier === tier.id && (
              <div className="absolute inset-0 border-2 border-[#6d469b] rounded-2xl pointer-events-none">
                <div className="absolute top-2 right-2">
                  <div className="w-8 h-8 bg-[#6d469b] rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Email Capture */}
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-lg">
        <h3 className="text-2xl font-bold text-[#003f5c] mb-4 text-center">
          Ready to Start Your Journey?
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isParent ? "Parent's Email Address" : "Your Email Address"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isParent ? "parent@example.com" : "you@example.com"}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#6d469b] focus:outline-none"
            />
          </div>

          {isParent && (
            <div className="bg-[#6d469b]/5 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <Lock className="w-4 h-4 inline mr-1 text-[#6d469b]" />
                We'll send you information about setting up your child's account and 
                {selectedTier === 'visionary' && ' schedule a consultation call for the Visionary tier.'}
              </p>
            </div>
          )}

          <button
            onClick={handleSignup}
            disabled={!email}
            className={`w-full py-4 font-bold text-lg rounded-lg transition-all duration-300 flex items-center justify-center gap-3
              ${email 
                ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white hover:shadow-xl transform hover:scale-[1.02]' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            <Rocket className="w-6 h-6" />
            {tiers.find(t => t.id === selectedTier)?.cta || 'Get Started'}
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Guarantees */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <div className="text-center">
          <Gift className="w-10 h-10 text-[#6d469b] mx-auto mb-2" />
          <p className="font-semibold text-gray-700">30-Day Guarantee</p>
          <p className="text-sm text-gray-600">Full refund if not satisfied</p>
        </div>
        <div className="text-center">
          <Shield className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-gray-700">Secure & Private</p>
          <p className="text-sm text-gray-600">Your data is always protected</p>
        </div>
        <div className="text-center">
          <Users className="w-10 h-10 text-[#ef597b] mx-auto mb-2" />
          <p className="font-semibold text-gray-700">Growing Community</p>
          <p className="text-sm text-gray-600">Join families choosing a new path</p>
        </div>
      </div>

    </div>
  );
};

export default ConversionPanel;