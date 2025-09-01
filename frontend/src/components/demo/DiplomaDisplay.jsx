import React from 'react';
import { Award, Trophy, Star, Shield, GraduationCap } from 'lucide-react';
import SkillsRadarChart from '../diploma/SkillsRadarChart';

const DiplomaDisplay = ({ userName, allQuests, earnedXP = {}, isAccredited }) => {
  // Ensure earnedXP has all required skills
  const safeEarnedXP = {
    creativity: 0,
    critical_thinking: 0,
    practical_skills: 0,
    communication: 0,
    cultural_literacy: 0,
    ...earnedXP
  };
  
  const totalXP = Object.values(safeEarnedXP).reduce((sum, xp) => sum + xp, 0);
  
  return (
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

      {/* Diploma Header */}
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
          <p className="text-gray-600 mt-2">has demonstrated mastery through evidence-based learning</p>
        </div>

        {/* Completed Quests Grid */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-[#003f5c] mb-4">Completed Quests</h3>
          <div className="grid grid-cols-2 gap-4">
            {allQuests.map((quest) => (
              <div key={quest.id} className="bg-white rounded-lg p-4 border border-gray-200 overflow-hidden">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-[#003f5c] truncate">{quest.title}</h4>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{quest.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2 max-h-16 overflow-hidden">
                      {quest.tasks.slice(0, 3).map((task, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-gray-100 rounded-full truncate max-w-[120px]">
                          {task.title}
                        </span>
                      ))}
                      {quest.tasks.length > 3 && (
                        <span className="text-xs px-2 py-1 bg-gray-200 rounded-full">
                          +{quest.tasks.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <Trophy className="w-6 h-6 text-[#FFCA3A] mx-auto" />
                    <div className="text-sm font-bold text-[#6d469b]">{quest.totalXP} XP</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skills Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <h4 className="font-semibold text-[#003f5c] mb-4">Skills Developed</h4>
            <div className="h-64">
              <SkillsRadarChart skillsXP={safeEarnedXP} />
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold text-[#003f5c] mb-4">Experience Points</h4>
            <div className="space-y-3">
              {Object.entries(safeEarnedXP).map(([skill, xp]) => (
                <div key={skill} className="flex items-center justify-between">
                  <span className="text-gray-700 capitalize">
                    {skill.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b]"
                        style={{ width: `${Math.min((xp / 500) * 100, 100)}%` }}
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
                  <span className="text-xl font-bold text-[#6d469b]">{totalXP}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
  );
};

export default DiplomaDisplay;