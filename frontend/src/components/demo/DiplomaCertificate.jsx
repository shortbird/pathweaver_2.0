import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  Award, Download, Share2, Shield, GraduationCap, 
  Star, Trophy, Sparkles
} from 'lucide-react';
import DiplomaDisplay from './DiplomaDisplay';
import VisionaryTierModal from './VisionaryTierModal';

const DiplomaCertificate = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const [isGenerating, setIsGenerating] = useState(true);
  const [showVisionaryModal, setShowVisionaryModal] = useState(false);
  
  const isParent = demoState.persona === 'parent';
  const isAccredited = demoState.subscriptionTier === 'visionary';

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

  useEffect(() => {
    // Show Visionary modal for parents after generation
    if (isParent && !isGenerating && !demoState.showAccreditedOption) {
      const timer = setTimeout(() => {
        setShowVisionaryModal(true);
        actions.showVisionaryTier();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isParent, isGenerating]);

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

  const userName = demoState.userInputs.name || demoState.userInputs.childName || 'Demo Student';

  return (
    <div className="space-y-8">
      {/* Accredited Badge for Parents */}
      {isParent && demoState.showAccreditedOption && (
        <div className="text-center">
          <button
            onClick={() => setShowVisionaryModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-full animate-pulse hover:animate-none hover:shadow-lg transition-all"
          >
            <Shield className="w-5 h-5" />
            <span className="font-semibold">Accredited Diploma Available with Visionary Tier</span>
            <GraduationCap className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Main Diploma */}
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-5xl mx-auto">
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

        {/* Diploma Content */}
        <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
          <div className="text-center mb-8">
            <div className="inline-flex p-4 bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-full mb-4">
              <Award className="w-12 h-12 text-[#6d469b]" />
            </div>
            <h1 className="text-4xl font-bold text-[#003f5c] mb-2">Optio Learning Portfolio</h1>
            <p className="text-lg text-gray-600">Certificate of Achievement</p>
          </div>

          {/* Student Name */}
          <div className="text-center mb-8">
            <p className="text-gray-600 mb-2">This certifies that</p>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              {userName}
            </h2>
            <p className="text-gray-600 mt-3">
              has accepted the responsibility to self-validate their education.
            </p>
            <p className="text-gray-600">
              This diploma is a record of their learning journey.
            </p>
          </div>

          {/* Quest Achievement */}
          <div className="bg-white rounded-xl p-6 mb-8 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-[#003f5c]">
                  {demoState.selectedQuest?.title || 'Quest Achievement'}
                </h3>
                <p className="text-gray-600">
                  {demoState.selectedQuest?.description || 'Demonstrated mastery through evidence-based learning'}
                </p>
              </div>
              <div className="text-center">
                <Trophy className="w-10 h-10 text-[#FFCA3A] mx-auto mb-1" />
                <div className="text-2xl font-bold text-[#6d469b]">
                  {Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0)}
                </div>
                <div className="text-sm text-gray-600">Total XP</div>
              </div>
            </div>

            {/* Completed Tasks */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700 mb-2">Tasks Completed:</p>
              <div className="grid grid-cols-2 gap-2">
                {demoState.selectedQuest?.tasks.map((task, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Star className="w-4 h-4 text-[#FFCA3A]" />
                    <span className="text-gray-700">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skills Breakdown - Fixed to prevent overflow */}
          <div className="grid grid-cols-1 gap-4 mb-8">
            <div>
              <h4 className="font-semibold text-[#003f5c] mb-4">Experience Points by Skill</h4>
              <div className="space-y-3">
                {Object.entries(demoState.earnedXP).map(([skill, xp]) => (
                  <div key={skill} className="flex items-center gap-3">
                    <span className="text-gray-700 capitalize w-32">
                      {skill.replace('_', ' ')}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
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
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#003f5c]">Total XP</span>
                    <span className="text-xl font-bold text-[#6d469b]">
                      {Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0)}
                    </span>
                  </div>
                </div>
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

      {/* Visionary Modal */}
      {showVisionaryModal && (
        <VisionaryTierModal onClose={() => setShowVisionaryModal(false)} />
      )}
    </div>
  );
};

export default DiplomaCertificate;