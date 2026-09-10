import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import EvidenceMasonryGallery from '../components/diploma/EvidenceMasonryGallery';
import CompactSidebar from '../components/diploma/CompactSidebar';
// BadgesModal removed (January 2026 - Microschool client feedback)
import { SkeletonDiplomaHeader, SkeletonStats, SkeletonAchievementGrid } from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { formatErrorMessage } from '../utils/errorMessages';
import logger from '../utils/logger';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  meetsGraduationRequirements
} from '../utils/creditRequirements';
import PublicNoticeBanner from '../components/diploma/PublicNoticeBanner';
import { canonicalUrl as buildCanonicalUrl } from '../utils/canonicalUrl';



// QF-02: the head, the masthead, the owner's share bar, the modal stack and
// the transfer-credits card each live in components/diploma/ now. The page
// keeps the data loading and the state -- opening a modal is the page's job --
// and the layout that arranges them.
import DiplomaHead from '../components/diploma/DiplomaHead';
import DiplomaHero from '../components/diploma/DiplomaHero';
import DiplomaShareControls from '../components/diploma/DiplomaShareControls';
import DiplomaModals from '../components/diploma/DiplomaModals';
import TransferCreditsCard from '../components/diploma/TransferCreditsCard';

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
  // Both public routes, not just one. /public/diploma/:userId is recognised by
  // its path; /portfolio/:slug is recognised by the presence of a slug, which
  // is the more reliable signal of the two -- it comes from the router rather
  // than from window.location, and no other route in the app has one.
  //
  // Reading only the pathname meant a portfolio shared by slug -- the prettier
  // URL, and the one the app actually generates for sharing -- was not treated
  // as public, so it never carried the FERPA disclosure notice while the same
  // portfolio shared by user id did. isOwner is unaffected either way: it
  // already excludes any route with a slug.
  const isPublicRoute = Boolean(slug) || window.location.pathname.startsWith('/public/');
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [subjectXP, setSubjectXP] = useState({});  // NEW: Subject-specific XP
  const [pendingSubjectXP, setPendingSubjectXP] = useState({});  // XP awaiting teacher verification
  // earnedBadges state removed (January 2026 - Microschool client feedback)
  const [learningEvents, setLearningEvents] = useState([]);  // Learning events
  const [curated, setCurated] = useState([]);  // "Portfolio picks" (student-curated completions)
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
  const [linkCopied, setLinkCopied] = useState(false);

  // All features are now free for all users (Phase 2 refactoring - January 2025)
  const hasAccess = true;

  // Memoize expensive credit calculations to prevent unnecessary re-computation
  const creditProgress = useMemo(() => getAllCreditProgress(subjectXP), [subjectXP]);
  const totalCreditsEarned = useMemo(() => calculateTotalCredits(subjectXP), [subjectXP]);
  const meetsRequirements = useMemo(() => meetsGraduationRequirements(subjectXP), [subjectXP]);

  // Load demo/sample data for /public/diploma/demo route
  const loadDemoData = () => {
    setDiploma({
      student: {
        first_name: 'Alex',
        last_name: 'Rivera',
        display_name: 'Alex Rivera',
      },
      total_xp: 4500,
      total_quests_completed: 3,
    });

    setAchievements([
      {
        quest_id: 'demo-quest-1',
        quest_title: 'Build a Solar-Powered Phone Charger',
        quest_type: 'project',
        status: 'completed',
        completed_at: '2025-11-15T00:00:00Z',
        task_evidence: {
          'Research solar panel specifications': {
            pillar: 'stem',
            xp_awarded: 300,
            evidence_type: 'text',
            evidence_text: 'I compared monocrystalline vs polycrystalline panels for small-scale charging. Monocrystalline is more efficient per square inch, which matters when building a portable charger. I calculated that a 5W panel with a boost converter could charge a phone in about 3 hours of direct sunlight.',
          },
          'Build and test the circuit': {
            pillar: 'stem',
            xp_awarded: 400,
            evidence_type: 'text',
            evidence_text: 'Soldered the boost converter to step up from 5V to the USB standard. My first attempt had a loose connection that caused intermittent charging. Debugging with a multimeter taught me more about circuits than any textbook.',
          },
          'Document the build process': {
            pillar: 'communication',
            xp_awarded: 200,
            evidence_type: 'text',
            evidence_text: 'Created a step-by-step build guide with diagrams and a materials list. Wrote it so that someone with no electronics experience could follow along. Got feedback from two classmates who successfully built their own chargers using my guide.',
          },
        },
      },
      {
        quest_id: 'demo-quest-2',
        quest_title: 'Community Story Project',
        quest_type: 'project',
        status: 'completed',
        completed_at: '2025-12-20T00:00:00Z',
        task_evidence: {
          'Interview community members': {
            pillar: 'communication',
            xp_awarded: 350,
            evidence_type: 'text',
            evidence_text: 'Interviewed three long-time residents about how our neighborhood has changed. Mrs. Gutierrez shared stories about the old community garden that used to be where the parking lot is now. Learning to ask good follow-up questions was the hardest and most rewarding part.',
          },
          'Write and edit the narrative': {
            pillar: 'communication',
            xp_awarded: 300,
            evidence_type: 'text',
            evidence_text: 'Wove the three interviews into a single narrative about community resilience. Went through five drafts. The biggest challenge was honoring each person\'s voice while creating a cohesive story.',
          },
          'Present to community group': {
            pillar: 'civics',
            xp_awarded: 250,
            evidence_type: 'text',
            evidence_text: 'Presented the finished story at the neighborhood association meeting. About 40 people attended. Several residents said it inspired them to get involved in the community garden revival project. That felt like real impact.',
          },
        },
      },
      {
        quest_id: 'demo-quest-3',
        quest_title: 'Create a Digital Art Portfolio',
        quest_type: 'project',
        status: 'completed',
        completed_at: '2026-01-10T00:00:00Z',
        task_evidence: {
          'Learn digital illustration fundamentals': {
            pillar: 'art',
            xp_awarded: 300,
            evidence_type: 'text',
            evidence_text: 'Spent three weeks learning color theory and composition through daily practice. Started with simple shapes and gradients, then moved to character design. The biggest breakthrough was understanding how light and shadow create depth.',
          },
          'Create portfolio pieces': {
            pillar: 'art',
            xp_awarded: 450,
            evidence_type: 'text',
            evidence_text: 'Produced eight original illustrations spanning different styles: two landscape scenes, three character portraits, two abstract pieces, and one infographic. Each piece pushed me to try a new technique I hadn\'t used before.',
          },
          'Build online portfolio website': {
            pillar: 'stem',
            xp_awarded: 250,
            evidence_type: 'text',
            evidence_text: 'Built a responsive portfolio site using HTML and CSS. Learned about image optimization to keep load times fast. The design process itself became a creative exercise in balancing aesthetics with usability.',
          },
        },
      },
    ]);

    setTotalXP({
      stem: 950,
      communication: 850,
      art: 750,
      civics: 250,
      wellness: 200,
    });

    setSubjectXP({
      science: 650,
      math: 300,
      language_arts: 850,
      fine_arts: 750,
      digital_literacy: 500,
      social_studies: 250,
    });

    setTotalXPCount(4500);

    setLearningEvents([
      {
        id: 'demo-event-1',
        title: 'Unexpected lesson from a broken circuit',
        description: 'While debugging my solar charger, I accidentally shorted a component and had to figure out what went wrong. That 30-minute detour taught me more about electrical safety and troubleshooting than the planned curriculum.',
        event_type: 'reflection',
        created_at: '2025-11-10T00:00:00Z',
        pillar: 'stem',
      },
      {
        id: 'demo-event-2',
        title: 'Finding my interview style',
        description: 'After my first community interview felt stilted and awkward, I realized I was reading questions off a list instead of having a conversation. Switching to a few guiding topics instead of scripted questions made all the difference.',
        event_type: 'reflection',
        created_at: '2025-12-05T00:00:00Z',
        pillar: 'communication',
      },
    ]);

    setIsLoading(false);
  };

  // QF-05. Every section of this page is fetched independently so that one
  // failure cannot blank the others -- which is right. What was wrong is what
  // happened next: the rejection went to console.error and the section rendered
  // EMPTY, indistinguishable from "this student has none of these yet". A
  // parent looking at a diploma with no transfer credits could not tell whether
  // the credits were missing or the request was.
  //
  // A toast, not an inline banner: this page's layout is a masonry gallery and
  // a sidebar, and there is no honest place to put five per-section error
  // states without redesigning it. The toast names what failed and offers the
  // retry, which is the part that was missing.
  const reportSectionFailures = useCallback((results, labels) => {
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? labels[i] : null))
      .filter(Boolean);
    if (!failed.length) return;
    console.error('[Diploma] sections failed to load:', failed);
    toast.error(
      `Could not load: ${failed.join(', ')}. Everything else is up to date.`,
      { id: 'diploma-section-failure', duration: 6000 }
    );
  }, []);

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
    } else if (userId === 'demo') {
      // Demo mode - show sample data without API calls
      loadDemoData();
    } else if (userId) {
      // Public diploma route via userId
      fetchPublicDiplomaByUserId();
    } else if (effectiveUser) {
      // Authenticated user viewing their own diploma (no params)
      if (hasAccess) {
        // Fetch all data independently with error handling
        // Each fetch has its own try-catch to prevent one failure from affecting others
        // No per-call .catch: allSettled already isolates them, and catching
        // here converted every rejection into a fulfilled promise, so the
        // handler below could never tell which section had failed.
        Promise.allSettled([
          fetchAchievements(),
          fetchSubjectXP(),
          // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
          fetchLearningEvents(),
          fetchTransferCredits(),
          fetchCurated()
        ]).then((results) => {
          reportSectionFailures(results, ['achievements', 'subject credits', 'learning moments', 'transfer credits', 'portfolio picks']);
        }).finally(() => {
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
        fetchAchievements(),
        fetchSubjectXP(),
        // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
        fetchLearningEvents(),
        fetchTransferCredits()
      ]).then((results) => reportSectionFailures(results, ['achievements', 'subject credits', 'learning moments', 'transfer credits']));
    }
  };

  const handleFocus = () => {
    if (effectiveUser && !slug && !userId && hasAccess) {
      // Refresh all data independently with error handling
      Promise.allSettled([
        fetchAchievements(),
        fetchSubjectXP(),
        // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
        fetchLearningEvents(),
        fetchTransferCredits()
      ]).then((results) => reportSectionFailures(results, ['achievements', 'subject credits', 'learning moments', 'transfer credits']));
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

  // /portfolio/:slug and /public/diploma/:userId are the same page fed by the
  // same backend payload (both routes return get_diploma_data()), so they
  // unpack identically. They used not to: the slug route had its own thinner
  // shape and its handler below only called setDiploma/setCurated, which is why
  // it rendered with no pillars, no credits and no evidence. One extractor now,
  // so the two cannot drift again.
  const applyDiplomaPayload = (data) => {
    setDiploma(data);
    setCurated(data.curated || []);

    if (data.achievements) {
      setAchievements(data.achievements);
    }
    if (data.skill_xp) {
      setTotalXP(data.skill_xp);
    }
    if (data.total_xp) {
      setTotalXPCount(data.total_xp);
    }
    if (data.subject_xp) {
      // Array of rows -> { school_subject: xp_amount } for the credit tracker.
      const subjectXPMap = {};
      data.subject_xp.forEach(item => {
        subjectXPMap[item.school_subject] = item.xp_amount;
      });
      setSubjectXP(subjectXPMap);
    }
    if (data.transfer_credits) {
      setTransferCredits(data.transfer_credits);
    }
  };

  const fetchPublicDiploma = async () => {
    try {
      const response = await api.get(`/api/portfolio/public/${slug}`);
      const data = response.data;

      applyDiplomaPayload(data);

      // The payload identifies the student as student.id. The old code looked
      // for a top-level user_id, which this endpoint has never returned, so
      // learning events silently never loaded on the slug route.
      // fetchEarnedBadges removed (January 2026 - Microschool client feedback)
      if (data.student?.id) {
        await fetchLearningEvents(data.student.id);
      }
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
      // Forward the LTI evidence token (Canvas SpeedGrader carve-out) so the
      // unauthenticated grading teacher can view this student's work
      // regardless of the diploma's public/private setting.
      const ltiToken = new URLSearchParams(location.search).get('lti_token');
      const url = ltiToken
        ? `/api/portfolio/diploma/${userId}?lti_token=${encodeURIComponent(ltiToken)}`
        : `/api/portfolio/diploma/${userId}`;
      // Use api service for proper CORS handling, but this is a public endpoint
      const response = await api.get(url);
      const data = response.data;

      logger.debug('Public diploma data received:', data);

      applyDiplomaPayload(data);

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

  const fetchCurated = useCallback(async () => {
    // Own-diploma view: the curated list comes from a small dedicated endpoint
    // (the public views get it inline in the diploma payload).
    try {
      const response = await api.get('/api/portfolio/completions/curated');
      const data = response.data?.data || response.data;
      setCurated(data?.curated || []);
    } catch {
      setCurated([]);
    }
  }, []);

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

  const fetchTransferCredits = useCallback(async () => {
    try {
      const response = await api.get('/api/credits/transfer-credits');
      if (response.data?.transfer_credits) {
        setTransferCredits(response.data.transfer_credits);
      }
    } catch (error) {
      // Silently handle - transfer credits are optional
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
    const link = `${baseUrl}/public/diploma/${effectiveUser?.id}`;
    setShareableLink(link);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
    } catch (err) {
      // Fallback for Safari and older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareableLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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
    return student.first_name || student.username || student.display_name || 'This student';
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
    ? buildCanonicalUrl(`/portfolio/${slug}`)
    : diploma?.student?.portfolio_slug
      ? buildCanonicalUrl(`/portfolio/${diploma.student.portfolio_slug}`)
      : buildCanonicalUrl(`/public/diploma/${userId || user?.id}`);

  const pageTitle = `${studentName} - Portfolio Diploma | Optio`;
  const pageDescription = `${studentName} has accepted the responsibility to self-validate their education. This portfolio diploma showcases their learning journey with evidence-based achievements.`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <DiplomaHead
        pageTitle={pageTitle} pageDescription={pageDescription}
        canonicalUrl={canonicalUrl}
      />

      <DiplomaHero
        getStudentName={getStudentName}
        setShowDiplomaExplanation={setShowDiplomaExplanation}
      />

      {/* FERPA compliance: Show public notice banner on public portfolios */}
      {isPublicRoute && diploma?.public_consent_info?.opted_in && (
        <PublicNoticeBanner
          studentName={getStudentName()}
          withParentApproval={diploma?.public_consent_info?.with_parent_approval}
          consentDate={diploma?.public_consent_info?.consent_given_at}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-10">
        <DiplomaShareControls
          copyShareLink={copyShareLink} fromOrgProgress={fromOrgProgress}
          handlePrivacyToggle={handlePrivacyToggle} isOwner={isOwner}
          linkCopied={linkCopied} navigate={navigate}
          privacyLoading={privacyLoading} sourceOrgId={sourceOrgId}
          user={user} visibilityStatus={visibilityStatus}
        />

        {/* Main Layout: Sidebar + Evidence Gallery */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - Desktop: sticky left, Mobile: stacked top */}
          <aside className="w-full lg:w-80 lg:flex-shrink-0">
            <div className="lg:sticky lg:top-4">
              <CompactSidebar
                totalXP={totalXP}
                subjectXP={subjectXP}
                pendingSubjectXP={pendingSubjectXP}
                totalXPCount={totalXPCount}
                isOwner={isOwner}
                studentName={getStudentFirstName()}
                // Whose diploma this is, not who is reading it — a parent
                // viewing their 9-year-old's page should see the same pillar
                // view the child sees. Public payloads omit the birthday
                // (routes/public.py), which falls through to the credit view.
                dateOfBirth={displayData.student?.date_of_birth || effectiveUser?.date_of_birth}
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

            {/* Transfer Credits Cards - Shows imported credits from external transcripts */}
            {transferCredits && (Array.isArray(transferCredits) ? transferCredits : [transferCredits])
              .filter(tc => tc && tc.total_credits > 0)
              .map(tc => (
                <TransferCreditsCard
                  key={tc.id}
                  transferCredits={tc}
                  className="mb-8"
                />
              ))
            }

            {/* Portfolio picks — completions the student chose to spotlight */}
            {curated.length > 0 && (
              <div className="mb-10">
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-primary mb-1">Portfolio Picks</h3>
                  <p className="text-gray-600 text-sm">
                    {isOwner
                      ? 'Work you chose to spotlight'
                      : `Work ${getStudentFirstName()} chose to spotlight`}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {curated.map((pick) => (
                    <div
                      key={pick.completion_id}
                      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className="font-semibold text-gray-900 leading-snug">{pick.task_title}</h4>
                        {typeof pick.xp_value === 'number' && (
                          <span className="flex-shrink-0 px-2.5 py-1 text-xs font-bold rounded-full bg-gradient-primary text-white">
                            {pick.xp_value} XP
                          </span>
                        )}
                      </div>
                      {pick.quest_title && (
                        <p className="text-sm text-optio-purple font-medium mb-2">{pick.quest_title}</p>
                      )}
                      {pick.evidence_snippet && (
                        <p className="text-sm text-gray-600 line-clamp-3 mb-2">{pick.evidence_snippet}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {pick.pillar && <span className="capitalize">{pick.pillar}</span>}
                        {pick.completed_at && (
                          <span>{new Date(pick.completed_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

        <DiplomaModals
          showFullCreditsModal={showFullCreditsModal}
          setShowFullCreditsModal={setShowFullCreditsModal}
          subjectXP={subjectXP} pendingSubjectXP={pendingSubjectXP}
          selectedEvidenceItem={selectedEvidenceItem}
          setSelectedEvidenceItem={setSelectedEvidenceItem}
          selectedAchievement={selectedAchievement}
          setSelectedAchievement={setSelectedAchievement}
          showDiplomaExplanation={showDiplomaExplanation}
          setShowDiplomaExplanation={setShowDiplomaExplanation}
          showAccreditedDiplomaModal={showAccreditedDiplomaModal}
          setShowAccreditedDiplomaModal={setShowAccreditedDiplomaModal}
          showConsentModal={showConsentModal} setShowConsentModal={setShowConsentModal}
          handleConsentConfirm={handleConsentConfirm}
          getStudentFirstName={getStudentFirstName}
          visibilityStatus={visibilityStatus} privacyLoading={privacyLoading}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
};

export default memo(DiplomaPage);
