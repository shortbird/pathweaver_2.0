import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const DiplomaPageV3 = () => {
  const { user } = useAuth();
  const { slug, userId } = useParams();
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState(null);
  const [shareableLink, setShareableLink] = useState('');
  const [diploma, setDiploma] = useState(null);
  const [error, setError] = useState(null);

  const pillarColors = {
    creativity: 'from-[#ef597b] to-[#6d469b]',
    critical_thinking: 'from-[#6d469b] to-[#ef597b]',
    practical_skills: 'from-[#ef597b] to-[#6d469b]',
    communication: 'from-[#6d469b] to-[#ef597b]',
    cultural_literacy: 'from-[#ef597b] to-[#6d469b]'
  };

  const fetchPublicDiploma = useCallback(async () => {
    let isSubscribed = true;
    
    try {
      const response = await api.get(`/portfolio/public/${slug}`);
      if (isSubscribed) {
        setDiploma(response.data);
        
        // Transform the data to match achievements format if needed
        // For now, we'll display the diploma data differently
      }
    } catch (error) {
      if (isSubscribed) {
        if (error.response?.status === 404) {
          setError('Diploma not found or is private');
        } else {
          setError('Failed to load diploma');
        }
      }
    } finally {
      if (isSubscribed) {
        setIsLoading(false);
      }
    }
    
    return () => { isSubscribed = false; };
  }, [slug]);

  const fetchAchievements = useCallback(async () => {
    let isSubscribed = true;
    
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
      
      if (isSubscribed) {
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
      }
    } catch (error) {
      if (isSubscribed) {
        console.error('Error fetching achievements:', error);
      }
    } finally {
      if (isSubscribed) {
        setIsLoading(false);
      }
    }
    
    return () => { isSubscribed = false; };
  }, []);

  const generateShareableLink = useCallback(() => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/diploma/${user?.id}`;
    setShareableLink(link);
  }, [user?.id]);

  useEffect(() => {
    let cleanup;
    
    if (slug) {
      // Portfolio route - public access
      cleanup = fetchPublicDiploma();
    } else if (user) {
      // Authenticated user viewing their own diploma
      cleanup = fetchAchievements();
      generateShareableLink();
    }
    
    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [user, slug, userId, fetchPublicDiploma, fetchAchievements, generateShareableLink]);

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareableLink);
    alert('Diploma link copied to clipboard!');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateTotalXP = () => {
    return Object.values(totalXP).reduce((sum, xp) => sum + xp, 0);
  };

  const openAchievementModal = (achievement) => {
    setSelectedAchievement(achievement);
  };

  const closeAchievementModal = () => {
    setSelectedAchievement(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center">
        <div className="text-white text-xl">Loading diploma...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
          <p className="text-white/80">{error}</p>
        </div>
      </div>
    );
  }

  // Public diploma view
  if (diploma) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">
              {diploma.student?.first_name} {diploma.student?.last_name}'s Diploma
            </h1>
            <p className="text-white/80">
              Issued: {formatDate(diploma.diploma_issued)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-3xl font-bold text-white">{diploma.total_quests_completed}</div>
                <div className="text-white/60">Quests Completed</div>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-3xl font-bold text-white">{diploma.total_xp}</div>
                <div className="text-white/60">Total XP Earned</div>
              </div>
            </div>
          </div>

          {/* Skill XP */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Skill Development</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {diploma.skill_xp?.map((skill) => (
                <div key={skill.skill_category} className="bg-white/10 rounded-lg p-4">
                  <div className="text-lg font-semibold text-white capitalize mb-2">
                    {skill.skill_category.replace('_', ' ')}
                  </div>
                  <div className="text-2xl font-bold text-white">{skill.total_xp || skill.xp_amount || 0} XP</div>
                </div>
              ))}
            </div>
          </div>

          {/* Completed Quests */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Completed Quests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diploma.completed_quests?.map((quest) => (
                <div key={quest.id} className="bg-white/10 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {quest.quests?.title || 'Quest'}
                  </h3>
                  <p className="text-white/60 text-sm mb-2">
                    {quest.quests?.description || 'No description available'}
                  </p>
                  <p className="text-white/80 text-sm">
                    Completed: {formatDate(quest.completed_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user view
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Your Diploma</h1>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex-1">
              <p className="text-white/80 mb-2">Share your achievements with others:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareableLink}
                  readOnly
                  className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                />
                <button
                  onClick={copyShareLink}
                  className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Copy Link
                </button>
              </div>
            </div>
            <div className="bg-white/10 rounded-lg p-4 min-w-[200px]">
              <div className="text-3xl font-bold text-white">{calculateTotalXP()}</div>
              <div className="text-white/60">Total XP Earned</div>
            </div>
          </div>
        </div>

        {/* XP by Pillar */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">XP by Skill Pillar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(pillarColors).map(([pillar, gradient]) => (
              <div key={pillar} className={`bg-gradient-to-br ${gradient} rounded-lg p-4`}>
                <div className="text-lg font-semibold text-white capitalize mb-2">
                  {pillar.replace('_', ' ')}
                </div>
                <div className="text-2xl font-bold text-white">{totalXP[pillar] || 0} XP</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements Grid */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Completed Achievements</h2>
          {achievements.length === 0 ? (
            <p className="text-white/60">No achievements completed yet. Complete quests to earn achievements!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.map((achievement) => (
                <div
                  key={achievement.quest_id}
                  className="bg-white/10 rounded-lg p-6 cursor-pointer hover:bg-white/20 transition-all"
                  onClick={() => openAchievementModal(achievement)}
                >
                  <h3 className="text-xl font-semibold text-white mb-2">{achievement.quest_title}</h3>
                  <p className="text-white/60 text-sm mb-4">{achievement.quest_description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-white/80">
                      {Object.keys(achievement.task_evidence || {}).length} tasks
                    </span>
                    <span className="text-[#ef597b] font-semibold">
                      {achievement.total_xp_earned} XP
                    </span>
                  </div>
                  <div className="mt-4 text-white/60 text-sm">
                    Completed: {formatDate(achievement.completed_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeAchievementModal}>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 max-w-4xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-white">{selectedAchievement.quest_title}</h2>
              <button
                onClick={closeAchievementModal}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <p className="text-white/80 mb-6">{selectedAchievement.quest_description}</p>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Completed Tasks:</h3>
              {Object.entries(selectedAchievement.task_evidence || {}).map(([taskId, evidence]) => (
                <div key={taskId} className="bg-white/10 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-lg font-medium text-white">{evidence.task_title}</h4>
                    <span className="text-[#ef597b] font-semibold">{evidence.xp_awarded} XP</span>
                  </div>
                  <p className="text-white/60 text-sm mb-2">{evidence.task_description}</p>
                  {evidence.evidence_text && (
                    <div className="bg-white/5 rounded p-3 mt-2">
                      <p className="text-white/80 text-sm">{evidence.evidence_text}</p>
                    </div>
                  )}
                  {evidence.evidence_url && (
                    <div className="mt-2">
                      <a
                        href={evidence.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#ef597b] hover:underline text-sm"
                      >
                        View Evidence →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-between items-center">
              <div className="text-white/60">
                Completed: {formatDate(selectedAchievement.completed_at)}
              </div>
              <div className="text-2xl font-bold text-white">
                Total: {selectedAchievement.total_xp_earned} XP
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiplomaPageV3;