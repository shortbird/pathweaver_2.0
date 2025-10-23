import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Star, Users, Trophy } from 'lucide-react';
import Button from './ui/Button';

const UpgradePrompt = ({ 
  isOpen, 
  onClose, 
  feature = "this feature",
  context = "general" 
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const getFeatureContent = () => {
    switch (context) {
      case 'quest_start':
        return {
          title: 'Start Your Learning Journey',
          description: 'Unlock quest completion, earn XP, and build your impressive portfolio diploma.',
          features: [
            'Complete tasks with evidence submission',
            'Earn XP across all skill pillars', 
            'Track your learning progress',
            'Build your public portfolio diploma'
          ]
        };
      case 'friends':
        return {
          title: 'Connect with Fellow Learners',
          description: 'Team up with other students for bonus XP and collaborative learning.',
          features: [
            'Add friends and build your network',
            'Team up on quests for 2x XP bonus',
            'Share your learning journey',
            'Get support from peers and educators'
          ]
        };
      case 'diploma':
        return {
          title: 'Showcase Your Achievements',
          description: 'Create a professional portfolio to demonstrate your skills to colleges and employers.',
          features: [
            'Professional diploma page with your photo',
            'Detailed skill breakdowns with evidence',
            'Public portfolio URL for resumes',
            'Impressive visual progress charts'
          ]
        };
      default:
        return {
          title: 'Unlock Full Access',
          description: `Upgrade to Supported or Academy to access ${feature} and more.`,
          features: [
            'Complete quests and earn XP',
            'Build your portfolio diploma',
            'Connect with other learners',
            'Access to support team'
          ]
        };
    }
  };

  const { title, description, features } = getFeatureContent();

  const handleUpgrade = () => {
    onClose();
    navigate('/subscription');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="bg-gradient-primary-reverse text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{title}</h2>
                <p className="text-pink-100 text-sm mt-1">{description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-pink-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Features List */}
          <div className="space-y-3 mb-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="p-1 bg-green-100 rounded-full">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">{feature}</span>
              </div>
            ))}
          </div>

          {/* Pricing Preview */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">Optio Supported</div>
                <div className="text-sm text-gray-600">Most popular choice</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-600">$39.99</div>
                <div className="text-sm text-gray-500">per month</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={onClose}
            >
              Maybe Later
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1 !bg-gradient-to-r !from-[#ef597b] !to-[#6d469b]"
              onClick={handleUpgrade}
            >
              <Star className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradePrompt;