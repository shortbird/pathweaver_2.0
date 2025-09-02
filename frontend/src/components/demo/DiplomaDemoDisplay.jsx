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
        max: 200,
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
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-xl p-8 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">{demoUser.name}</h1>
            <p className="text-white/90 mb-4">Student at {demoUser.school}</p>
            
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Joined {demoUser.joined}</span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                <span>{totalXP} Total XP</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                <span>{selectedQuests.length} Active Quests</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setShowDiplomaModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Full Diploma
          </button>
        </div>
      </div>

      {/* Skills & Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Skills Radar Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="font-bold text-lg text-[#003f5c] mb-4">Skills Development</h3>
          <div className="h-64">
            <Radar data={radarData} options={radarOptions} />
          </div>
        </div>

        {/* XP Breakdown */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="font-bold text-lg text-[#003f5c] mb-4">XP by Pillar</h3>
          <div className="space-y-3">
            {Object.entries(xpData).map(([pillar, xp]) => (
              <div key={pillar} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {pillar.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b]"
                      style={{ width: `${Math.min((xp / 200) * 100, 100)}%` }}
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

      {/* Quest Achievements */}
      <div className="space-y-4">
        <h3 className="font-bold text-xl text-[#003f5c]">Quest Achievements</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {selectedQuests.map(quest => {
            const questWork = submittedWork.filter(w => w.questId === quest.id);
            
            return (
              <div key={quest.id} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-lg text-[#003f5c]">{quest.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{quest.description}</p>
                  </div>
                  <Award className="w-8 h-8 text-[#6d469b]" />
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
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#6d469b] mt-0.5" />
          <div>
            <h4 className="font-semibold text-[#003f5c] mb-1">This is Your Living Diploma</h4>
            <p className="text-sm text-gray-700">
              Your diploma grows with every quest you complete. Public submissions are visible to everyone, 
              creating natural accountability for quality work. Confidential submissions show completion 
              but require direct contact for details.
            </p>
            <p className="text-sm text-gray-600 mt-2 italic">
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