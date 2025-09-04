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
      const apiBase = import.meta.env.VITE_API_URL || '';
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
      const apiBase = import.meta.env.VITE_API_URL || '';
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Scroll to top on navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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

        {/* Philosophy Section */}
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-8 mb-8 border border-gray-100" style={{ boxShadow: '0 8px 25px rgba(109, 70, 155, 0.05)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#ef597b]/20 to-[#6d469b]/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#6d469b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            
            <h2 className="text-3xl font-bold mb-4" style={{ color: '#003f5c' }}>The Process Is The Goal</h2>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6 max-w-3xl mx-auto">
              This learning story represents a revolutionary approach to education where the journey of discovery is celebrated above all else. 
              Every quest completed, every skill developed, and every moment of curiosity followed reflects genuine personal growth.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="p-6 rounded-xl bg-white/50 backdrop-blur-sm">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#ef597b]/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#ef597b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">Self-Directed Learning</h3>
                <p className="text-sm text-gray-600">Learning driven by genuine curiosity and personal passion, not external requirements.</p>
              </div>
              
              <div className="p-6 rounded-xl bg-white/50 backdrop-blur-sm">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#6d469b]/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#6d469b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 0l3 3m-3-3l-3 3m0 12v-1m0 0l3-3m-3 3l-3-3m9-1h-1m0 0l-3 3m3-3l3-3m-12 9h1m0 0l3-3m-3 3l-3 3" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">Growth-Focused</h3>
                <p className="text-sm text-gray-600">Celebrating the process of becoming rather than proving what you already know.</p>
              </div>
              
              <div className="p-6 rounded-xl bg-white/50 backdrop-blur-sm">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#ef597b]/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#ef597b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">Joy-Driven</h3>
                <p className="text-sm text-gray-600">Learning for the pure satisfaction of understanding and creating something new.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Learning Journey Section */}
        <div className="mb-8">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold mb-4" style={{ color: '#003f5c' }}>Learning Adventures</h2>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              Each adventure represents a moment of curiosity transformed into growth. This is where learning comes alive through 
              exploration, creation, and personal discovery—celebrating the journey of becoming.
            </p>
            {achievements.length > 0 && (
              <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 border border-[#6d469b]/20">
                <svg className="w-5 h-5 text-[#6d469b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold text-[#6d469b]">
                  {achievements.length} Learning {achievements.length === 1 ? 'Adventure' : 'Adventures'} Completed
                </span>
              </div>
            )}
          </div>

          {achievements.length === 0 ? (
              <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-16 text-center border-2 border-dashed border-gray-200" style={{ boxShadow: '0 8px 25px rgba(109, 70, 155, 0.05)' }}>
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#ef597b]/20 to-[#6d469b]/20 flex items-center justify-center">
                  <svg className="w-12 h-12 text-[#6d469b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-3" style={{ color: '#003f5c' }}>Your Learning Story Begins Here</h3>
                <p className="text-gray-600 text-lg leading-relaxed max-w-md mx-auto mb-6">
                  Every quest you complete becomes part of your unique learning journey. Each challenge you embrace adds to your growing story of curiosity and growth.
                </p>
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-full font-semibold hover:shadow-lg transition-all cursor-pointer group">
                  <span>Start Your First Adventure</span>
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
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
                    <div className="mb-8 p-8 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.08) 0%, rgba(109,70,155,0.08) 100%)', border: '1px solid rgba(109,70,155,0.15)' }}>
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#ef597b] to-[#6d469b] flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold mb-4" style={{ color: '#6d469b' }}>Adventure Overview</h3>
                          <p className="text-lg leading-relaxed" style={{ color: '#003f5c' }}>{selectedAchievement.quest.big_idea}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold mb-6" style={{ color: '#003f5c' }}>Learning Journey & Evidence</h3>
                      <p className="text-gray-600 mb-6 leading-relaxed">
                        Each task represents a moment of growth and discovery. The evidence below showcases the creative process, 
                        problem-solving, and genuine learning that took place during this adventure.
                      </p>
                      <div className="space-y-4">
                        {Object.entries(selectedAchievement.task_evidence).map(([taskTitle, evidence], index) => (
                          <div key={taskTitle} className="rounded-2xl p-6 mb-4" style={{ background: 'white', border: '1px solid rgba(109,70,155,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ef597b] to-[#6d469b] flex items-center justify-center text-white font-bold text-sm">
                                  {index + 1}
                                </div>
                              </div>
                              <div className="flex-1">
                                <h4 className="font-bold text-lg mb-3" style={{ color: '#003f5c' }}>{taskTitle}</h4>
                                
                                <div className="flex flex-wrap items-center gap-3 mb-4">
                                  <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r ${pillarColors[evidence.pillar]}`} style={{ boxShadow: '0 3px 12px rgba(109,70,155,0.25)' }}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    {evidence.pillar.replace('_', ' ')}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                    +{evidence.xp_awarded} Growth Points
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {formatDate(evidence.completed_at)}
                                  </span>
                                </div>
                                
                                <div>
                                  <p className="text-sm font-semibold text-gray-700 mb-3">Learning Evidence:</p>
                                  {renderEvidence(evidence)}
                                </div>
                              </div>
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