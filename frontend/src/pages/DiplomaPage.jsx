import React, { useState, useEffect, memo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import SkillsRadarChart from '../components/diploma/SkillsRadarChart';
import AccreditedDiplomaModal from '../components/diploma/AccreditedDiplomaModal';
import BadgeCarouselCard from '../components/hub/BadgeCarouselCard';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import { SkeletonDiplomaHeader, SkeletonStats, SkeletonAchievementGrid } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { formatErrorMessage } from '../utils/errorMessages';
import { hasFeatureAccess } from '../utils/tierMapping';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  TOTAL_CREDITS_REQUIRED,
  meetsGraduationRequirements
} from '../utils/creditRequirements';

const DiplomaPage = () => {
  const { user, loginTimestamp } = useAuth();
  const { slug, userId } = useParams();
  const navigate = useNavigate();
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [subjectXP, setSubjectXP] = useState({});  // NEW: Subject-specific XP
  const [earnedBadges, setEarnedBadges] = useState([]);  // Earned badges
  const [learningEvents, setLearningEvents] = useState([]);  // Learning events
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState(null);
  const [shareableLink, setShareableLink] = useState('');
  const [diploma, setDiploma] = useState(null);
  const [error, setError] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [totalXPCount, setTotalXPCount] = useState(0);
  const [showDiplomaExplanation, setShowDiplomaExplanation] = useState(false);
  const [showAccreditedDiplomaModal, setShowAccreditedDiplomaModal] = useState(false);

  // Check if user has access to diploma feature
  const hasAccess = hasFeatureAccess(user?.subscription_tier, 'supported');

  const pillarColors = {
    'Arts & Creativity': 'from-[#ef597b] to-[#6d469b]',
    'STEM & Logic': 'from-[#6d469b] to-[#ef597b]',
    'Life & Wellness': 'from-[#ef597b] to-[#6d469b]',
    'Language & Communication': 'from-[#6d469b] to-[#ef597b]',
    'Society & Culture': 'from-[#ef597b] to-[#6d469b]',
    // Legacy mappings
    creativity: 'from-[#ef597b] to-[#6d469b]',
    critical_thinking: 'from-[#6d469b] to-[#ef597b]',
    practical_skills: 'from-[#ef597b] to-[#6d469b]',
    communication: 'from-[#6d469b] to-[#ef597b]',
    cultural_literacy: 'from-[#ef597b] to-[#6d469b]',
    // Underscore format mappings for database consistency
    'arts_creativity': 'from-[#ef597b] to-[#6d469b]',
    'stem_logic': 'from-[#6d469b] to-[#ef597b]',
    'life_wellness': 'from-[#ef597b] to-[#6d469b]',
    'language_communication': 'from-[#6d469b] to-[#ef597b]',
    'society_culture': 'from-[#ef597b] to-[#6d469b]'
  };

  // Pillar display names for UI
  const pillarDisplayNames = {
    'Arts & Creativity': 'Arts & Creativity',
    'STEM & Logic': 'STEM & Logic',
    'Life & Wellness': 'Life & Wellness',
    'Language & Communication': 'Language & Communication',
    'Society & Culture': 'Society & Culture',
    // Legacy mappings
    creativity: 'Arts & Creativity',
    critical_thinking: 'STEM & Logic',
    practical_skills: 'Life & Wellness',
    communication: 'Language & Communication',
    cultural_literacy: 'Society & Culture',
    // Underscore format mappings for database consistency
    'arts_creativity': 'Arts & Creativity',
    'stem_logic': 'STEM & Logic',
    'life_wellness': 'Life & Wellness',
    'language_communication': 'Language & Communication',
    'society_culture': 'Society & Culture'
  };

  // School subject display names for diploma credits
  const subjectDisplayNames = {
    'language_arts': 'Language Arts',
    'math': 'Mathematics',
    'science': 'Science',
    'social_studies': 'Social Studies',
    'financial_literacy': 'Financial Literacy',
    'health': 'Health',
    'pe': 'Physical Education',
    'fine_arts': 'Fine Arts',
    'cte': 'Career & Technical Education',
    'digital_literacy': 'Digital Literacy',
    'electives': 'Electives'
  };

  // Subject colors for visual appeal
  const subjectColors = {
    'language_arts': 'from-blue-500 to-indigo-600',
    'math': 'from-green-500 to-emerald-600',
    'science': 'from-purple-500 to-violet-600',
    'social_studies': 'from-amber-500 to-orange-600',
    'financial_literacy': 'from-emerald-500 to-teal-600',
    'health': 'from-rose-500 to-pink-600',
    'pe': 'from-cyan-500 to-blue-600',
    'fine_arts': 'from-[#ef597b] to-[#6d469b]',
    'cte': 'from-slate-500 to-gray-600',
    'digital_literacy': 'from-indigo-500 to-blue-600',
    'electives': 'from-gray-500 to-slate-600'
  };

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    
    // Clear previous data when component mounts or dependencies change
    setAchievements([]);
    setTotalXP({});
    setSubjectXP({});
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
      if (hasAccess) {
        fetchAchievements();
        fetchSubjectXP();  // NEW: Fetch subject-specific XP
        fetchEarnedBadges();  // Fetch earned badges
        fetchLearningEvents();  // Fetch learning events
        generateShareableLink();
      } else {
        // User doesn't have access, just stop loading
        setIsLoading(false);
      }
    } else {
      // No user and no params - show loading
      setIsLoading(true);
    }
  }, [user, slug, userId, loginTimestamp, hasAccess]);

  // Refresh data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && !slug && !userId && hasAccess) {
        fetchAchievements();
        fetchSubjectXP();
        fetchEarnedBadges();
        fetchLearningEvents();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also refresh on focus
    const handleFocus = () => {
      if (user && !slug && !userId && hasAccess) {
        fetchAchievements();
        fetchSubjectXP();
        fetchEarnedBadges();
        fetchLearningEvents();
      }
    };
    
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, slug, userId, hasAccess]);

  const fetchPublicDiploma = async () => {
    try {
      const response = await api.get(`/api/portfolio/public/${slug}`);
      const diplomaData = response.data;
      setDiploma(diplomaData);

      // Fetch badges and learning events for public diploma if user_id is available
      if (diplomaData?.user_id) {
        await fetchEarnedBadges(diplomaData.user_id);
        await fetchLearningEvents(diplomaData.user_id);
      }

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
      // Use api service for proper CORS handling, but this is a public endpoint
      const response = await api.get(`/api/portfolio/diploma/${userId}`);
      const data = response.data;

      console.log('Public diploma data received:', data);

      // Set diploma state with the full response
      setDiploma(data);

      // Extract and set achievements (completed and in-progress quests)
      if (data.achievements) {
        setAchievements(data.achievements);
      }

      // Extract and set XP data
      if (data.skill_xp) {
        setTotalXP(data.skill_xp);
      }

      if (data.total_xp) {
        setTotalXPCount(data.total_xp);
      }

      // Fetch badges and learning events for public diploma
      if (userId) {
        await fetchEarnedBadges(userId);
        await fetchLearningEvents(userId);
      }
    } catch (error) {
      console.error('Error fetching public diploma:', error);
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
      // Fetch both completed quests and user XP data using api service with cookies
      const [questsResponse, dashboardResponse] = await Promise.all([
        api.get(`/api/quests/completed?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache'
          }
        }).catch(error => ({ error, status: error.response?.status })),
        api.get(`/api/users/dashboard?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache'
          }
        }).catch(error => ({ error, status: error.response?.status }))
      ]);

      // Handle quests response
      if (questsResponse.error) {
        // If no achievements, that's okay - show empty state
        if (questsResponse.status === 404) {
          // Still try to get XP from dashboard
          if (!dashboardResponse.error) {
            const dashboardData = dashboardResponse.data;
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

      const questsData = questsResponse.data;
      const dashboardData = !dashboardResponse.error ? dashboardResponse.data : null;


      setAchievements(questsData.achievements || []);

      // Use XP from dashboard if available (most reliable source)
      if (dashboardData?.xp_by_category) {
        setTotalXP(dashboardData.xp_by_category);
        setTotalXPCount(dashboardData.stats?.total_xp || 0);
      } else {
        // Fallback: Calculate total XP by pillar from achievements
        const xpByPillar = {};
        let totalXPSum = 0;
        questsData.achievements?.forEach((achievement, idx) => {
          Object.entries(achievement.task_evidence || {}).forEach(([taskName, evidence]) => {
            const pillar = evidence.pillar;
            if (pillar) {
              xpByPillar[pillar] = (xpByPillar[pillar] || 0) + evidence.xp_awarded;
              totalXPSum += evidence.xp_awarded;
            }
          });
        });
        setTotalXP(xpByPillar);
        setTotalXPCount(totalXPSum);
      }

    } catch (error) {
      // Don't show error for authenticated users, just show empty achievements
      setAchievements([]);
      setTotalXP({});
      setTotalXPCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubjectXP = async () => {
    try {
      const response = await api.get('/api/users/subject-xp', {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (response.data) {
        const data = response.data;
        // Transform array to object with subject as key
        const subjectXPMap = {};
        if (data.subject_xp) {
          data.subject_xp.forEach(item => {
            subjectXPMap[item.school_subject] = item.xp_amount;
          });
        }
        setSubjectXP(subjectXPMap);
      } else {
        // If endpoint doesn't exist yet, silently handle
        setSubjectXP({});
      }
    } catch (error) {
      // Silently handle error for now
      setSubjectXP({});
    }
  };

  const fetchEarnedBadges = async (targetUserId = null) => {
    try {
      const userIdToFetch = targetUserId || user?.id;
      if (!userIdToFetch) return;

      const response = await api.get(`/api/badges/user/${userIdToFetch}`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (response.data && response.data.user_badges) {
        // Filter to only show earned badges on diploma
        const earned = response.data.user_badges.filter(b => b.is_earned);
        setEarnedBadges(earned);
      } else {
        setEarnedBadges([]);
      }
    } catch (error) {
      // Silently handle error - badges are optional
      setEarnedBadges([]);
    }
  };

  const fetchLearningEvents = async (targetUserId = null) => {
    try {
      const userIdToFetch = targetUserId || user?.id;
      if (!userIdToFetch) return;

      // Use public endpoint if viewing someone else's diploma (via slug or userId)
      const endpoint = slug || userId
        ? `/api/users/${userIdToFetch}/learning-events/public`
        : `/api/learning-events`;

      const response = await api.get(endpoint, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (response.data && response.data.events) {
        setLearningEvents(response.data.events);
      } else {
        setLearningEvents([]);
      }
    } catch (error) {
      // Silently handle error - learning events are optional
      setLearningEvents([]);
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
    // Handle new multi-format evidence
    if (evidence.evidence_type === 'multi_format') {
      const blocks = evidence.evidence_blocks || [];

      if (!blocks || blocks.length === 0) {
        return (
          <div className="p-6 rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-800 mb-1">Evidence Document Unavailable</h4>
                <p className="text-sm text-yellow-700">
                  This task was completed with a multi-format evidence document, but the content is not currently available for display.
                </p>
              </div>
            </div>
          </div>
        );
      }

      const MultiFormatEvidenceDisplay = React.lazy(() => import('../components/diploma/MultiFormatEvidenceDisplay'));
      return (
        <React.Suspense fallback={
          <div className="p-6 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 border border-[#6d469b]/15 rounded-lg">
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#6d469b]"></div>
              <p className="text-sm text-gray-600">Loading evidence...</p>
            </div>
          </div>
        }>
          <MultiFormatEvidenceDisplay blocks={blocks} />
        </React.Suspense>
      );
    }

    // Handle legacy single-format evidence
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
        const linkUrl = evidence.evidence_content;
        if (!linkUrl || linkUrl === '' || linkUrl === 'undefined') {
          return (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Link evidence not available</p>
            </div>
          );
        }

        // Ensure URL has proper protocol
        const formattedUrl = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;

        // Create display text (truncate if too long)
        const displayText = linkUrl.length > 50 ? `${linkUrl.substring(0, 47)}...` : linkUrl;

        return (
          <div className="p-3 bg-blue-50 rounded-lg">
            <a
              href={formattedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline text-sm flex items-center break-all"
            >
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
              {displayText}
            </a>
          </div>
        );
      
      case 'image':
        const imageUrl = evidence.evidence_content;
        if (!imageUrl || imageUrl === '' || imageUrl === 'undefined') {
          return (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Image evidence not available</p>
            </div>
          );
        }

        return (
          <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)', border: '1px solid rgba(109,70,155,0.08)' }}>
            <img
              src={imageUrl}
              alt="Task evidence"
              className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
              onClick={() => window.open(imageUrl, '_blank')}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <p className="text-gray-500 text-sm" style={{ display: 'none' }}>
              Unable to load image evidence
            </p>
          </div>
        );
      
      case 'video':
        const videoUrl = evidence.evidence_content;
        if (!videoUrl || videoUrl === '' || videoUrl === 'undefined') {
          return (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Video evidence not available</p>
            </div>
          );
        }

        const formattedVideoUrl = videoUrl.startsWith('http') ? videoUrl : `https://${videoUrl}`;
        const videoDisplayText = videoUrl.length > 45 ? `${videoUrl.substring(0, 42)}...` : videoUrl;

        return (
          <div className="p-3 bg-orange-50 rounded-lg">
            <a
              href={formattedVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:text-orange-700 underline text-sm flex items-center break-all"
            >
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 011-1h1a1 1 0 010 2H6a1 1 0 01-1-1zm6 1a1 1 0 100 2h3a1 1 0 100-2H11z" />
              </svg>
              {videoDisplayText}
            </a>
          </div>
        );

      case 'document':
        const documentUrl = evidence.evidence_content;
        if (!documentUrl || documentUrl === '' || documentUrl === 'undefined') {
          return (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Document evidence not available</p>
            </div>
          );
        }

        const formattedDocumentUrl = documentUrl.startsWith('http') ? documentUrl : `https://${documentUrl}`;
        const documentDisplayText = documentUrl.length > 45 ? `${documentUrl.substring(0, 42)}...` : documentUrl;

        return (
          <div className="p-3 bg-gray-50 rounded-lg">
            <a
              href={formattedDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-700 underline text-sm flex items-center break-all"
            >
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              {documentDisplayText}
            </a>
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

  // If owner doesn't have access, show upgrade message
  if (isOwner && !hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="mb-8">
              <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            
            <h1 className="text-4xl font-bold mb-4">Your Portfolio Diploma</h1>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Build a professional portfolio that showcases your self-validated learning journey and achievements to the world.
            </p>
            
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
              <h2 className="text-xl font-semibold mb-6">What You Get with Supported Tier</h2>
              <div className="grid md:grid-cols-2 gap-6 text-left">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Professional Portfolio</h3>
                    <p className="text-sm text-gray-600">Create a stunning, shareable portfolio of your learning journey</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Evidence-Based Learning</h3>
                    <p className="text-sm text-gray-600">Submit and showcase real evidence of your educational accomplishments</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Growth Tracking</h3>
                    <p className="text-sm text-gray-600">Track XP and skill development across all learning dimensions</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Share Your Story</h3>
                    <p className="text-sm text-gray-600">Get a public link to share your diploma on resumes and applications</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Learning Community</h3>
                    <p className="text-sm text-gray-600">Connect with other learners and collaborate on quests</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Educational Support</h3>
                    <p className="text-sm text-gray-600">Access to a support team of experienced educators</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 p-4 bg-gradient-to-r from-[#ef597b]/5 to-[#6d469b]/5 rounded-lg border border-[#ef597b]/20">
                <p className="text-sm text-gray-700 text-center">
                  <strong>Self-Validated Learning:</strong> Take control of your education by documenting your learning process with real evidence, not test scores.
                </p>
              </div>
            </div>
            
            <div className="flex justify-center gap-4">
              <button
                onClick={() => navigate('/subscription')}
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-8 py-3 rounded-[30px] font-semibold shadow-[0_4px_20px_rgba(239,89,123,0.15)] hover:shadow-[0_6px_25px_rgba(239,89,123,0.25)] hover:-translate-y-0.5 transition-all duration-300"
              >
                Upgrade to Supported
              </button>
              <button
                onClick={() => navigate('/quests')}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-[30px] font-medium hover:bg-gray-200 transition-colors"
              >
                Continue Learning
              </button>
            </div>
          </div>
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

  // Get student display name
  const getStudentName = () => {
    const student = displayData.student || user;
    if (!student) return 'Student';
    
    const firstName = student.first_name || '';
    const lastName = student.last_name || '';
    
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    
    return student.username || 'Student';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Hero Section with Professional Diploma Title */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="relative max-w-7xl mx-auto px-4 py-12">
          <div className="text-center max-w-4xl mx-auto">
            <div className="mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-white/80 text-sm font-medium mb-3">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.909V17h2V9L12 3z"/>
                </svg>
                Portfolio Diploma
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-4" style={{ letterSpacing: '-1px' }}>
              {getStudentName()}
            </h1>
            <div className="text-base md:text-lg text-white/95 mb-6 leading-relaxed">
              <p className="mb-1">
                has accepted the responsibility to self-validate their education.
              </p>
              <p className="text-white/80">
                This portfolio diploma is a record of their learning process.
              </p>
            </div>
            <button 
              onClick={() => setShowDiplomaExplanation(true)}
              className="inline-flex items-center gap-2 text-white/90 hover:text-white hover:bg-white/10 px-4 py-2 rounded-lg transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>What is a self-validated diploma?</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Share Controls */}
        {isOwner && (
          <div className="flex justify-end mb-8">
            <button
              onClick={copyShareLink}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg transition-shadow flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
              </svg>
              Share Portfolio
            </button>
          </div>
        )}

        {/* Subtle divider line */}
        <div className="border-b border-gray-100 mb-8"></div>

        {/* Growth Dimensions */}
        {Object.keys(totalXP).length > 0 && (
          <div className="mb-12 pb-12 border-b border-gray-100">
            <SkillsRadarChart skillsXP={totalXP} />
          </div>
        )}

        {/* School Subject Credits Section */}
        {(() => {
          const creditProgress = getAllCreditProgress(subjectXP);
          const totalCreditsEarned = calculateTotalCredits(subjectXP);
          const meetsRequirements = meetsGraduationRequirements(subjectXP);

          return (
            <div className="mb-12 pb-12 border-b border-gray-100">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-3" style={{ color: '#003f5c' }}>Diploma Credits</h2>
                <p className="text-gray-600 max-w-2xl mx-auto mb-4">
                  Progress toward an accredited high school diploma through evidence-based learning
                </p>
                <button
                  onClick={() => setShowAccreditedDiplomaModal(true)}
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 rounded-lg transition-all duration-200 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>How does this work?</span>
                </button>
              </div>

              {/* Total Credits Progress */}
              <div className="max-w-2xl mx-auto mb-8">
                <div className={`p-6 rounded-xl border-2 ${
                  meetsRequirements
                    ? 'bg-green-50 border-green-200'
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Total Credits Progress</h3>
                      <p className="text-gray-600 text-sm">
                        {meetsRequirements
                          ? 'Congratulations! You meet graduation requirements!'
                          : `${(TOTAL_CREDITS_REQUIRED - totalCreditsEarned).toFixed(1)} credits remaining for graduation`
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-800">
                        {totalCreditsEarned.toFixed(1)}/{TOTAL_CREDITS_REQUIRED}
                      </div>
                      <div className="text-sm text-gray-500">Credits</div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        meetsRequirements
                          ? 'bg-gradient-to-r from-green-400 to-green-600'
                          : 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]'
                      }`}
                      style={{
                        width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                      }}
                    ></div>
                  </div>
                  <div className="text-center mt-2 text-sm text-gray-600">
                    {Math.round((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100)}% Complete
                  </div>
                </div>
              </div>

              {/* Subject Credits Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {creditProgress.map((credit) => (
                  <div
                    key={credit.subject}
                    className={`bg-white rounded-xl p-6 shadow-sm border transition-all duration-200 hover:shadow-md ${
                      credit.isComplete
                        ? 'border-green-200 bg-green-50'
                        : credit.creditsEarned > 0
                          ? 'border-blue-200'
                          : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        credit.isComplete
                          ? 'bg-gradient-to-r from-green-400 to-green-600'
                          : credit.creditsEarned > 0
                            ? `bg-gradient-to-r ${subjectColors[credit.subject] || 'from-gray-400 to-gray-500'}`
                            : 'bg-gray-200'
                      }`}>
                        {credit.isComplete ? (
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                        ) : (
                          <svg className={`w-6 h-6 ${
                            credit.creditsEarned > 0 ? 'text-white' : 'text-gray-400'
                          }`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 7v10c0 5.55 3.84 9.739 9 9.99 5.16-.251 9-4.44 9-9.99V7l-10-5z"/>
                            <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                          </svg>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-800">
                          {credit.creditsEarned.toFixed(1)}/{credit.creditsRequired}
                        </div>
                        <div className="text-xs text-gray-500">Credits</div>
                      </div>
                    </div>

                    <h3 className="font-semibold text-gray-800 mb-2">
                      {credit.displayName}
                    </h3>

                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          credit.isComplete
                            ? 'bg-gradient-to-r from-green-400 to-green-600'
                            : credit.creditsEarned > 0
                              ? `bg-gradient-to-r ${subjectColors[credit.subject] || 'from-gray-400 to-gray-500'}`
                              : 'bg-gray-300'
                        }`}
                        style={{
                          width: `${credit.progressPercentage}%`
                        }}
                      ></div>
                    </div>

                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-500">
                        {Math.round(credit.progressPercentage)}% Complete
                      </span>
                      {credit.xpEarned > 0 && (
                        <span className="text-xs text-gray-500">
                          {credit.xpEarned} XP
                        </span>
                      )}
                    </div>

                    {credit.creditsEarned === 0 && (
                      <p className="text-xs text-gray-400 italic">
                        No progress yet - start learning to earn credits!
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Earned Badges Section */}
        {earnedBadges.length > 0 && (
          <div className="mb-12 pb-12 border-b border-gray-100">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-3" style={{ color: '#003f5c' }}>Earned Badges</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Recognition of mastery and achievement across learning pillars
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {earnedBadges.map((userBadge) => (
                <BadgeCarouselCard
                  key={userBadge.badge_id || userBadge.id}
                  badge={userBadge}
                />
              ))}
            </div>

            {earnedBadges.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No badges earned yet - complete quests to earn your first badge!</p>
              </div>
            )}
          </div>
        )}

        {/* Learning Moments Section */}
        {learningEvents.length > 0 && (
          <div className="mb-12 pb-12 border-b border-gray-100">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-3" style={{ color: '#003f5c' }}>Learning Moments</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Spontaneous discoveries and growth captured along the journey
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {learningEvents.map((event) => (
                <LearningEventCard
                  key={event.id}
                  event={event}
                />
              ))}
            </div>
          </div>
        )}

        {/* Learning Journey Section */}
        <div className="mb-8 pt-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold" style={{ color: '#003f5c' }}>Learning Journey</h2>
            {achievements.length > 0 && (
              <span className="text-sm text-gray-600">
                {(() => {
                  const completedCount = achievements.filter(a => a.status === 'completed').length;
                  const inProgressCount = achievements.filter(a => a.status === 'in_progress').length;

                  if (completedCount > 0 && inProgressCount > 0) {
                    return `${completedCount} Completed, ${inProgressCount} In Progress`;
                  } else if (completedCount > 0) {
                    return `${completedCount} Adventure${completedCount === 1 ? '' : 's'} Completed`;
                  } else {
                    return `${inProgressCount} Adventure${inProgressCount === 1 ? '' : 's'} In Progress`;
                  }
                })()}
              </span>
            )}
          </div>

          {achievements.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center">
              <h3 className="text-xl font-bold mb-3">No achievements yet</h3>
              <p className="text-gray-600 mb-6">Start your learning journey!</p>
              {isOwner && (
                <button
                  onClick={() => navigate('/quests')}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold"
                >
                  Start Your First Adventure
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.map((achievement, index) => {
                const getPillarForQuest = () => {
                  // Get the first task's pillar as the primary pillar
                  const taskPillars = Object.values(achievement.task_evidence || {});
                  if (taskPillars.length > 0 && taskPillars[0].pillar) {
                    return taskPillars[0].pillar;
                  }
                  return 'Arts & Creativity'; // Default
                };

                const pillar = getPillarForQuest();
                const displayName = pillarDisplayNames[pillar] || pillar;
                const gradientClass = pillarColors[pillar] || pillarColors['Arts & Creativity'];
                const isInProgress = achievement.status === 'in_progress';

                return (
                  <div
                    key={`${achievement.quest.id}-${index}`}
                    className={`bg-white rounded-xl overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full ${isInProgress ? 'ring-2 ring-blue-200' : ''}`}
                    style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    onClick={() => setSelectedAchievement(achievement)}
                  >
                    {/* Quest Image Header */}
                    {achievement.quest.image_url || achievement.quest.header_image_url ? (
                      <div className="relative h-40 overflow-hidden">
                        <img
                          src={achievement.quest.image_url || achievement.quest.header_image_url}
                          alt={achievement.quest.title}
                          className="w-full h-full object-cover"
                        />
                        <div className={`absolute inset-0 bg-gradient-to-t from-black/30 to-transparent`} />
                      </div>
                    ) : (
                      <div className={`h-2 bg-gradient-to-r ${gradientClass}`}></div>
                    )}

                    <div className="p-4 sm:p-6 flex flex-col flex-grow">
                      {/* Header with badges and date */}
                      <div className="mb-3">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div className="flex flex-wrap gap-2">
                            <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${gradientClass}`}>
                              {displayName}
                            </span>
                            {isInProgress && (
                              <span className="inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-bold text-blue-600 bg-blue-100">
                                In Progress
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">
                            {isInProgress ? formatDate(achievement.started_at) : formatDate(achievement.completed_at)}
                          </span>
                        </div>
                      </div>

                      {/* Quest title and description */}
                      <h3 className="font-bold text-base sm:text-lg mb-2 leading-tight" style={{ color: '#003f5c' }}>
                        {achievement.quest.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-grow">
                        {achievement.quest.description || achievement.quest.big_idea}
                      </p>

                      {/* Compact progress bar for in-progress quests */}
                      {isInProgress && achievement.progress && (
                        <div className="mb-4">
                          <div className="flex justify-between items-center text-xs text-gray-600 mb-2">
                            <span className="font-medium">Progress</span>
                            <span className="text-blue-600 font-semibold">
                              {achievement.progress.completed_tasks}/{achievement.progress.total_tasks} tasks
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${achievement.progress.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Bottom section with XP and action link */}
                      <div className="mt-auto">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                          <div className="flex items-center gap-2">
                            <svg className={`w-4 h-4 shrink-0 ${isInProgress ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                              {isInProgress ? (
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                              ) : (
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              )}
                            </svg>
                            <span className={`text-xs sm:text-sm font-medium ${isInProgress ? 'text-blue-600' : 'text-green-600'}`}>
                              +{achievement.total_xp_earned} Points{isInProgress ? ' so far' : ''}
                            </span>
                          </div>
                          <span className="text-xs sm:text-sm text-[#6d469b] font-medium hover:underline self-start sm:self-auto">
                            {isInProgress ? 'View Progress →' : 'Explore Journey →'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

            {/* Achievement Detail Modal */}
            {selectedAchievement && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                  <div className="sticky top-0 p-4 sm:p-8 z-10" style={{ background: 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)' }}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white leading-tight" style={{ letterSpacing: '-0.5px' }}>
                          {selectedAchievement.quest.title}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-white/80 text-sm">
                            {selectedAchievement.status === 'completed'
                              ? `Completed on ${formatDate(selectedAchievement.completed_at)}`
                              : `Started on ${formatDate(selectedAchievement.started_at)}`
                            }
                          </span>
                          {selectedAchievement.status === 'in_progress' && selectedAchievement.progress && (
                            <span className="px-2 py-1 bg-white/20 rounded text-xs text-white font-medium">
                              {selectedAchievement.progress.completed_tasks}/{selectedAchievement.progress.total_tasks} tasks completed
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedAchievement(null)}
                        className="text-white hover:bg-white/20 rounded-full p-2 transition-colors shrink-0">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 sm:p-8">
                    <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(239,89,123,0.05) 0%, rgba(109,70,155,0.05) 100%)', border: '1px solid rgba(109,70,155,0.1)' }}>
                      <h3 className="text-base sm:text-lg font-bold mb-3" style={{ color: '#6d469b' }}>Adventure Overview</h3>
                      <p className="text-sm sm:text-base" style={{ color: '#003f5c', lineHeight: 1.7 }}>{selectedAchievement.quest.description || selectedAchievement.quest.big_idea || 'A journey of discovery and growth.'}</p>
                    </div>

                    <div>
                      <h3 className="text-base sm:text-lg font-bold mb-4" style={{ color: '#003f5c' }}>Learning Journey & Evidence</h3>
                      <div className="space-y-4">
                        {Object.entries(selectedAchievement.task_evidence)
                          .sort(([, a], [, b]) => new Date(a.completed_at) - new Date(b.completed_at))
                          .map(([taskTitle, evidence], index) => {
                          const displayPillar = pillarDisplayNames[evidence.pillar] || evidence.pillar;
                          const gradientClass = pillarColors[evidence.pillar] || pillarColors['Arts & Creativity'];

                          return (
                            <div key={taskTitle} className="rounded-xl p-4 sm:p-5" style={{ background: 'white', border: '1px solid rgba(109,70,155,0.15)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                              <div className="mb-3">
                                <div className="flex items-start gap-3">
                                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-sm sm:text-base leading-tight" style={{ color: '#003f5c' }}>{taskTitle}</h4>
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                                      <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${gradientClass}`} style={{ boxShadow: '0 2px 8px rgba(109,70,155,0.25)' }}>
                                        {displayPillar}
                                      </span>
                                      <span className="text-xs sm:text-sm font-medium text-green-600">
                                        +{evidence.xp_awarded} Growth Points
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {formatDate(evidence.completed_at)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 ml-10 sm:ml-11">
                                <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Learning Evidence:</p>
                                {renderEvidence(evidence)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className={`mt-6 p-4 rounded-lg border ${selectedAchievement.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex items-center gap-2">
                          <svg className={`w-5 h-5 ${selectedAchievement.status === 'completed' ? 'text-green-600' : 'text-blue-600'}`} fill="currentColor" viewBox="0 0 20 20">
                            {selectedAchievement.status === 'completed' ? (
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            ) : (
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            )}
                          </svg>
                          <span className={`font-semibold ${selectedAchievement.status === 'completed' ? 'text-green-800' : 'text-blue-800'}`}>
                            {selectedAchievement.status === 'completed'
                              ? `Total Growth: +${selectedAchievement.total_xp_earned} Points`
                              : `Growth So Far: +${selectedAchievement.total_xp_earned} Points`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

        {/* Self-Validated Diploma Explanation Modal */}
        {showDiplomaExplanation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-3xl font-bold" style={{ color: '#003f5c' }}>
                    What is a Self-Validated Diploma?
                  </h2>
                  <button
                    onClick={() => setShowDiplomaExplanation(false)}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-xl bg-gradient-to-r from-[#ef597b]/5 to-[#6d469b]/5" style={{ border: '1px solid rgba(109,70,155,0.1)' }}>
                    <h3 className="font-bold text-lg mb-3" style={{ color: '#6d469b' }}>A Revolutionary Approach to Education</h3>
                    <p className="text-gray-700 leading-relaxed">
                      Unlike traditional diplomas that require external validation from institutions, a self-validated diploma 
                      puts YOU in charge of your education. You choose what to learn, document your journey with evidence, 
                      and build a portfolio that authentically represents your unique skills and interests.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-[#ef597b]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 0016 0zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <h4 className="font-semibold" style={{ color: '#003f5c' }}>Evidence-Based</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        Every achievement is backed by real evidence - projects, writings, videos, and creations that prove your learning.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <h4 className="font-semibold" style={{ color: '#003f5c' }}>Self-Directed</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        You choose what to learn based on your interests and curiosity, not a predetermined curriculum.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-[#ef597b]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                        <h4 className="font-semibold" style={{ color: '#003f5c' }}>Process-Focused</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        Celebrates the journey of learning and growth, not just final outcomes or test scores.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762z" />
                        </svg>
                        <h4 className="font-semibold" style={{ color: '#003f5c' }}>Publicly Shareable</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        Create a professional portfolio that showcases your unique learning story to the world.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg">
                    <p className="text-center font-semibold">
                      "The Process Is The Goal" - Your learning journey is valuable for who you become, not what you prove.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accredited Diploma Modal */}
        <AccreditedDiplomaModal
          isOpen={showAccreditedDiplomaModal}
          onClose={() => setShowAccreditedDiplomaModal(false)}
        />
      </div>
    </div>
  );
};

export default memo(DiplomaPage);