import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, Gift, Shield, Star, ArrowRight, CheckCircle, X,
  Users, Calendar, Trophy, Sparkles, Lock, Globe, GraduationCap
} from 'lucide-react';

const ConversionPanel = () => {
  const { demoState, actions } = useDemo();
  const navigate = useNavigate();
  const [selectedTier, setSelectedTier] = useState('creator');
  const [email, setEmail] = useState('');

  const tiers = [
    {
      id: 'explorer',
      name: 'Explorer',
      price: '$0',
      period: '/month',
      description: 'Start your diploma journey',
      features: [
        'Get your diploma on Day 1',
        'Browse 100+ quests',
        'Track quest progress',
        'Basic public portfolio',
        'Limited to 3 active quests'
      ],
      limitations: [
        'No work submission',
        'No XP earning',
        'No skills radar chart'
      ],
      cta: 'Start Free',
      recommended: false
    },
    {
      id: 'creator',
      name: 'Creator',
      price: '$19',
      period: '/month',
      description: 'Build your public portfolio',
      features: [
        'Everything in Explorer, plus:',
        'Submit unlimited public work',
        'Earn XP across all 5 pillars',
        'Full public diploma with radar chart',
        'Unlimited active quests',
        'Confidential work option',
        'Share diploma URL'
      ],
      limitations: [],
      cta: 'Become a Creator',
      recommended: true
    },
    {
      id: 'visionary',
      name: 'Visionary',
      price: '$99',
      period: '/month',
      description: 'Get support & accreditation',
      features: [
        'Everything in Creator, plus:',
        'Weekly 1-on-1 mentor sessions',
        'Accredited high school diploma',
        'Priority quest suggestions',
        'College application support',
        'Transcript services',
        'Parent dashboard access'
      ],
      limitations: [],
      cta: 'Join Visionary',
      recommended: false,
      badge: 'ACCREDITED'
    }
  ];

  const handleSignup = () => {
    actions.trackInteraction('signup_started', { 
      tier: selectedTier,
      email: email,
      questsSelected: demoState.selectedQuests.length,
      workSubmitted: demoState.submittedWork.length
    });
    
    navigate('/register', { 
      state: { 
        tier: selectedTier, 
        fromDemo: true
      } 
    });
  };

  const workSubmitted = demoState.submittedWork.length;
  const publicWork = demoState.submittedWork.filter(w => w.visibility === 'public').length;

  return (
    <div className="space-y-8">
      {/* Header with Student Validation Focus */}
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-bold text-[#003f5c]">
          Start Your Diploma Today
        </h2>
        <p className="text-xl text-gray-700 max-w-3xl mx-auto">
          You've seen how student validation works. Join thousands building impressive portfolios through public accountability.
        </p>
        
        {/* Demo Summary */}
        {workSubmitted > 0 && (
          <div className="inline-flex items-center gap-6 px-6 py-3 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-full">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#6d469b]" />
              <span className="text-sm font-medium">{publicWork} Public Submissions</span>
            </div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#ef597b]" />
              <span className="text-sm font-medium">{demoState.selectedQuests.length} Quests Started</span>
            </div>
          </div>
        )}
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
            {/* Badges */}
            {tier.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs font-bold rounded-full">
                  MOST POPULAR
                </span>
              </div>
            )}
            {tier.badge && (
              <div className="absolute -top-3 right-4">
                <div className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                  <Shield className="w-3 h-3" />
                  {tier.badge}
                </div>
              </div>
            )}

            {/* Tier Header */}
            <div className="text-center mb-6 pt-2">
              <h3 className="text-2xl font-bold text-[#003f5c] mb-2">{tier.name}</h3>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
                  {tier.price}
                </span>
                <span className="text-gray-600">{tier.period}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">{tier.description}</p>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-6">
              {tier.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5
                    ${feature.includes('Accredited') ? 'text-green-500' : 'text-[#6d469b]'}`} />
                  <span className={`text-sm ${
                    feature.includes('Everything in') ? 'font-semibold text-gray-800' : 'text-gray-700'
                  }`}>
                    {feature}
                  </span>
                </div>
              ))}
              
              {/* Limitations */}
              {tier.limitations.map((limitation, index) => (
                <div key={`limit-${index}`} className="flex items-start gap-2">
                  <X className="w-5 h-5 flex-shrink-0 mt-0.5 text-gray-400" />
                  <span className="text-sm text-gray-500 line-through">
                    {limitation}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <button
              className={`w-full py-3 rounded-lg font-semibold transition-all
                ${selectedTier === tier.id
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {tier.cta}
            </button>

            {/* Selection Indicator */}
            {selectedTier === tier.id && (
              <div className="absolute top-4 right-4">
                <div className="w-8 h-8 bg-[#6d469b] rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Key Value Props */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-2xl p-8">
        <h3 className="text-2xl font-bold text-[#003f5c] text-center mb-6">
          Why Student Validation Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Globe className="w-8 h-8 text-[#6d469b]" />
            </div>
            <h4 className="font-semibold text-[#003f5c] mb-2">Public Portfolio</h4>
            <p className="text-sm text-gray-600">
              Your work speaks for itself when it's visible to the world
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
              <GraduationCap className="w-8 h-8 text-[#ef597b]" />
            </div>
            <h4 className="font-semibold text-[#003f5c] mb-2">Diploma Day 1</h4>
            <p className="text-sm text-gray-600">
              Start with your diploma, make it impressive through real work
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Users className="w-8 h-8 text-[#6d469b]" />
            </div>
            <h4 className="font-semibold text-[#003f5c] mb-2">Self-Accountability</h4>
            <p className="text-sm text-gray-600">
              You own your education through genuine achievement
            </p>
          </div>
        </div>
      </div>

      {/* Email Capture */}
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-lg">
        <h3 className="text-2xl font-bold text-[#003f5c] mb-2 text-center">
          Claim Your Diploma Now
        </h3>
        <p className="text-gray-600 text-center mb-6">
          Join before midnight and get 20% off your first month
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#6d469b] focus:outline-none"
            />
          </div>

          <button
            onClick={handleSignup}
            disabled={!email}
            className={`w-full py-4 font-bold text-lg rounded-lg transition-all duration-300 flex items-center justify-center gap-3
              ${email 
                ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-xl transform hover:scale-[1.02]' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            <Rocket className="w-6 h-6" />
            Get Your Diploma Today
            <ArrowRight className="w-6 h-6" />
          </button>
          
          <p className="text-xs text-gray-500 text-center">
            No credit card required for Explorer tier • Cancel anytime
          </p>
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <div className="text-center">
          <Gift className="w-10 h-10 text-[#6d469b] mx-auto mb-2" />
          <p className="font-semibold text-gray-700">30-Day Guarantee</p>
          <p className="text-sm text-gray-600">Full refund if not satisfied</p>
        </div>
        <div className="text-center">
          <Shield className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-gray-700">Student Privacy</p>
          <p className="text-sm text-gray-600">You control what's public</p>
        </div>
        <div className="text-center">
          <Users className="w-10 h-10 text-[#ef597b] mx-auto mb-2" />
          <p className="font-semibold text-gray-700">5,000+ Students</p>
          <p className="text-sm text-gray-600">Building impressive portfolios</p>
        </div>
      </div>
    </div>
  );
};

export default ConversionPanel;