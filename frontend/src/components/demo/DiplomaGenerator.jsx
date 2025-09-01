import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  Award, Download, Share2, Shield, GraduationCap, 
  Star, Trophy, Sparkles, ExternalLink 
} from 'lucide-react';
import SkillsRadarChart from '../diploma/SkillsRadarChart';

const DiplomaGenerator = () => {
  const { demoState, actions } = useDemo();
  const [userName, setUserName] = useState('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [showShareOptions, setShowShareOptions] = useState(false);
  
  const isParent = demoState.persona === 'parent';
  const isAccredited = demoState.subscriptionTier === 'academy';

  useEffect(() => {
    // Simulate diploma generation
    const timer = setTimeout(() => {
      setIsGenerating(false);
      if (!demoState.generatedDiploma) {
        actions.generateDiploma();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleNameChange = (e) => {
    setUserName(e.target.value);
    actions.trackInteraction('name_entered', { name: e.target.value });
  };

  const handleShare = (platform) => {
    actions.trackInteraction('diploma_shared', { platform });
    setShowShareOptions(false);
    // In real app, would open share dialog
  };

  const diploma = demoState.generatedDiploma || {
    name: userName || (isParent ? 'Your Child' : 'Demo Student'),
    completedQuest: demoState.selectedQuest,
    earnedXP: demoState.earnedXP,
    totalXP: Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0),
    isAccredited
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
        <div className="relative">
          <Sparkles className="w-32 h-32 text-[#FFCA3A] animate-spin" />
        </div>
        <div className="text-center">
          <h3 className="text-2xl font-bold text-[#003f5c] mb-2">Generating Your Diploma...</h3>
          <p className="text-gray-600">Creating your personalized achievement portfolio</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Name Input */}
      {!userName && (
        <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
          <label className="block text-lg font-semibold text-[#003f5c] mb-3">
            {isParent ? "Enter Your Child's Name" : "Enter Your Name"}
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={userName}
              onChange={handleNameChange}
              placeholder={isParent ? "Your child's name" : "Your name"}
              className="flex-1 p-3 border-2 border-gray-200 rounded-lg focus:border-[#6d469b] focus:outline-none"
            />
            <button
              onClick={() => setUserName(userName || 'Alex Johnson')}
              className="px-6 py-3 bg-[#6d469b] text-white font-medium rounded-lg hover:bg-[#8b5fbf] transition-colors"
            >
              Use Sample
            </button>
          </div>
        </div>
      )}

      {/* Diploma Preview */}
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Accreditation Banner */}
        {isAccredited && (
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] p-3 text-white text-center">
            <div className="flex items-center justify-center gap-2">
              <Shield className="w-5 h-5" />
              <span className="font-semibold">ACCREDITED HIGH SCHOOL DIPLOMA</span>
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
        )}

        {/* Diploma Header */}
        <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
          <div className="text-center mb-8">
            <div className="inline-flex p-4 bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-full mb-4">
              <Award className="w-12 h-12 text-[#6d469b]" />
            </div>
            <h1 className="text-4xl font-bold text-[#003f5c] mb-2">Certificate of Achievement</h1>
            <p className="text-lg text-gray-600">Optio Educational Platform</p>
          </div>

          {/* Student Name */}
          <div className="text-center mb-8">
            <p className="text-gray-600 mb-2">This certifies that</p>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              {userName || diploma.name}
            </h2>
            <p className="text-gray-600 mt-2">has successfully completed</p>
          </div>

          {/* Quest Achievement */}
          <div className="bg-white rounded-xl p-6 mb-8 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-[#003f5c]">
                  {diploma.completedQuest?.title || 'Quest Achievement'}
                </h3>
                <p className="text-gray-600">
                  {diploma.completedQuest?.description || 'Demonstrated mastery through evidence-based learning'}
                </p>
              </div>
              <div className="text-center">
                <Trophy className="w-10 h-10 text-[#FFCA3A] mx-auto mb-1" />
                <div className="text-2xl font-bold text-[#6d469b]">{diploma.totalXP}</div>
                <div className="text-sm text-gray-600">Total XP</div>
              </div>
            </div>

            {/* Completed Tasks */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700 mb-2">Tasks Completed:</p>
              <div className="grid grid-cols-2 gap-2">
                {diploma.completedQuest?.tasks.map((task, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Star className="w-4 h-4 text-[#FFCA3A]" />
                    <span className="text-gray-700">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skills Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-[#003f5c] mb-4">Skills Developed</h4>
              <div className="h-64">
                <SkillsRadarChart skillsXP={diploma.earnedXP} />
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-[#003f5c] mb-4">XP Breakdown</h4>
              <div className="space-y-3">
                {Object.entries(diploma.earnedXP).map(([skill, xp]) => (
                  <div key={skill} className="flex items-center justify-between">
                    <span className="text-gray-700 capitalize">
                      {skill.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b]"
                          style={{ width: `${Math.min((xp / 100) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-[#6d469b] w-12 text-right">
                        {xp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className="text-center pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-2">
              Issued on {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
            <p className="text-xs text-gray-400">
              Verification ID: DEMO-{Math.random().toString(36).substr(2, 9).toUpperCase()}
            </p>
            {isAccredited && (
              <p className="text-sm text-[#6d469b] font-semibold mt-2">
                Accredited by National Education Standards Board
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col md:flex-row gap-4 justify-center">
        <button
          onClick={() => setShowShareOptions(!showShareOptions)}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300"
        >
          <Share2 className="w-5 h-5" />
          Share Portfolio
        </button>
        
        <button
          className="flex items-center justify-center gap-2 px-8 py-3 bg-white border-2 border-[#6d469b] text-[#6d469b] font-semibold rounded-lg hover:bg-[#6d469b]/5 transition-colors"
        >
          <Download className="w-5 h-5" />
          Download PDF
        </button>
        
        <button
          onClick={() => actions.nextStep()}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-[#FFCA3A] text-[#003f5c] font-semibold rounded-lg hover:bg-[#FFD966] transition-colors"
        >
          See the Difference
          <ExternalLink className="w-5 h-5" />
        </button>
      </div>

      {/* Share Options */}
      {showShareOptions && (
        <div className="flex justify-center gap-3">
          {['LinkedIn', 'Facebook', 'Twitter', 'Email'].map((platform) => (
            <button
              key={platform}
              onClick={() => handleShare(platform)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              {platform}
            </button>
          ))}
        </div>
      )}

      {/* Parent Message */}
      {isParent && (
        <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6 text-center">
          <p className="text-lg text-[#003f5c] mb-2">
            Imagine your child earning diplomas like this for their real passions
          </p>
          <p className="text-gray-600">
            With Academy tier, these become accredited high school credits
          </p>
        </div>
      )}
    </div>
  );
};

export default DiplomaGenerator;