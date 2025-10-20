import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Gift, Shield, Star, ArrowRight, CheckCircle, X,
  Users, Calendar, Trophy, Sparkles, Lock, Globe, GraduationCap
} from 'lucide-react';
// import { useSubscriptionTiers, getTierByKey, formatPrice } from '../../hooks/useSubscriptionTiers'; // REMOVED - Phase 3 refactoring (January 2025)

const ConversionPanel = () => {
  const { demoState, actions } = useDemo();
  const navigate = useNavigate();
  // const { data: dbTiers, isLoading: tiersLoading } = useSubscriptionTiers(); // REMOVED - Phase 3 refactoring (January 2025)
  const dbTiers = []
  const tiersLoading = false
  const [selectedTier, setSelectedTier] = useState('supported');
  const [email, setEmail] = useState('');

  // Map database tiers to demo tier structure - NEUTERED (Phase 3 refactoring)
  const exploreTier = null
  const accelerateTier = null
  const excelTier = null

  const tiers = [
    {
      id: 'free',
      name: exploreTier?.display_name || 'Free',
      price: exploreTier ? formatPrice(exploreTier.price_monthly) : '$0',
      period: '',
      description: exploreTier?.description || 'Perfect for exploring the platform',
      features: exploreTier?.features || [
        'Access quest library',
        'Track ongoing quests',
        'Mark tasks complete (no evidence submission)'
      ],
      limitations: exploreTier?.limitations || [
        'XP earned',
        'Optio Portfolio Diploma'
      ],
      cta: 'Start Free',
      recommended: false
    },
    {
      id: 'supported',
      name: accelerateTier?.display_name || 'Supported',
      price: accelerateTier ? formatPrice(accelerateTier.price_monthly) : '$50',
      period: '/mo',
      description: accelerateTier?.description || 'For dedicated learners ready to grow',
      features: accelerateTier?.features || [
        'Everything in Free, plus:',
        'Access to a support team of Optio educators',
        'Unlimited access to all Optio quest features',
        'Team up with other Supported learners for XP bonuses',
        'Optio Portfolio Diploma'
      ],
      limitations: accelerateTier?.limitations || [
        'Traditionally-accredited Diploma'
      ],
      cta: `Get ${accelerateTier?.display_name || 'Supported'}`,
      recommended: true
    },
    {
      id: 'academy',
      name: excelTier?.display_name || 'Academy',
      price: excelTier ? formatPrice(excelTier.price_monthly) : '$600',
      period: '/mo',
      description: excelTier?.description || 'A personalized private school experience',
      features: excelTier?.features || [
        'Everything in Supported, plus:',
        'TWO diplomas: Optio Portfolio + Accredited HS Diploma',
        'Personal learning guide & 1-on-1 teacher support',
        'Regular check-ins with licensed educators',
        "Connect with Optio's network of business leaders and mentors"
      ],
      limitations: excelTier?.limitations || [],
      cta: `Join ${excelTier?.display_name || 'Academy'}`,
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
            <div className="mb-6 pt-2">
              <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
              <p className="text-3xl font-bold mb-1">
                {tier.price}
                {tier.period && <span className="text-lg font-normal text-gray-600">{tier.period}</span>}
              </p>
              <p className="text-gray-600">{tier.description}</p>
            </div>

            {/* Features */}
            <div className="mb-6">
              {tier.features[0]?.includes('Everything in') && (
                <div className="text-sm font-semibold text-[#ef597b] mb-3">{tier.features[0]}</div>
              )}
              <ul className="space-y-3">
                {tier.features.slice(tier.features[0]?.includes('Everything in') ? 1 : 0).map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className={`text-gray-700 ${feature.includes('TWO diplomas') || feature.includes('Optio Portfolio Diploma') ? 'font-semibold' : ''}`}>
                      {feature}
                    </span>
                  </li>
                ))}
                
                {/* Limitations */}
                {tier.limitations.map((limitation, index) => (
                  <li key={`limit-${index}`} className="flex items-start">
                    <X className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-500 line-through">
                      {limitation}
                    </span>
                  </li>
                ))}
              </ul>
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