import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, Gift, Shield, Star, ArrowRight, CheckCircle,
  Users, Calendar, Trophy, Sparkles, Lock
} from 'lucide-react';

const ConversionPanel = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const navigate = useNavigate();
  const [selectedTier, setSelectedTier] = useState('free');
  const [email, setEmail] = useState('');
  
  const isParent = demoState.persona === 'parent';

  const tiers = [
    {
      id: 'free',
      name: 'Free',
      price: 'Free',
      description: 'Perfect for curiosity and personal enrichment',
      features: [
        'Access quest library',
        'Track ongoing quests',
        'Earn XP for completing quests',
        'Optio Portfolio Diploma'
      ],
      cta: 'Start Free',
      recommended: false
    },
    {
      id: 'supported',
      name: 'Supported',
      price: '$39.99/mo',
      description: 'For dedicated learners ready to grow',
      features: [
        'Everything in Free, plus:',
        'Access to a support team of Optio educators',
        'Team up with other Supported learners for XP bonuses',
        'Optio Portfolio Diploma (non-accredited)'
      ],
      cta: 'Get Supported',
      recommended: true
    },
    {
      id: 'academy',
      name: 'Academy',
      price: '$499.99/mo',
      description: 'A personalized private school experience',
      features: [
        'Everything in Supported, plus:',
        'TWO diplomas: Optio Portfolio + Accredited HS Diploma',
        'Personal learning guide & 1-on-1 teacher support',
        'Regular check-ins with licensed educators',
        "Connect with Optio's network of business leaders and mentors"
      ],
      cta: 'Join Academy',
      recommended: false,
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
      {/* Header */}
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-[#003f5c]">
          Choose Your Learning Path
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          {isParent 
            ? "Select the plan that best fits your child's educational journey"
            : "Pick the plan that matches your learning goals"}
        </p>
      </div>

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
            {/* Badges - positioned to not overlap */}
            <div className="absolute -top-3 left-0 right-0 flex justify-between px-4">
              {tier.recommended && (
                <span className="px-3 py-1 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs font-bold rounded-full">
                  RECOMMENDED
                </span>
              )}
              {tier.badge && (
                <div className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                  <Shield className="w-3 h-3" />
                  {tier.badge}
                </div>
              )}
            </div>

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
                {selectedTier === 'academy' && ' schedule a consultation call for the Academy tier.'}
              </p>
            </div>
          )}

          <button
            onClick={handleSignup}
            disabled={!email}
            className={`w-full py-4 font-bold text-lg rounded-lg transition-all duration-300 flex items-center justify-center gap-3
              ${email 
                ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-xl transform hover:scale-[1.02]' 
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