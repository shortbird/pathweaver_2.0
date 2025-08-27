import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

const DiplomaPageV3 = () => {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState(null);
  const [shareableLink, setShareableLink] = useState('');

  const pillarColors = {
    creativity: 'from-purple-500 to-pink-500',
    critical_thinking: 'from-blue-500 to-cyan-500',
    practical_skills: 'from-green-500 to-emerald-500',
    communication: 'from-orange-500 to-yellow-500',
    cultural_literacy: 'from-red-500 to-rose-500'
  };

  useEffect(() => {
    if (user) {
      fetchAchievements();
      generateShareableLink();
    }
  }, [user]);

  const fetchAchievements = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiBase}/v3/quests/completed`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch achievements');
      }

      const data = await response.json();
      setAchievements(data.achievements || []);

      // Calculate total XP by pillar
      const xpByPillar = {};
      data.achievements?.forEach(achievement => {
        Object.entries(achievement.task_evidence || {}).forEach(([_, evidence]) => {
          const pillar = evidence.pillar;
          if (pillar) {
            xpByPillar[pillar] = (xpByPillar[pillar] || 0) + evidence.xp_awarded;
          }
        });
      });
      setTotalXP(xpByPillar);

    } catch (error) {
      console.error('Error fetching achievements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateShareableLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/diploma/${user?.id}`;
    setShareableLink(link);
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareableLink);
    alert('Diploma link copied to clipboard!');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderEvidence = (evidence) => {
    switch (evidence.evidence_type) {
      case 'text':
        return (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {evidence.evidence_content}
            </p>
          </div>
        );
      
      case 'link':
        return (
          <div className="p-3 bg-blue-50 rounded-lg">
            <a 
              href={evidence.evidence_content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline text-sm flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
              View Link
            </a>
          </div>
        );
      
      case 'image':
        return (
          <div className="p-3 bg-gray-50 rounded-lg">
            <img 
              src={evidence.evidence_content}
              alt="Task evidence"
              className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
              onClick={() => window.open(evidence.evidence_content, '_blank')}
            />
          </div>
        );
      
      case 'video':
        return (
          <div className="p-3 bg-gray-50 rounded-lg">
            <video 
              controls
              className="max-w-full rounded-lg"
              src={evidence.evidence_content}
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold mb-2">My Learning Diploma</h1>
              <p className="text-blue-100 text-lg">
                A showcase of my completed quests and earned achievements
              </p>
            </div>
            <button
              onClick={copyShareLink}
              className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              Share Diploma 🔗
            </button>
          </div>

          {/* XP Summary */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(pillarColors).map(([pillar, gradient]) => {
              const xp = totalXP[pillar] || 0;
              return (
                <div key={pillar} className="bg-white/20 backdrop-blur rounded-lg p-3">
                  <div className={`text-xs font-medium mb-1 capitalize`}>
                    {pillar.replace('_', ' ')}
                  </div>
                  <div className="text-2xl font-bold">
                    {xp.toLocaleString()} XP
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievements Grid */}
        {achievements.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <p className="text-gray-600 text-lg mb-2">No completed quests yet</p>
            <p className="text-gray-500">Complete quests to showcase your achievements here!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {achievements.map((achievement) => (
              <div 
                key={achievement.quest.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedAchievement(achievement)}
              >
                {/* Quest Header Image */}
                {achievement.quest.header_image_url ? (
                  <img 
                    src={achievement.quest.header_image_url}
                    alt={achievement.quest.title}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="h-32 bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center">
                    <div className="text-white text-4xl">🏆</div>
                  </div>
                )}

                <div className="p-4">
                  <h3 className="font-bold text-gray-800 mb-2">{achievement.quest.title}</h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {achievement.quest.big_idea}
                  </p>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">
                      Completed {formatDate(achievement.completed_at)}
                    </span>
                    <span className="font-bold text-green-600">
                      {achievement.total_xp_earned} XP
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {Object.keys(achievement.task_evidence).length} tasks completed
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">
                    {selectedAchievement.quest.title}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Completed on {formatDate(selectedAchievement.completed_at)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAchievement(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-3">Quest Overview</h3>
                <p className="text-gray-600">{selectedAchievement.quest.big_idea}</p>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3">Completed Tasks & Evidence</h3>
                <div className="space-y-4">
                  {Object.entries(selectedAchievement.task_evidence).map(([taskTitle, evidence]) => (
                    <div key={taskTitle} className="border rounded-lg p-4">
                      <div className="mb-3">
                        <h4 className="font-medium text-gray-800">{taskTitle}</h4>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r ${pillarColors[evidence.pillar]}`}>
                            {evidence.pillar.replace('_', ' ')}
                          </span>
                          <span className="text-sm font-medium text-green-600">
                            {evidence.xp_awarded} XP earned
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDate(evidence.completed_at)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700 mb-2">Evidence:</p>
                        {renderEvidence(evidence)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default DiplomaPageV3;