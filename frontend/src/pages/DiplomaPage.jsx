import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import SkillsRadarChart from '../components/diploma/SkillsRadarChart';
import AccreditedDiplomaModal from '../components/diploma/AccreditedDiplomaModal';
import BadgeCarouselCard from '../components/hub/BadgeCarouselCard';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import EvidenceMasonryGallery from '../components/diploma/EvidenceMasonryGallery';
import CompactSidebar from '../components/diploma/CompactSidebar';
import { SkeletonDiplomaHeader, SkeletonStats, SkeletonAchievementGrid } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { formatErrorMessage } from '../utils/errorMessages';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  TOTAL_CREDITS_REQUIRED,
  meetsGraduationRequirements
} from '../utils/creditRequirements';
import { getPillarGradient, getPillarDisplayName } from '../config/pillars';
import UnifiedEvidenceDisplay from '../components/evidence/UnifiedEvidenceDisplay';

const DiplomaPage = () => {
  const { user, loginTimestamp } = useAuth();
  const { actingAsDependent } = useActingAs();
  const { slug, userId } = useParams();
  const navigate = useNavigate();

  // Determine effective user: dependent if acting as one, otherwise logged-in user
  const effectiveUser = actingAsDependent || user;

  // Check if this is explicitly a public route
  const isPublicRoute = window.location.pathname.startsWith('/public/');
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
  const [showFullCreditsModal, setShowFullCreditsModal] = useState(false);
  const [showAllBadgesModal, setShowAllBadgesModal] = useState(false);
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState(null);

  // All features are now free for all users (Phase 2 refactoring - January 2025)
  const hasAccess = true;

  // Memoize expensive credit calculations to prevent unnecessary re-computation
  const creditProgress = useMemo(() => getAllCreditProgress(subjectXP), [subjectXP]);
  const totalCreditsEarned = useMemo(() => calculateTotalCredits(subjectXP), [subjectXP]);
  const meetsRequirements = useMemo(() => meetsGraduationRequirements(subjectXP), [subjectXP]);

  // Legacy pillar name mappings for backward compatibility
  // These map old pillar names to new canonical keys
  const legacyPillarMapping = {
    'Arts & Creativity': 'art',
    'STEM & Logic': 'stem',
    'Life & Wellness': 'wellness',
    'Language & Communication': 'communication',
    'Society & Culture': 'civics',
    'arts_creativity': 'art',
    'stem_logic': 'stem',
    'life_wellness': 'wellness',
    'language_communication': 'communication',
    'society_culture': 'civics',
    'creativity': 'art',
    'critical_thinking': 'stem',
    'practical_skills': 'wellness',
    'cultural_literacy': 'civics'
  };

  // Helper function to normalize pillar keys
  const normalizePillarKey = (key) => {
    if (!key) return 'art'; // fallback
    const lowerKey = key.toLowerCase();
    // Check if it's a legacy key that needs mapping
    return legacyPillarMapping[key] || legacyPillarMapping[lowerKey] || lowerKey;
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
    'health': 'from-rose-500 to-optio-pink',
    'pe': 'from-cyan-500 to-blue-600',
    'fine_arts': 'bg-gradient-primary',
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
    } else if (effectiveUser) {
      // Authenticated user viewing their own diploma (no params)
      if (hasAccess) {
        // Fetch all data independently with error handling
        // Each fetch has its own try-catch to prevent one failure from affecting others
        Promise.allSettled([
          fetchAchievements().catch(err => console.error('Failed to fetch achievements:', err)),
          fetchSubjectXP().catch(err => console.error('Failed to fetch subject XP:', err)),
          fetchEarnedBadges().catch(err => console.error('Failed to fetch badges:', err)),
          fetchLearningEvents().catch(err => console.error('Failed to fetch learning events:', err))
        ]).finally(() => {
          // Ensure loading state is cleared even if some fetches fail
          setIsLoading(false);
        });
        generateShareableLink();
      } else {
        // User doesn't have access, just stop loading
        setIsLoading(false);
      }
    } else {
      // No user and no params - show loading
      setIsLoading(true);
    }
  }, [effectiveUser, slug, userId, loginTimestamp, hasAccess]);

  // Event handlers for refreshing data - defined as regular functions to avoid circular dependencies
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && effectiveUser && !slug && !userId && hasAccess) {
      // Refresh all data independently with error handling
      Promise.allSettled([
        fetchAchievements().catch(err => console.error('Failed to fetch achievements:', err)),
        fetchSubjectXP().catch(err => console.error('Failed to fetch subject XP:', err)),
        fetchEarnedBadges().catch(err => console.error('Failed to fetch badges:', err)),
        fetchLearningEvents().catch(err => console.error('Failed to fetch learning events:', err))
      ]);
    }
  };

  const handleFocus = () => {
    if (effectiveUser && !slug && !userId && hasAccess) {
      // Refresh all data independently with error handling
      Promise.allSettled([
        fetchAchievements().catch(err => console.error('Failed to fetch achievements:', err)),
        fetchSubjectXP().catch(err => console.error('Failed to fetch subject XP:', err)),
        fetchEarnedBadges().catch(err => console.error('Failed to fetch badges:', err)),
        fetchLearningEvents().catch(err => console.error('Failed to fetch learning events:', err))
      ]);
    }
  };

  // Refresh data when page becomes visible
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUser, slug, userId, hasAccess]);

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

      // Extract and set subject XP data for diploma credits
      if (data.subject_xp) {
        // Transform array to object with subject as key
        const subjectXPMap = {};
        data.subject_xp.forEach(item => {
          subjectXPMap[item.school_subject] = item.xp_amount;
        });
        setSubjectXP(subjectXPMap);
      }

      // Fetch badges and learning events for public diploma
      if (userId) {
        await fetchEarnedBadges(userId);
        await fetchLearningEvents(userId);
      }
    } catch (error) {
      console.error('Error fetching public diploma:', error);
      console.error('Error response:', error.response);
      const errorInfo = formatErrorMessage(
        error.response?.status === 404 ? 'diploma/not-found' : 'diploma/error'
      );
      setError(errorInfo);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAchievements = useCallback(async () => {
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
  }, []);

  const fetchSubjectXP = useCallback(async () => {
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
  }, []);

  const fetchEarnedBadges = useCallback(async (targetUserId = null) => {
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
  }, [user?.id]);

  const fetchLearningEvents = useCallback(async (targetUserId = null) => {
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
  }, [user?.id, slug, userId]);

  const generateShareableLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/public/diploma/${user?.id}`;
    setShareableLink(link);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      // Better feedback than alert
      const button = document.activeElement;
      const originalText = button?.textContent || button?.innerText;
      if (button && originalText) {
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy link:', error);
      // Fallback for older browsers or when clipboard access is denied
      alert(`Copy this link: ${shareableLink}`);
    }
  };

  const handleTogglePreview = () => {
    setPreviewMode(!previewMode);
  };

  // Determine if current user is the owner
  // Owner when: viewing /diploma (no params) OR viewing their own userId
  // Public routes (/public/*) are NEVER owner view, even if logged in as that user
  // Explicitly convert to boolean to avoid undefined/null
  // Use effectiveUser to check ownership (dependent's ID when acting as dependent)
  const isOwner = !isPublicRoute && Boolean(effectiveUser && (!slug && (!userId || effectiveUser.id === userId)));

  // Debug logging for public viewer issue
  console.log('DiplomaPage render - isOwner:', isOwner, 'isPublicRoute:', isPublicRoute, 'user:', !!user, 'slug:', slug, 'userId:', userId);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderEvidence = (evidence) => {
    // Convert legacy evidence_content to modern format if needed
    const normalizedEvidence = {
      evidence_type: evidence.evidence_type,
      evidence_blocks: evidence.evidence_blocks,
      evidence_text: evidence.evidence_text || evidence.evidence_content,
      evidence_url: evidence.evidence_url || (evidence.evidence_type === 'link' ? evidence.evidence_content : null)
    };

    return <UnifiedEvidenceDisplay evidence={normalizedEvidence} displayMode="full" />;
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
          <h2 className="text-2xl font-bold text-primary mb-2">
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
    student: effectiveUser,
    total_xp: totalXPCount,
    total_quests_completed: achievements.length,
    skill_details: Object.keys(totalXP)
  };

  // Get student display name
  const getStudentName = () => {
    const student = displayData.student || effectiveUser;
    if (!student) return 'Student';

    const firstName = student.first_name || '';
    const lastName = student.last_name || '';

    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }

    return student.username || 'Student';
  };

  // Get first name for possessive pronoun
  const getStudentFirstName = () => {
    // For public diploma routes, use diploma data if available
    if (diploma?.student) {
      return diploma.student.first_name || diploma.student.username || 'This student';
    }

    const student = displayData.student || effectiveUser;
    if (!student) return 'This student';
    return student.first_name || student.username || 'This student';
  };

  // Helper function to get possessive text (e.g., "your" vs "Emma's")
  const getPossessive = () => {
    if (isOwner) return 'your';
    const firstName = getStudentFirstName();
    return `${firstName}'s`;
  };

  // Generate canonical URL (prefer /portfolio/:slug format)
  const studentName = getStudentName();
  const canonicalUrl = slug
    ? `https://www.optioeducation.com/portfolio/${slug}`
    : diploma?.student?.portfolio_slug
      ? `https://www.optioeducation.com/portfolio/${diploma.student.portfolio_slug}`
      : `https://www.optioeducation.com/public/diploma/${userId || user?.id}`;

  const pageTitle = `${studentName} - Portfolio Diploma | Optio`;
  const pageDescription = `${studentName} has accepted the responsibility to self-validate their education. This portfolio diploma showcases their learning journey with evidence-based achievements.`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />

        {/* Canonical URL - prefer /portfolio/:slug format */}
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph / Social Media Tags */}
        <meta property="og:type" content="profile" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Optio Education" />

        {/* Twitter Card Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />

        {/* Additional SEO */}
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* Hero Section with Professional Diploma Title */}
      <div className="relative overflow-hidden bg-gradient-primary text-white">
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
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4" style={{ letterSpacing: '-1px' }}>
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
        {/* Back Button and Share Controls */}
        <div className="flex items-center justify-between mb-6">
          {/* Back Button */}
          {user && (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
            >
              <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back to Dashboard</span>
            </button>
          )}

          {/* Share Controls */}
          {isOwner && (
            <button
              onClick={copyShareLink}
              className="px-4 py-2 rounded-lg bg-gradient-primary text-white hover:shadow-lg transition-shadow flex items-center gap-2 text-sm"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
              </svg>
              Share Portfolio
            </button>
          )}
        </div>

        {/* Main Layout: Sidebar + Evidence Gallery */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - Desktop: sticky left, Mobile: stacked top */}
          <aside className="w-full lg:w-80 lg:flex-shrink-0">
            <div className="lg:sticky lg:top-4">
              <CompactSidebar
                totalXP={totalXP}
                subjectXP={subjectXP}
                earnedBadges={earnedBadges}
                totalXPCount={totalXPCount}
                isOwner={isOwner}
                studentName={getStudentFirstName()}
                onCreditsClick={() => setShowFullCreditsModal(true)}
                onBadgesClick={() => setShowAllBadgesModal(true)}
              />
            </div>
          </aside>

          {/* Main Content - Evidence Gallery */}
          <main className="flex-1 min-w-0">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-primary mb-2">Learning Evidence</h2>
              <p className="text-gray-600">
                {achievements.length === 0
                  ? isOwner
                    ? 'Start your learning journey by completing quests'
                    : `${getStudentFirstName()} hasn't submitted any evidence yet`
                  : `Showcasing work from ${achievements.length} ${achievements.length === 1 ? 'quest' : 'quests'}`
                }
              </p>
            </div>

            <EvidenceMasonryGallery
              achievements={achievements}
              onEvidenceClick={(item) => setSelectedEvidenceItem(item)}
              isOwner={isOwner}
            />
          </main>
        </div>

        {/* Learning Events Section - Optional showcase below gallery */}
        {learningEvents.length > 0 && (
          <div className="mt-16 pt-12 border-t border-gray-100">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-3 text-primary">Learning Moments</h2>
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

        {/* Full Credits Modal */}
        {showFullCreditsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowFullCreditsModal(false)}>
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 p-6 bg-gradient-primary z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">Diploma Credits Breakdown</h2>
                  <button
                    onClick={() => setShowFullCreditsModal(false)}
                    className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="text-center mb-6">
                  <p className="text-gray-600 mb-4">
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
                <div className="mb-8">
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
                            ? isOwner
                              ? 'Congratulations! You meet graduation requirements!'
                              : `${getStudentFirstName()} meets graduation requirements!`
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
                            : 'bg-gradient-to-r from-optio-purple to-optio-pink'
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

                {/* Subject Credits Grid with Circular Progress */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {creditProgress.map((credit) => {
                    const radius = 45;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDashoffset = circumference - (credit.progressPercentage / 100) * circumference;

                    return (
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
                        <div className="flex flex-col items-center mb-4">
                          {/* Circular Progress Indicator */}
                          <div className="relative w-32 h-32 mb-3">
                            <svg className="transform -rotate-90 w-32 h-32">
                              {/* Background circle */}
                              <circle
                                cx="64"
                                cy="64"
                                r={radius}
                                stroke="#E5E7EB"
                                strokeWidth="8"
                                fill="none"
                              />
                              {/* Progress circle */}
                              <circle
                                cx="64"
                                cy="64"
                                r={radius}
                                stroke={credit.isComplete ? '#10B981' : credit.creditsEarned > 0 ? '#6D469B' : '#D1D5DB'}
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className="transition-all duration-500 ease-out"
                              />
                            </svg>
                            {/* Center content */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              {credit.isComplete ? (
                                <svg className="w-8 h-8 text-green-600 mb-1" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                              ) : (
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-gray-800">
                                    {Math.round(credit.progressPercentage)}%
                                  </div>
                                  <div className="text-xs text-gray-500">complete</div>
                                </div>
                              )}
                            </div>
                          </div>

                          <h3 className="font-semibold text-gray-800 text-center mb-1">
                            {credit.displayName}
                          </h3>

                          <div className="text-center mb-2">
                            <div className="text-sm font-bold text-gray-700">
                              {credit.creditsEarned.toFixed(1)} / {credit.creditsRequired} Credits
                            </div>
                            {credit.xpEarned > 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                {credit.xpEarned} XP earned
                              </div>
                            )}
                          </div>
                        </div>

                        {credit.creditsEarned === 0 && (
                          <p className="text-xs text-gray-400 italic text-center">
                            No progress yet - start learning to earn credits!
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Badges Modal */}
        {showAllBadgesModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowAllBadgesModal(false)}>
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 p-6 bg-gradient-primary z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">Earned Badges</h2>
                  <button
                    onClick={() => setShowAllBadgesModal(false)}
                    className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6">
                <p className="text-gray-600 text-center mb-6">
                  Recognition of mastery and achievement across learning pillars
                </p>

                {earnedBadges.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {earnedBadges.map((userBadge) => (
                      <BadgeCarouselCard
                        key={userBadge.badge_id || userBadge.id}
                        badge={userBadge}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">
                      {isOwner
                        ? 'No badges earned yet - complete quests to earn your first badge!'
                        : `${getStudentFirstName()} hasn't earned any badges yet.`
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Evidence Detail Modal */}
        {selectedEvidenceItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedEvidenceItem(null)}>
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className={`sticky top-0 p-6 bg-gradient-to-r ${getPillarGradient(selectedEvidenceItem.pillar)} z-10`}>
                <div className="flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold text-white mb-1 truncate">{selectedEvidenceItem.questTitle}</h2>
                    <p className="text-white/90 text-sm truncate">{selectedEvidenceItem.taskTitle}</p>
                  </div>
                  <button
                    onClick={() => setSelectedEvidenceItem(null)}
                    className="text-white hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0 ml-4"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                    {getPillarDisplayName(selectedEvidenceItem.pillar)}
                  </span>
                  <span className="text-white/90 text-sm">
                    +{selectedEvidenceItem.xpAwarded} XP
                  </span>
                  <span className="text-white/80 text-sm">
                    {formatDate(selectedEvidenceItem.completedAt)}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <UnifiedEvidenceDisplay
                  evidence={selectedEvidenceItem.evidence}
                  displayMode="full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Achievement Detail Modal (legacy - for old selectedAchievement state) */}
        {selectedAchievement && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
              <div className="sticky top-0 p-4 sm:p-8 z-10 bg-gradient-primary">
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
                <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl bg-gradient-subtle-strong">
                  <h3 className="text-base sm:text-lg font-bold mb-3 text-optio-purple">Adventure Overview</h3>
                  <p className="text-sm sm:text-base text-primary" style={{ lineHeight: 1.7 }}>{selectedAchievement.quest.description || selectedAchievement.quest.big_idea || 'A journey of discovery and growth.'}</p>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold mb-4 text-primary">Learning Journey & Evidence</h3>
                  <div className="space-y-4">
                    {Object.entries(selectedAchievement.task_evidence)
                      .sort(([, a], [, b]) => new Date(a.completed_at) - new Date(b.completed_at))
                      .map(([taskTitle, evidence], index) => {
                      const normalizedPillar = normalizePillarKey(evidence.pillar);
                      const displayPillar = getPillarDisplayName(normalizedPillar);
                      const gradientClass = getPillarGradient(normalizedPillar);

                      return (
                        <div key={taskTitle} className="rounded-xl p-4 sm:p-5" style={{ background: 'white', border: '1px solid rgba(109,70,155,0.15)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                          <div className="mb-3">
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-primary text-white flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm sm:text-base leading-tight text-primary">{taskTitle}</h4>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                                  <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${gradientClass} shadow-optio`}>
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
                  <h2 className="text-3xl font-bold text-primary">
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
                  <div className="p-6 rounded-xl bg-gradient-to-r from-optio-pink/5 to-optio-purple/5" style={{ border: '1px solid rgba(109,70,155,0.1)' }}>
                    <h3 className="font-bold text-lg mb-3 text-optio-purple">A Revolutionary Approach to Education</h3>
                    <p className="text-gray-700 leading-relaxed">
                      Unlike traditional diplomas that require external validation from institutions, a self-validated diploma
                      puts YOU in charge of your education. You choose what to learn, document your journey with evidence,
                      and build a portfolio that authentically represents your unique skills and interests.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-optio-pink" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 0016 0zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <h4 className="font-semibold text-primary">Evidence-Based</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        Every achievement is backed by real evidence - projects, writings, videos, and creations that prove your learning.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <h4 className="font-semibold text-primary">Self-Directed</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        You choose what to learn based on your interests and curiosity, not a predetermined curriculum.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-optio-pink" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                        <h4 className="font-semibold text-primary">Process-Focused</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        Celebrates the journey of learning and growth, not just final outcomes or test scores.
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762z" />
                        </svg>
                        <h4 className="font-semibold text-primary">Publicly Shareable</h4>
                      </div>
                      <p className="text-sm text-gray-600">
                        Create a professional portfolio that showcases your unique learning story to the world.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-primary text-white rounded-lg">
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
