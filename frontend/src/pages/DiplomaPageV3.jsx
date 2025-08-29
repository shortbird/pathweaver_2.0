import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (slug) {
      // Portfolio route - public access
      fetchPublicDiploma();
    } else if (user) {
      // Authenticated user viewing their own diploma
      fetchAchievements();
      generateShareableLink();
    }
  }, [user, slug, userId]);

  const fetchPublicDiploma = async () => {
    try {
      const response = await api.get(`/portfolio/public/${slug}`);
      setDiploma(response.data);
      
      // Transform the data to match achievements format if needed
      // For now, we'll display the diploma data differently
    } catch (error) {
      if (error.response?.status === 404) {
        setError('Diploma not found or is private');
      } else {
        setError('Failed to load diploma');
      }
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)', border: '1px solid rgba(109,70,155,0.08)' }}>
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
          <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)', border: '1px solid rgba(109,70,155,0.08)' }}>
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
          <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)', border: '1px solid rgba(109,70,155,0.08)' }}>
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
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#6d469b' }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#003f5c' }}>Diploma Not Available</h2>
          <p style={{ color: '#003f5c', opacity: 0.7 }}>{error}</p>
        </div>
      </div>
    );
  }

  // Single return statement with conditional rendering
  return (
    <div className="max-w-7xl mx-auto px-4 py-10" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        {diploma ? (
          // Public diploma view
          <>
            {/* Header */}
            <div className="rounded-xl shadow-lg overflow-hidden mb-8" style={{ background: 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)', boxShadow: '0 4px 20px rgba(239, 89, 123, 0.35)' }}>
              <div className="p-12 text-white">
                <div className="text-center">
                  <h1 className="text-5xl font-bold mb-3" style={{ letterSpacing: '-1px' }}>Optio Diploma</h1>
                  <p className="text-2xl text-white/90">
                    {diploma.student?.first_name} {diploma.student?.last_name}
                  </p>
                  <div className="mt-4">
                    <p className="text-lg font-semibold">{formatDate(diploma.diploma_issued)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl p-6" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)', borderLeft: '4px solid #ef597b' }}>
                <h3 className="text-4xl font-bold" style={{ color: '#6d469b' }}>
                  {diploma.total_xp || 0}
                </h3>
                <p className="font-semibold" style={{ color: '#003f5c' }}>Total Experience Points</p>
                <p className="text-sm mt-1" style={{ color: '#003f5c', opacity: 0.6 }}>Earned through validated learning</p>
              </div>
              <div className="bg-white rounded-xl p-6" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)', borderLeft: '4px solid #6d469b' }}>
                <h3 className="text-4xl font-bold" style={{ color: '#ef597b' }}>
                  {diploma.total_quests_completed || 0}
                </h3>
                <p className="font-semibold" style={{ color: '#003f5c' }}>Quests Completed</p>
                <p className="text-sm mt-1" style={{ color: '#003f5c', opacity: 0.6 }}>Real-world challenges mastered</p>
              </div>
              <div className="bg-white rounded-xl p-6" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)', borderLeft: '4px solid #ef597b' }}>
                <h3 className="text-4xl font-bold" style={{ color: '#6d469b' }}>
                  {diploma.skill_details?.length || 0}
                </h3>
                <p className="font-semibold" style={{ color: '#003f5c' }}>Skills Developed</p>
                <p className="text-sm mt-1" style={{ color: '#003f5c', opacity: 0.6 }}>Unique competencies demonstrated</p>
              </div>
            </div>
          </>
        ) : (
          // Authenticated user diploma view
          <>
            {/* Header */}
            <div className="rounded-xl shadow-lg overflow-hidden mb-8" style={{ background: 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)', boxShadow: '0 4px 20px rgba(239, 89, 123, 0.35)' }}>
              <div className="p-12 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-5xl font-bold mb-3" style={{ letterSpacing: '-1px' }}>My Learning Diploma</h1>
                    <p className="text-white/90 text-lg">
                      A showcase of my completed quests and earned achievements
                    </p>
                  </div>
                  <button
                    onClick={copyShareLink}
                    className="px-6 py-3 rounded-full transition-all font-semibold text-sm"
                    style={{ 
                      background: 'white', 
                      color: '#6d469b',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                    onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                  >
                    Share Diploma 🔗
                  </button>
                </div>

                {/* XP Summary */}
                <div className="mt-10 grid grid-cols-2 md:grid-cols-5 gap-4">
                  {Object.entries(pillarColors).map(([pillar, gradient]) => {
                    const xp = totalXP[pillar] || 0;
                    return (
                      <div key={pillar} className="bg-white/15 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <div className="text-xs font-semibold mb-2 capitalize text-white/80">
                          {pillar.replace('_', ' ')}
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {xp.toLocaleString()} XP
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Achievements Grid */}
            {achievements.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
            <svg className="mx-auto h-16 w-16 mb-4" fill="currentColor" viewBox="0 0 20 20" style={{ color: '#6d469b', opacity: 0.3 }}>
              <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <p className="text-lg mb-2 font-semibold" style={{ color: '#003f5c' }}>No completed quests yet</p>
            <p style={{ color: '#003f5c', opacity: 0.7 }}>Complete quests to showcase your achievements here!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {achievements.map((achievement) => (
              <div 
                key={achievement.quest.id}
                className="bg-white rounded-xl overflow-hidden transition-all cursor-pointer hover:transform hover:-translate-y-1"
                style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}
                onClick={() => setSelectedAchievement(achievement)}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 8px 20px rgba(109,70,155,0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.07)'}
              >
                {/* Quest Header Image */}
                {achievement.quest.header_image_url ? (
                  <img 
                    src={achievement.quest.header_image_url}
                    alt={achievement.quest.title}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="h-32 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)' }}>
                    <div className="text-white text-4xl">🏆</div>
                  </div>
                )}

                <div className="p-5">
                  <h3 className="font-bold mb-2" style={{ color: '#003f5c', fontSize: '18px' }}>{achievement.quest.title}</h3>
                  <p className="text-sm mb-3 line-clamp-2" style={{ color: '#003f5c', opacity: 0.8, lineHeight: 1.6 }}>
                    {achievement.quest.big_idea}
                  </p>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span style={{ color: '#003f5c', opacity: 0.6 }}>
                      Completed {formatDate(achievement.completed_at)}
                    </span>
                    <span className="font-bold" style={{ color: '#6d469b' }}>
                      {achievement.total_xp_earned} XP
                    </span>
                  </div>

                  <div className="mt-3 px-3 py-1 rounded-full inline-block" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.1) 0%, rgba(109,70,155,0.1) 100%)', border: '1px solid rgba(109,70,155,0.2)' }}>
                    <span className="text-xs font-semibold" style={{ color: '#6d469b' }}>
                      {Object.keys(achievement.task_evidence).length} tasks completed
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

            {/* Achievement Detail Modal */}
            {selectedAchievement && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                  <div className="sticky top-0 p-8" style={{ background: 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)' }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-3xl font-bold text-white" style={{ letterSpacing: '-0.5px' }}>
                          {selectedAchievement.quest.title}
                        </h2>
                        <p className="text-white/80 mt-2">
                          Completed on {formatDate(selectedAchievement.completed_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedAchievement(null)}
                        className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="p-8">
                    <div className="mb-8 p-6 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.05) 0%, rgba(109,70,155,0.05) 100%)', border: '1px solid rgba(109,70,155,0.1)' }}>
                      <h3 className="text-lg font-bold mb-3" style={{ color: '#6d469b' }}>Quest Overview</h3>
                      <p style={{ color: '#003f5c', lineHeight: 1.7 }}>{selectedAchievement.quest.big_idea}</p>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold mb-4" style={{ color: '#003f5c' }}>Completed Tasks & Evidence</h3>
                      <div className="space-y-4">
                        {Object.entries(selectedAchievement.task_evidence).map(([taskTitle, evidence]) => (
                          <div key={taskTitle} className="rounded-xl p-5" style={{ background: 'white', border: '1px solid rgba(109,70,155,0.15)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                            <div className="mb-3">
                              <h4 className="font-semibold" style={{ color: '#003f5c', fontSize: '16px' }}>{taskTitle}</h4>
                              <div className="flex items-center gap-3 mt-2">
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${pillarColors[evidence.pillar]}`} style={{ boxShadow: '0 2px 8px rgba(109,70,155,0.25)' }}>
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
          </>
        )}
      </div>
  );
};

export default DiplomaPageV3;