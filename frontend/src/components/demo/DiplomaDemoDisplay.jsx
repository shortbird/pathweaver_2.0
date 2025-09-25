import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  Award, Globe, Lock, Eye, EyeOff, User, 
  Calendar, Trophy, Target, Info, ExternalLink, CheckCircle
} from 'lucide-react';
import InfoModal from './InfoModal';
// Chart imports - using dynamic import to avoid build issues
import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const DiplomaDemoDisplay = () => {
  const { demoState } = useDemo();
  const { selectedQuests, submittedWork, workVisibility } = demoState;
  const [showDiplomaModal, setShowDiplomaModal] = useState(false);
  
  // Calculate XP from submitted work
  const calculateXP = () => {
    const xp = {
      creativity: 0,
      critical_thinking: 0,
      practical_skills: 0,
      communication: 0,
      cultural_literacy: 0
    };
    
    submittedWork.forEach(work => {
      const quest = selectedQuests.find(q => q.id === work.questId);
      if (quest) {
        const task = quest.tasks.find(t => t.id === work.taskId);
        if (task) {
          xp[task.pillar] += task.xp;
        }
      }
    });
    
    return xp;
  };

  const xpData = calculateXP();
  const totalXP = Object.values(xpData).reduce((sum, val) => sum + val, 0);
  
  // Calculate max value for radar chart scale
  const maxXP = Math.max(...Object.values(xpData), 100);
  const radarMax = Math.ceil(maxXP / 100) * 100; // Round up to nearest 100

  // Radar chart data
  const radarData = {
    labels: [
      'Creativity',
      'Critical Thinking',
      'Practical Skills',
      'Communication',
      'Cultural Literacy'
    ],
    datasets: [{
      label: 'Skills',
      data: [
        xpData.creativity,
        xpData.critical_thinking,
        xpData.practical_skills,
        xpData.communication,
        xpData.cultural_literacy
      ],
      backgroundColor: 'rgba(239, 89, 123, 0.2)',
      borderColor: 'rgba(239, 89, 123, 1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(109, 70, 155, 1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(109, 70, 155, 1)'
    }]
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      r: {
        beginAtZero: true,
        max: radarMax,
        ticks: { display: false },
        grid: { color: 'rgba(0, 0, 0, 0.1)' }
      }
    }
  };

  const demoUser = {
    name: "Alex Thompson",
    joined: "September 2024",
    school: "Optio Academy"
  };

  return (
    <div className="space-y-6">
      {/* Diploma Header */}
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-xl p-4 sm:p-6 lg:p-8 text-white">
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

      {/* Skills & Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Skills Radar Chart */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <h3 className="font-bold text-base sm:text-lg text-[#003f5c] mb-4">Skills Development</h3>
          <div className="h-48 sm:h-56 lg:h-64">
            <Radar data={radarData} options={radarOptions} />
          </div>
        </div>

        {/* XP Breakdown */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <h3 className="font-bold text-base sm:text-lg text-[#003f5c] mb-4">XP by Pillar</h3>
          <div className="space-y-3 sm:space-y-4">
            {Object.entries(xpData).map(([pillar, xp]) => (
              <div key={pillar} className="flex flex-col xs:flex-row xs:items-center gap-2">
                <span className="text-sm font-medium text-gray-700 capitalize flex-shrink-0 xs:w-24 sm:w-auto">
                  {pillar.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-0">
                    <div
                      className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b]"
                      style={{ width: `${Math.min((xp / 200) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-[#6d469b] w-8 sm:w-12 text-right flex-shrink-0">
                    {xp}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quest Achievements */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg sm:text-xl text-[#003f5c]">Quest Achievements</h3>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {selectedQuests.map(quest => {
            const questWork = submittedWork.filter(w => w.questId === quest.id);

            return (
              <div key={quest.id} className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-base sm:text-lg text-[#003f5c] leading-tight">{quest.title}</h4>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{quest.description}</p>
                  </div>
                  <Award className="w-6 h-6 sm:w-8 sm:h-8 text-[#6d469b] flex-shrink-0" />
                </div>
                
                {/* Tasks & Submitted Work */}
                <div className="space-y-3">
                  {quest.tasks.map(task => {
                    const work = questWork.find(w => w.taskId === task.id);
                    const visibility = workVisibility[quest.id]?.[task.id];
                    
                    return (
                      <div key={task.id} className="border-l-4 border-[#ef597b]/30 pl-4">
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
                    <span className="font-semibold text-[#6d469b]">
                      {questWork.length}/{quest.tasks.length} tasks
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Public Accountability Note */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#6d469b] mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <h4 className="font-semibold text-[#003f5c] mb-1 text-sm sm:text-base">This is Your Living Diploma</h4>
            <p className="text-sm text-gray-700 leading-relaxed">
              Your diploma grows with every quest you complete. Public submissions are visible to everyone,
              creating natural accountability for quality work. Confidential submissions show completion
              but require direct contact for details.
            </p>
            <p className="text-sm text-gray-600 mt-2 italic leading-relaxed">
              Share this diploma with colleges, employers, and anyone interested in your real achievements.
            </p>
          </div>
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