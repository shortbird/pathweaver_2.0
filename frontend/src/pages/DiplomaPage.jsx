import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import AccreditedDiplomaModal from '../components/diploma/AccreditedDiplomaModal';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import EvidenceMasonryGallery from '../components/diploma/EvidenceMasonryGallery';
import CompactSidebar from '../components/diploma/CompactSidebar';
import CreditProgressModal from '../components/diploma/CreditProgressModal';
// BadgesModal removed (January 2026 - Microschool client feedback)
import EvidenceDetailModal from '../components/diploma/EvidenceDetailModal';
import AchievementDetailModal from '../components/diploma/AchievementDetailModal';
import DiplomaExplanationModal from '../components/diploma/DiplomaExplanationModal';
import { SkeletonDiplomaHeader, SkeletonStats, SkeletonAchievementGrid } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { formatErrorMessage } from '../utils/errorMessages';
import logger from '../utils/logger';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  TOTAL_CREDITS_REQUIRED,
  meetsGraduationRequirements
} from '../utils/creditRequirements';
import { getPillarGradient, getPillarDisplayName } from '../config/pillars';
import UnifiedEvidenceDisplay from '../components/evidence/UnifiedEvidenceDisplay';
import PublicConsentModal from '../components/diploma/PublicConsentModal';
import PublicNoticeBanner from '../components/diploma/PublicNoticeBanner';

// Subject display names for transfer credits
const SUBJECT_DISPLAY_NAMES = {
  'language_arts': 'Language Arts',
  'math': 'Mathematics',
  'science': 'Science',
  'social_studies': 'Social Studies',
  'financial_literacy': 'Financial Literacy',
  'health': 'Health',
  'pe': 'Physical Education',
  'fine_arts': 'Fine Arts',
  'cte': 'Career & Tech Ed',
  'digital_literacy': 'Digital Literacy',
  'electives': 'Electives'
};

// Transfer Credits Card - displays imported credits from external transcripts
const TransferCreditsCard = memo(({ transferCredits, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!transferCredits || !transferCredits.total_credits) return null;

  const subjectCredits = transferCredits.subject_credits || {};
  const sortedSubjects = Object.entries(subjectCredits)
    .filter(([, credits]) => credits > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className="p-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold">Transfer Credits</h3>
              <p className="text-emerald-100">
                From {transferCredits.school_name || 'Previous School'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{transferCredits.total_credits.toFixed(1)}</div>
            <div className="text-emerald-100 text-sm">credits</div>
          </div>
        </div>

        {/* Expand indicator */}
        <div className="mt-4 flex items-center justify-center">
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expandable Details */}
      {isExpanded && (
        <div className="p-6">
          {/* Subject Breakdown */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Subject Breakdown
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {sortedSubjects.map(([subject, credits]) => (
                <div
                  key={subject}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-gray-700 font-medium">
                    {SUBJECT_DISPLAY_NAMES[subject] || subject}
                  </span>
                  <span className="text-emerald-600 font-bold">
                    {credits.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Transcript Link */}
          {transferCredits.transcript_url && (
            <div className="pt-4 border-t border-gray-200">
              <a
                href={transferCredits.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Transcript
              </a>
            </div>
          )}

          {/* Notes */}
          {transferCredits.notes && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
              <strong>Note:</strong> {transferCredits.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

TransferCreditsCard.displayName = 'TransferCreditsCard';

const DiplomaPage = () => {
  const { user, loginTimestamp } = useAuth();
  const { actingAsDependent } = useActingAs();
  const { slug, userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if navigated from org progress tab
  const fromOrgProgress = location.state?.from === 'org-progress';
  const sourceOrgId = location.state?.orgId;

  // Determine effective user: dependent if acting as one, otherwise logged-in user
  const effectiveUser = actingAsDependent || user;

  // Check if this is explicitly a public route
  const isPublicRoute = window.location.pathname.startsWith('/public/');
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [subjectXP, setSubjectXP] = useState({});  // NEW: Subject-specific XP
  const [pendingSubjectXP, setPendingSubjectXP] = useState({});  // XP awaiting teacher verification
  // earnedBadges state removed (January 2026 - Microschool client feedback)
  const [learningEvents, setLearningEvents] = useState([]);  // Learning events
  const [transferCredits, setTransferCredits] = useState(null);  // Transfer credits from external transcripts
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
  // showAllBadgesModal state removed (January 2026 - Microschool client feedback)
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState(null);

  // FERPA compliance: visibility and consent state
  const [visibilityStatus, setVisibilityStatus] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // All features are now free for all users (Phase 2 refactoring - January 2025)
  const hasAccess = true;

  // Memoize expensive credit calculations to prevent unnecessary re-computation
  const creditProgress = useMemo(() => getAllCreditProgress(subjectXP), [subjectXP]);
  const totalCreditsEarned = useMemo(() => calculateTotalCredits(subjectXP), [subjectXP]);
  const meetsRequirements = useMemo(() => meetsGraduationRequirements(subjectXP), [subjectXP]);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    // Clear previous data when component mounts or dependencies change
    setAchievements([]);
    setTotalXP({});
    setSubjectXP({});
    setPendingSubjectXP({});
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
          // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
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
        // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
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
        // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
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

      // Fetch learning events for public diploma if user_id is available
      // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
      if (diplomaData?.user_id) {
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

      logger.debug('Public diploma data received:', data);

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

      // Extract and set transfer credits
      if (data.transfer_credits) {
        setTransferCredits(data.transfer_credits);
      }

      // Fetch learning events for public diploma
      // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
      if (userId) {
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
        api.get('/api/quests/completed')
          .catch(error => ({ error, status: error.response?.status })),
        api.get('/api/users/dashboard')
          .catch(error => ({ error, status: error.response?.status }))
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
        const pendingXPMap = {};
        if (data.subject_xp) {
          data.subject_xp.forEach(item => {
            // Use verified_xp if available, otherwise fall back to xp_amount for backwards compatibility
            subjectXPMap[item.school_subject] = item.verified_xp ?? item.xp_amount;
            // Track pending XP separately (awaiting teacher verification)
            if (item.pending_xp) {
              pendingXPMap[item.school_subject] = item.pending_xp;
            }
          });
        }
        setSubjectXP(subjectXPMap);
        setPendingSubjectXP(pendingXPMap);
      } else {
        // If endpoint doesn't exist yet, silently handle
        setSubjectXP({});
        setPendingSubjectXP({});
      }
    } catch (error) {
      // Silently handle error for now
      setSubjectXP({});
      setPendingSubjectXP({});
    }
  }, []);

  // fetchEarnedBadges function removed (January 2026 - Microschool client feedback)

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

  // FERPA compliance: Fetch visibility status for owner view
  const fetchVisibilityStatus = useCallback(async () => {
    if (!effectiveUser?.id) return;
    try {
      const response = await api.get(`/api/portfolio/user/${effectiveUser.id}/visibility-status`);
      if (response.data?.data) {
        setVisibilityStatus(response.data.data);
      }
    } catch (error) {
      logger.error('Failed to fetch visibility status:', error);
    }
  }, [effectiveUser?.id]);

  // Fetch visibility status when component mounts for owner view
  useEffect(() => {
    if (effectiveUser && !slug && !userId) {
      fetchVisibilityStatus();
    }
  }, [effectiveUser, slug, userId, fetchVisibilityStatus]);

  // Handle privacy toggle - shows consent modal for making public
  const handlePrivacyToggle = () => {
    if (!visibilityStatus?.is_public) {
      // Making public - show consent modal first
      setShowConsentModal(true);
    } else {
      // Making private - immediate, no confirmation needed
      updatePrivacy(false);
    }
  };

  // Update privacy setting with consent acknowledgment
  const updatePrivacy = async (makePublic, consentAcknowledged = false) => {
    if (!effectiveUser?.id) return;

    setPrivacyLoading(true);
    try {
      const response = await api.put(`/api/portfolio/user/${effectiveUser.id}/privacy`, {
        is_public: makePublic,
        consent_acknowledged: consentAcknowledged
      });

      if (response.data?.data) {
        // Refresh visibility status to get updated state
        await fetchVisibilityStatus();
        setShowConsentModal(false);
      }
    } catch (error) {
      logger.error('Failed to update privacy:', error);
      const errorMsg = error.response?.data?.message || 'Failed to update privacy settings';
      alert(errorMsg);
    } finally {
      setPrivacyLoading(false);
    }
  };

  // Handle consent confirmation from modal
  const handleConsentConfirm = () => {
    updatePrivacy(true, true);
  };

  // Determine if current user is the owner
  // Owner when: viewing /diploma (no params) OR viewing their own userId
  // Public routes (/public/*) are NEVER owner view, even if logged in as that user
  // Explicitly convert to boolean to avoid undefined/null
  // Use effectiveUser to check ownership (dependent's ID when acting as dependent)
  const isOwner = !isPublicRoute && Boolean(effectiveUser && (!slug && (!userId || effectiveUser.id === userId)));

  // Debug logging for public viewer issue
  logger.debug('DiplomaPage render - isOwner:', isOwner, 'isPublicRoute:', isPublicRoute, 'user:', !!user, 'slug:', slug, 'userId:', userId);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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

    return student.display_name || student.username || 'Student';
  };

  // Get first name for possessive pronoun
  const getStudentFirstName = () => {
    // For public diploma routes, use diploma data if available
    if (diploma?.student) {
      return diploma.student.first_name || diploma.student.username || 'This student';
    }

    const student = displayData.student || effectiveUser;
    if (!student) return 'This student';
    return student.first_name || student.display_name || student.username || 'This student';
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
              className="inline-flex items-center gap-2 text-white/90 hover:text-white hover:bg-white/10 px-4 py-2 rounded-lg transition-all duration-200 text-sm min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>What is a self-validated diploma?</span>
            </button>
          </div>
        </div>
      </div>

      {/* FERPA compliance: Show public notice banner on public portfolios */}
      {isPublicRoute && diploma?.public_consent_info?.opted_in && (
        <PublicNoticeBanner
          studentName={getStudentName()}
          withParentApproval={diploma?.public_consent_info?.with_parent_approval}
          consentDate={diploma?.public_consent_info?.consent_given_at}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Back Button and Share Controls */}
        <div className="flex items-center justify-between mb-6">
          {/* Back Button */}
          {user && (
            <button
              onClick={() => {
                if (fromOrgProgress && sourceOrgId) {
                  // Navigate back to org management with progress tab active
                  navigate(`/admin/organizations/${sourceOrgId}`, { state: { activeTab: 'progress' } });
                } else {
                  navigate('/dashboard');
                }
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group min-h-[44px]"
            >
              <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">{fromOrgProgress ? 'Back to Progress' : 'Back to Dashboard'}</span>
            </button>
          )}

          {/* Share Controls and Privacy Settings */}
          {isOwner && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Privacy Toggle */}
              <div className="flex items-center gap-3">
                {visibilityStatus?.pending_parent_approval ? (
                  <div className="px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2 text-sm min-h-[44px]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Awaiting Parent Approval
                  </div>
                ) : visibilityStatus?.parent_approval_denied ? (
                  <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm min-h-[44px]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Request Denied
                  </div>
                ) : (
                  <button
                    onClick={handlePrivacyToggle}
                    disabled={privacyLoading}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm min-h-[44px] transition-colors ${
                      visibilityStatus?.is_public
                        ? 'bg-green-100 hover:bg-green-200 text-green-800'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    } ${privacyLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={visibilityStatus?.is_public ? 'Your portfolio is public' : 'Your portfolio is private'}
                  >
                    {privacyLoading ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : visibilityStatus?.is_public ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    {visibilityStatus?.is_public ? 'Public' : 'Private'}
                  </button>
                )}
              </div>
              {/* Share button - only show if public */}
              {visibilityStatus?.is_public && (
                <button
                  onClick={copyShareLink}
                  className="px-4 py-2 rounded-lg bg-gradient-primary text-white hover:shadow-lg transition-shadow flex items-center justify-center gap-2 text-sm min-h-[44px]"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
                  </svg>
                  Share Portfolio
                </button>
              )}
            </div>
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
                totalXPCount={totalXPCount}
                isOwner={isOwner}
                studentName={getStudentFirstName()}
                onCreditsClick={() => setShowFullCreditsModal(true)}
              />
            </div>
          </aside>

          {/* Main Content - Evidence Gallery */}
          <main id="main-content" className="flex-1 min-w-0">
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

            {/* Transfer Credits Card - Shows imported credits from external transcripts */}
            {transferCredits && transferCredits.total_credits > 0 && (
              <TransferCreditsCard
                transferCredits={transferCredits}
                className="mb-8"
              />
            )}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
        <CreditProgressModal
          isOpen={showFullCreditsModal}
          onClose={() => setShowFullCreditsModal(false)}
          subjectXP={subjectXP}
          pendingSubjectXP={pendingSubjectXP}
          isOwner={isOwner}
          getStudentFirstName={getStudentFirstName}
          onAccreditedDiplomaClick={() => setShowAccreditedDiplomaModal(true)}
        />

        {/* Badge system removed (January 2026 - Microschool client feedback) */}

        {/* Evidence Detail Modal */}
        <EvidenceDetailModal
          isOpen={!!selectedEvidenceItem}
          onClose={() => setSelectedEvidenceItem(null)}
          evidenceItem={selectedEvidenceItem}
        />

        {/* Achievement Detail Modal (legacy - for old selectedAchievement state) */}
        <AchievementDetailModal
          isOpen={!!selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
          achievement={selectedAchievement}
        />

        {/* Self-Validated Diploma Explanation Modal */}
        <DiplomaExplanationModal
          isOpen={showDiplomaExplanation}
          onClose={() => setShowDiplomaExplanation(false)}
        />

        {/* Accredited Diploma Modal */}
        <AccreditedDiplomaModal
          isOpen={showAccreditedDiplomaModal}
          onClose={() => setShowAccreditedDiplomaModal(false)}
        />

        {/* FERPA Compliance: Public Consent Modal */}
        <PublicConsentModal
          isOpen={showConsentModal}
          onClose={() => setShowConsentModal(false)}
          onConfirm={handleConsentConfirm}
          isMinor={visibilityStatus?.is_minor}
          parentName={visibilityStatus?.parent_info?.first_name || 'your parent or guardian'}
          loading={privacyLoading}
        />
      </div>
    </div>
  );
};

export default memo(DiplomaPage);
