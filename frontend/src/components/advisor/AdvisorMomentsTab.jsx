import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { advisorAPI } from '../../services/api';
import { TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const AdvisorMomentsTab = ({ studentId, studentName }) => {
  const { user } = useAuth();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMoments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await advisorAPI.getStudentLearningMoments(studentId, { limit: 50 });
      if (response.data.success) {
        setMoments(response.data.moments || []);
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching moments:', err);
      setError('Failed to load learning moments');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchMoments();
  }, [fetchMoments]);

  const handleDelete = async (momentId) => {
    if (!window.confirm('Delete this learning moment?')) return;

    try {
      await advisorAPI.deleteLearningMoment(studentId, momentId);
      setMoments(prev => prev.filter(m => m.id !== momentId));
      toast.success('Moment deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete moment');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse bg-gray-100 rounded-lg p-4 h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={fetchMoments} className="mt-2 text-sm text-optio-purple hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (moments.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium">No learning moments yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Use the capture button to document {studentName}'s learning
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{moments.length} moment{moments.length !== 1 ? 's' : ''}</p>

      {moments.map(moment => {
        const canEdit = moment.captured_by_user_id === user?.id;
        const source = moment.source_type === 'advisor_captured'
          ? `Captured by ${moment.captured_by_name || 'advisor'}`
          : moment.source_type === 'parent_captured'
            ? `Captured by ${moment.captured_by_name || 'parent'}`
            : 'Self-captured';

        return (
          <div key={moment.id} className="bg-white border border-gray-200 rounded-lg p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                {moment.title && (
                  <h4 className="font-semibold text-gray-900 text-sm">{moment.title}</h4>
                )}
                <p className="text-xs text-gray-500">
                  {formatDate(moment.created_at)} -- {source}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(moment.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete moment"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Description */}
            {moment.description && (
              <p className="text-sm text-gray-700 mb-3">{moment.description}</p>
            )}

            {/* Evidence blocks */}
            {moment.evidence_blocks && moment.evidence_blocks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {moment.evidence_blocks.map((block, idx) => {
                  if (block.block_type === 'image') {
                    const url = block.content?.url || block.file_url;
                    return url ? (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={block.content?.alt_text || ''}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                        />
                      </a>
                    ) : null;
                  }
                  if (block.block_type === 'link') {
                    return (
                      <a
                        key={idx}
                        href={block.content?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {block.content?.title || block.content?.url}
                      </a>
                    );
                  }
                  if (block.block_type === 'document') {
                    return (
                      <a
                        key={idx}
                        href={block.content?.url || block.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-gray-50 px-2 py-1 rounded"
                      >
                        {block.content?.filename || block.file_name || 'Document'}
                      </a>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Pillars */}
            {moment.pillars && moment.pillars.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {moment.pillars.map((pillar, idx) => (
                  <span key={idx} className="text-xs px-2 py-0.5 bg-optio-purple/10 text-optio-purple rounded-full">
                    {pillar}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

AdvisorMomentsTab.propTypes = {
  studentId: PropTypes.string.isRequired,
  studentName: PropTypes.string.isRequired,
};

export default AdvisorMomentsTab;
