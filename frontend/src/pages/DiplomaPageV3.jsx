import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import DiplomaHeader from '../components/diploma/DiplomaHeader';
import DiplomaStats from '../components/diploma/DiplomaStats';
import SkillsRadarChart from '../components/diploma/SkillsRadarChart';
import AchievementCard from '../components/diploma/AchievementCard';
import { SkeletonDiplomaHeader, SkeletonStats, SkeletonAchievementGrid } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { formatErrorMessage } from '../utils/errorMessages';

const DiplomaPageV3 = () => {
  const { user, loginTimestamp } = useAuth();
  const { slug, userId } = useParams();
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState(null);
  const [shareableLink, setShareableLink] = useState('');
  const [diploma, setDiploma] = useState(null);
  const [error, setError] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [totalXPCount, setTotalXPCount] = useState(0);

  const pillarColors = {
    creativity: 'from-[#ef597b] to-[#6d469b]',
    critical_thinking: 'from-[#6d469b] to-[#ef597b]',
    practical_skills: 'from-[#ef597b] to-[#6d469b]',
    communication: 'from-[#6d469b] to-[#ef597b]',
    cultural_literacy: 'from-[#ef597b] to-[#6d469b]'
  };

  useEffect(() => {
    // Clear previous data when component mounts or dependencies change
    setAchievements([]);
    setTotalXP({});
    setTotalXPCount(0);
    setIsLoading(true);
    
    if (slug) {
      // Portfolio route - public access via slug
      fetchPublicDiploma();
    } else if (userId) {
      // Public diploma route via userId
      fetchPublicDiplomaByUserId();
    } else if (user) {
      // Authenticated user viewing their own diploma (no params)
      fetchAchievements();
      generateShareableLink();
    } else {
      // No user and no params - show loading
      setIsLoading(true);
    }
  }, [user, slug, userId, loginTimestamp]);

  // Refresh data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && !slug && !userId) {
        console.log('Page became visible, refreshing achievements...');
        fetchAchievements();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also refresh on focus
    const handleFocus = () => {
      if (user && !slug && !userId) {
        console.log('Window focused, refreshing achievements...');
        fetchAchievements();
      }
    };
    
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, slug, userId]);

  const fetchPublicDiploma = async () => {
    try {
      const response = await api.get(`/portfolio/public/${slug}`);
      setDiploma(response.data);
      
      // Transform the data to match achievements format if needed
      // For now, we'll display the diploma data differently
    } catch (error) {
      const errorInfo = formatErrorMessage(
        error.response?.status === 404 ? 'diploma/not-found' : 'diploma/private'
      );
      setError(errorInfo);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPublicDiplomaByUserId = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiBase}/portfolio/diploma/${userId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch diploma');
      }
      
      const data = await response.json();
      setDiploma(data);
    } catch (error) {
      const errorInfo = formatErrorMessage(
        error.response?.status === 404 ? 'diploma/not-found' : 'diploma/private'
      );
      setError(errorInfo);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAchievements = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const token = localStorage.getItem('access_token');
      console.log('Fetching achievements with token:', token ? 'present' : 'missing');
      
      // Fetch both completed quests and user XP data
      const [questsResponse, dashboardResponse] = await Promise.all([
        fetch(`${apiBase}/v3/quests/completed?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        }),
        fetch(`${apiBase}/users/dashboard?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        })
      ]);

      if (!questsResponse.ok) {
        // If no achievements, that's okay - show empty state
        if (questsResponse.status === 404) {
          // Still try to get XP from dashboard
          if (dashboardResponse.ok) {
            const dashboardData = await dashboardResponse.json();
            console.log('Dashboard XP data:', dashboardData.xp_by_category);
            setTotalXP(dashboardData.xp_by_category || {});
            setTotalXPCount(dashboardData.stats?.total_xp || 0);
          } else {
            setTotalXP({});
            setTotalXPCount(0);
          }
          setAchievements([]);
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to fetch achievements');
      }

      const questsData = await questsResponse.json();
      const dashboardData = dashboardResponse.ok ? await dashboardResponse.json() : null;
      
      console.log('Completed quests response:', questsData);
      console.log('Dashboard response:', dashboardData);
      console.log('Number of achievements:', questsData.achievements?.length || 0);
      setAchievements(questsData.achievements || []);

      // Use XP from dashboard if available (most reliable source)
      if (dashboardData?.xp_by_category) {
        console.log('Using dashboard XP data:', dashboardData.xp_by_category);
        setTotalXP(dashboardData.xp_by_category);
        setTotalXPCount(dashboardData.stats?.total_xp || 0);
      } else {
        // Fallback: Calculate total XP by pillar from achievements
        const xpByPillar = {};
        let totalXPSum = 0;
        console.log('Calculating XP from achievements...');
        questsData.achievements?.forEach((achievement, idx) => {
          console.log(`Achievement ${idx + 1}:`, achievement.quest?.title);
          Object.entries(achievement.task_evidence || {}).forEach(([taskName, evidence]) => {
            console.log(`  Task: ${taskName}, Pillar: ${evidence.pillar}, XP: ${evidence.xp_awarded}`);
            const pillar = evidence.pillar;
            if (pillar) {
              xpByPillar[pillar] = (xpByPillar[pillar] || 0) + evidence.xp_awarded;
              totalXPSum += evidence.xp_awarded;
            }
          });
        });
        console.log('Final XP by pillar:', xpByPillar);
        console.log('Total XP sum:', totalXPSum);
        setTotalXP(xpByPillar);
        setTotalXPCount(totalXPSum);
      }

    } catch (error) {
      console.error('Error fetching achievements:', error);
      // Don't show error for authenticated users, just show empty achievements
      setAchievements([]);
      setTotalXP({});
      setTotalXPCount(0);
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
    // Better feedback than alert
    const button = document.activeElement;
    const originalText = button?.innerText;
    if (button) {
      button.innerText = 'Copied!';
      setTimeout(() => {
        button.innerText = originalText;
      }, 2000);
    }
  };

  const handleTogglePreview = () => {
    setPreviewMode(!previewMode);
  };

  // Determine if current user is the owner
  // Owner when: viewing /diploma (no params) OR viewing their own userId
  const isOwner = user && (!slug && (!userId || user.id === userId));

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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <SkeletonDiplomaHeader />
          <SkeletonStats />
          <div className="bg-white rounded-xl p-8 mb-8 shadow-sm">
            <div className="h-6 w-48 bg-gray-200 rounded mb-4 animate-pulse" />
            <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          </div>
          <div className="mb-8">
            <div className="h-6 w-48 bg-gray-200 rounded mb-6 animate-pulse" />
            <SkeletonAchievementGrid />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex justify-center items-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#003f5c' }}>
            {error.message || 'Diploma Not Available'}
          </h2>
          <p className="text-gray-600 mb-6">
            {error.suggestion || 'This diploma may be private or does not exist.'}
          </p>
          <Button 
            variant="primary"
            onClick={() => window.location.href = '/'}
          >
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  // Unified view - show same layout for both public and owner, with conditional elements
  const viewMode = isOwner && !previewMode ? 'owner' : 'public';
  const displayData = diploma || {
    student: user,
    total_xp: totalXPCount,
    total_quests_completed: achievements.length,
    skill_details: Object.keys(totalXP)
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Unified Diploma Header */}
        <DiplomaHeader 
          user={user}
          isOwner={isOwner}
          previewMode={previewMode}
          onTogglePreview={handleTogglePreview}
          onShare={copyShareLink}
          diploma={diploma}
        />

        {/* Stats Overview */}
        <DiplomaStats 
          totalXP={displayData.total_xp || totalXPCount}
          questsCompleted={displayData.total_quests_completed || achievements.length}
          skillsCount={displayData.skill_details?.length || Object.keys(totalXP).length}
          achievements={achievements}
        />

        {/* Skills Radar Chart */}
        <SkillsRadarChart skillsXP={totalXP} />

        {/* Achievements Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold" style={{ color: '#003f5c' }}>Life Achievements</h2>
            {achievements.length > 0 && (
              <span className="text-sm text-gray-600">
                {achievements.length} Validated {achievements.length === 1 ? 'Achievement' : 'Achievements'}
              </span>
            )}
          </div>

          {achievements.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.07)' }}>
            <svg className="mx-auto h-16 w-16 mb-4" fill="currentColor" viewBox="0 0 20 20" style={{ color: '#6d469b', opacity: 0.3 }}>
              <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <p className="text-lg mb-2 font-semibold" style={{ color: '#003f5c' }}>No completed quests yet</p>
            <p style={{ color: '#003f5c', opacity: 0.7 }}>Your validated academic achievements will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.map((achievement, index) => {
                console.log(`Rendering achievement ${index + 1}/${achievements.length}:`, achievement.quest?.title);
                return (
                  <AchievementCard 
                    key={`${achievement.quest.id}-${index}`}
                    achievement={achievement}
                    onClick={setSelectedAchievement}
                  />
                );
              })}
            </div>
          )}
        </div>

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
      </div>
    </div>
  );
};

export default DiplomaPageV3;