import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import {
  Award, Globe, Lock, Eye, EyeOff, User,
  Calendar, Trophy, Target, Info, ExternalLink, CheckCircle,
  Bot, MessageCircle, TrendingUp
} from 'lucide-react';
import InfoModal from './InfoModal';
// Chart imports - using recharts (already installed)
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

const DiplomaDemoDisplay = () => {
  const { demoState } = useDemo();
  const { selectedQuests, earnedXP } = demoState;
  const [showDiplomaModal, setShowDiplomaModal] = useState(false);

  // Use earnedXP from demo state (includes XP from mini-quest)
  // Add demo data for display purposes
  const xpData = {
    stem: earnedXP.stem + 150,
    wellness: earnedXP.wellness + 200,
    communication: earnedXP.communication + 100, // This already has 75 from mini-quest
    civics: earnedXP.civics + 125,
    art: earnedXP.art + 175
  };

  const totalXP = Object.values(xpData).reduce((sum, val) => sum + val, 0);

  // Demo submitted work - create dynamic examples based on selected quest
  const demoSubmittedWork = selectedQuests.length > 0 ? selectedQuests.map(quest => {
    // Create examples that match the quest's actual tasks
    const questExamples = {
      'family-recipes': [
        {
          questId: quest.id,
          taskId: quest.tasks[0].id,
          work: 'Interviewed grandmother about family recipe origins and traditions',
          visibility: 'public'
        },
        {
          questId: quest.id,
          taskId: quest.tasks[1]?.id,
          work: 'Documented 12 family recipes with photos and stories',
          visibility: 'public'
        }
      ],
      'music-composition': [
        {
          questId: quest.id,
          taskId: quest.tasks[0].id,
          work: 'Completed music theory fundamentals course with 95% score',
          visibility: 'public'
        },
        {
          questId: quest.id,
          taskId: quest.tasks[1]?.id,
          work: 'Composed original piano piece "Autumn Reflections"',
          visibility: 'public'
        }
      ],
      'small-business': [
        {
          questId: quest.id,
          taskId: quest.tasks[0].id,
          work: 'Surveyed 50 potential customers about jewelry preferences',
          visibility: 'public'
        },
        {
          questId: quest.id,
          taskId: quest.tasks[1]?.id,
          work: 'Created detailed business plan with financial projections',
          visibility: 'public'
        }
      ],
      'volunteer-impact': [
        {
          questId: quest.id,
          taskId: quest.tasks[0].id,
          work: 'Chose to support local food bank helping 200+ families',
          visibility: 'public'
        },
        {
          questId: quest.id,
          taskId: quest.tasks[1]?.id,
          work: 'Completed 25 hours organizing donations and food distribution',
          visibility: 'public'
        }
      ]
    };

    return questExamples[quest.id] || [];
  }).flat() : [];

  const demoWorkVisibility = selectedQuests.length > 0 ? selectedQuests.reduce((acc, quest) => {
    acc[quest.id] = {
      [quest.tasks[0].id]: 'public',
      [quest.tasks[1]?.id]: 'public'
    };
    return acc;
  }, {}) : {};
  
  // Calculate max value for radar chart scale
  const maxXP = Math.max(...Object.values(xpData), 100);
  const radarMax = Math.ceil(maxXP / 100) * 100; // Round up to nearest 100

  // Radar chart data for recharts
  const radarData = [
    { skill: 'STEM', value: xpData.stem, fullMark: radarMax },
    { skill: 'Wellness', value: xpData.wellness, fullMark: radarMax },
    { skill: 'Comm.', value: xpData.communication, fullMark: radarMax },
    { skill: 'Civics', value: xpData.civics, fullMark: radarMax },
    { skill: 'Art', value: xpData.art, fullMark: radarMax }
  ];

  const demoUser = {
    name: "Alex Thompson",
    joined: "September 2024",
    school: "Optio Academy"
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-text-primary">
          Your Living Portfolio
        </h2>
        <p className="text-gray-600">
          This grows automatically as you learn
        </p>
      </div>

      {/* Diploma Header */}
      <div className="bg-gradient-primary rounded-xl p-4 sm:p-6 lg:p-8 text-white">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 leading-tight">{demoUser.name}</h1>
            <p className="text-white/90 mb-4">Student at {demoUser.school}</p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span>Joined {demoUser.joined}</span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 flex-shrink-0" />
                <span>{totalXP} Total XP</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 flex-shrink-0" />
                <span>{selectedQuests.length} Active Quests</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDiplomaModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors min-h-[44px] touch-manipulation text-sm sm:text-base whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            <span>View Full Diploma</span>
          </button>
        </div>
      </div>

      {/* Learning Journey Timeline */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold text-lg text-text-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-optio-purple" />
          Your Learning Journey
        </h3>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gradient-primary hidden sm:block" />

          {/* Timeline Items */}
          <div className="space-y-6">
            {/* September - Started Journey */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold z-10 border-4 border-white shadow-lg">
                9
              </div>
              <div className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                <p className="text-sm text-gray-600">September 2024</p>
                <p className="font-semibold text-gray-800">Started Your Journey</p>
                <p className="text-sm text-gray-600 mt-1">Joined Optio & selected first quests</p>
              </div>
            </div>

            {/* October - Recipe Quest */}
            {selectedQuests.length > 0 && (
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold z-10 border-4 border-white shadow-lg">
                  10
                </div>
                <div className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                  <p className="text-sm text-gray-600">October 2024</p>
                  <p className="font-semibold text-gray-800">{selectedQuests[0].title}</p>
                  <p className="text-sm text-gray-600 mt-1">Completed task 1 • Earned 75 XP</p>
                </div>
              </div>
            )}

            {/* November - Current */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold z-10 border-4 border-white shadow-lg animate-pulse">
                11
              </div>
              <div className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-green-200">
                <p className="text-sm text-green-600 font-semibold">Now</p>
                <p className="font-semibold text-gray-800">Growing Your Skills</p>
                <p className="text-sm text-gray-600 mt-1">Active in Communication & Civics</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skills & Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Skills Radar Chart */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <h3 className="font-bold text-base sm:text-lg text-text-primary mb-4">Skills Development</h3>
          <div className="h-48 sm:h-56 lg:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <PolarRadiusAxis angle={90} domain={[0, radarMax]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Radar
                  name="Skills"
                  dataKey="value"
                  stroke="#ef597b"
                  fill="#ef597b"
                  fillOpacity={0.6}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* XP Breakdown */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <h3 className="font-bold text-base sm:text-lg text-text-primary mb-4">XP by Pillar</h3>
          <div className="space-y-3 sm:space-y-4">
            {Object.entries(xpData).map(([pillar, xp]) => {
              const pillarLabel = pillar === 'communication' ? 'Comm.' : pillar.replace('_', ' ');
              return (
                <div key={pillar} className="flex flex-col xs:flex-row xs:items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 capitalize flex-shrink-0 xs:w-24 sm:w-auto">
                    {pillarLabel}
                  </span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-0">
                    <div
                      className="h-full bg-gradient-primary"
                      style={{ width: `${Math.min((xp / 200) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-optio-purple w-8 sm:w-12 text-right flex-shrink-0">
                    {xp}
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Tutor Preview */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="font-bold text-lg text-text-primary mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-optio-purple" />
          AI Tutor Helped You
        </h3>
        <div className="space-y-4">
          {/* Simulated Conversation */}
          <div className="space-y-3">
            {/* User Message */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 flex-shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1 bg-gray-100 rounded-lg p-3">
                <p className="text-sm text-gray-800">
                  "How do I organize interview notes effectively?"
                </p>
              </div>
            </div>

            {/* AI Response */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-white flex-shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 border border-purple-100">
                <p className="text-sm text-gray-800 leading-relaxed">
                  "Great question! Let me suggest a storytelling framework. Start by grouping
                  quotes into themes - family traditions, personal memories, recipe origins.
                  Then create a timeline to show how recipes evolved over generations..."
                </p>
                <button className="text-sm text-optio-purple font-semibold mt-2 hover:underline">
                  View full conversation →
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-lg p-4">
            <p className="text-sm text-gray-700 text-center">
              24/7 AI support whenever you need help - automatically documented in your portfolio
            </p>
          </div>
        </div>
      </div>

      {/* Quest Achievements */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg sm:text-xl text-text-primary">Quest Achievements</h3>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {selectedQuests.map(quest => {
            const questWork = demoSubmittedWork.filter(w => w.questId === quest.id);

            return (
              <div key={quest.id} className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-base sm:text-lg text-text-primary leading-tight">{quest.title}</h4>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{quest.description}</p>
                  </div>
                  <Award className="w-6 h-6 sm:w-8 sm:h-8 text-optio-purple flex-shrink-0" />
                </div>

                {/* Tasks & Submitted Work */}
                <div className="space-y-3">
                  {quest.tasks.map(task => {
                    const work = questWork.find(w => w.taskId === task.id);
                    const visibility = demoWorkVisibility[quest.id]?.[task.id];
                    
                    return (
                      <div key={task.id} className="border-l-4 border-optio-pink/30 pl-4">
                        <h5 className="font-semibold text-sm text-gray-800">{task.title}</h5>
                        
                        {work ? (
                          <div className="mt-2">
                            {visibility === 'public' ? (
                              <div className="bg-blue-50 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                  <Globe className="w-4 h-4 text-blue-600 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-700">{work.work}</p>
                                    <p className="text-xs text-blue-600 mt-1">Public submission</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-orange-50 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                  <Lock className="w-4 h-4 text-orange-600 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-700 italic">
                                      Student chose to keep this work confidential.
                                    </p>
                                    <p className="text-xs text-orange-600 mt-1">
                                      Contact student for details
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mt-1">Not yet submitted</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Quest Progress */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Progress</span>
                    <span className="font-semibold text-optio-purple">
                      {questWork.length}/{quest.tasks.length} tasks
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Automatic Capture Message */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-2 text-optio-purple">
            <CheckCircle className="w-6 h-6" />
            <h4 className="font-bold text-lg">Everything Captured Automatically</h4>
          </div>
          <p className="text-gray-700 max-w-2xl mx-auto">
            No extra uploads. No friction. Just proof of your growth.
          </p>
        </div>
      </div>

      {/* Full Diploma Modal */}
      <InfoModal
        isOpen={showDiplomaModal}
        onClose={() => setShowDiplomaModal(false)}
        title="Your Public Diploma URL"
        actionText="Got It"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            In the full version, your diploma has a unique public URL you can share:
          </p>
          
          <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm">
            https://optio.education/diploma/{demoUser.name.toLowerCase().replace(' ', '-')}
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold">What others see:</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>All your completed quests</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Public submitted work</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Your skills radar chart</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Total XP and achievements</span>
              </li>
              <li className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-500" />
                <span>"Contact for details" on confidential work</span>
              </li>
            </ul>
          </div>
          
          <p className="text-sm text-gray-600 italic">
            This becomes your professional portfolio that grows throughout your education.
          </p>
        </div>
      </InfoModal>
    </div>
  );
};

export default DiplomaDemoDisplay;