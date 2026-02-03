import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { CalendarIcon, ArrowRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';

/**
 * LearningJournalSection - Shows recent learning moments with link to full journal
 * Used in both StudentOverviewPage and ChildOverviewContent (parent view)
 */
const LearningJournalSection = ({
  moments: propMoments,
  studentId,
  viewMode = 'student', // 'student' | 'parent'
  hideHeader = false,
  limit = 5
}) => {
  const [moments, setMoments] = useState(propMoments || []);
  const [loading, setLoading] = useState(!propMoments);
  const [error, setError] = useState(null);

  // Fetch moments if not provided as props
  useEffect(() => {
    if (propMoments) {
      setMoments(propMoments);
      return;
    }

    const fetchMoments = async () => {
      setLoading(true);
      try {
        let response;
        if (viewMode === 'parent' && studentId) {
          response = await api.get(`/api/parent/children/${studentId}/learning-moments?limit=${limit}`);
          setMoments(response.data.moments || []);
        } else {
          response = await api.get(`/api/learning-events?limit=${limit}`);
          setMoments(response.data.events || []);
        }
      } catch (err) {
        console.error('Failed to fetch learning moments:', err);
        setError('Failed to load learning moments');
      } finally {
        setLoading(false);
      }
    };

    fetchMoments();
  }, [propMoments, studentId, viewMode, limit]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const truncateText = (text, maxLength = 120) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  // Determine the link destination
  const journalLink = viewMode === 'parent' && studentId
    ? `/parent/child/${studentId}/journal`
    : '/learning-journal';

  const journalLinkText = viewMode === 'parent'
    ? 'View & Organize Journal'
    : 'View Learning Journal';

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse flex gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header - shown inline when hideHeader is true */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Recent Learning Moments
          </h3>
          <Link
            to={journalLink}
            className="text-sm font-medium text-optio-purple hover:text-optio-pink transition-colors flex items-center gap-1"
          >
            {journalLinkText}
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}

      {moments.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <SparklesIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            No learning moments yet
          </p>
          <p className="text-sm text-gray-500">
            {viewMode === 'parent'
              ? 'Capture learning moments using the button below'
              : 'Start capturing your learning moments to build your journal'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {moments.slice(0, limit).map((moment) => (
            <div
              key={moment.id}
              className="flex gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {/* Date badge */}
              <div className="flex-shrink-0 w-12 h-12 bg-white border border-gray-200 rounded-lg flex flex-col items-center justify-center">
                <CalendarIcon className="w-4 h-4 text-gray-400 mb-0.5" />
                <span className="text-xs font-medium text-gray-600">
                  {formatDate(moment.created_at)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-sm leading-relaxed mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {truncateText(moment.description)}
                </p>

                {/* Pillars and metadata */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Pillar tags */}
                  {moment.pillars && moment.pillars.length > 0 && moment.pillars.slice(0, 2).map((pillar) => {
                    const pillarData = getPillarData(pillar);
                    if (!pillarData) return null;

                    return (
                      <span
                        key={pillar}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pillarData.bg} ${pillarData.text}`}
                      >
                        {pillarData.name}
                      </span>
                    );
                  })}

                  {/* Evidence count */}
                  {moment.evidence_blocks && moment.evidence_blocks.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      {moment.evidence_blocks.length}
                    </span>
                  )}

                  {/* Parent-captured indicator */}
                  {moment.captured_by_user_id && moment.captured_by_name && (
                    <span className="inline-flex items-center text-xs text-gray-500">
                      Captured by {moment.captured_by_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* View All Link */}
          <Link
            to={journalLink}
            className="flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 hover:from-optio-purple/10 hover:to-optio-pink/10 rounded-lg transition-colors group"
          >
            <span className="text-sm font-medium text-optio-purple group-hover:text-optio-pink transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {journalLinkText}
            </span>
            <ArrowRightIcon className="w-4 h-4 text-optio-purple group-hover:text-optio-pink group-hover:translate-x-1 transition-all" />
          </Link>
        </div>
      )}
    </div>
  );
};

LearningJournalSection.propTypes = {
  moments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string,
    created_at: PropTypes.string,
    pillars: PropTypes.array,
    evidence_blocks: PropTypes.array,
    captured_by_user_id: PropTypes.string
  })),
  studentId: PropTypes.string,
  viewMode: PropTypes.oneOf(['student', 'parent']),
  hideHeader: PropTypes.bool,
  limit: PropTypes.number
};

export default LearningJournalSection;
