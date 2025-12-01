/**
 * UnifiedEvidenceDisplay - Single source of truth for evidence rendering
 *
 * Handles both multi-format AND legacy evidence seamlessly.
 * Automatic detection and fetching of document IDs from placeholder strings.
 * Rich content display with proper formatting.
 *
 * @param {Object} evidence - Evidence object from API
 * @param {Object} context - Optional context (task/quest info)
 * @param {string} displayMode - 'full' | 'compact' | 'preview'
 * @param {boolean} showMetadata - Show task/quest context header
 * @param {boolean} allowPrivateBlocks - Show private blocks (owner only)
 * @param {string} viewerUserId - User ID of current viewer (for confidential check)
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import TextBlock from './blocks/TextBlock';
import ImageBlock from './blocks/ImageBlock';
import LinkBlock from './blocks/LinkBlock';
import VideoBlock from './blocks/VideoBlock';
import DocumentBlock from './blocks/DocumentBlock';
import EvidenceHeader from './EvidenceHeader';
import EvidenceEmptyState from './EvidenceEmptyState';

const UnifiedEvidenceDisplay = ({
  evidence,
  context = {},
  displayMode = 'full',
  showMetadata = false,
  allowPrivateBlocks = false,
  viewerUserId = null
}) => {
  const [expandedBlocks, setExpandedBlocks] = useState(new Set());
  const [studentName, setStudentName] = useState('This student');

  // Handle null or undefined evidence
  if (!evidence) {
    return <EvidenceEmptyState message="No evidence data provided" />;
  }

  const {
    evidence_type,
    evidence_blocks = [],
    evidence_text,
    evidence_url,
    is_confidential = false,
    owner_user_id = null
  } = evidence;

  // Fetch student name if this is confidential evidence
  useEffect(() => {
    if (is_confidential && owner_user_id && owner_user_id !== viewerUserId) {
      // Try to get student name from context first
      if (context?.student_name) {
        setStudentName(context.student_name);
      } else {
        // Fetch from API
        import('../../services/api').then(({ default: api }) => {
          api.get(`/users/${owner_user_id}/profile`)
            .then(response => {
              const name = response.data.display_name || response.data.first_name || 'This student';
              setStudentName(name);
            })
            .catch(() => {
              setStudentName('This student');
            });
        });
      }
    }
  }, [is_confidential, owner_user_id, viewerUserId, context]);

  // Check if evidence is confidential and viewer is not the owner
  const isConfidentialToViewer = is_confidential && owner_user_id && owner_user_id !== viewerUserId;

  // Show confidential message if needed
  if (isConfidentialToViewer) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-8">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-500 rounded-lg flex items-center justify-center">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Confidential Evidence
            </h4>
            <p className="text-gray-700 font-medium leading-relaxed" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {studentName} has marked this evidence as confidential. Please contact them directly for more information.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filter private blocks if needed
  const visibleBlocks = allowPrivateBlocks
    ? evidence_blocks
    : evidence_blocks.filter(block => !block.is_private);

  // Determine if we have any evidence to show
  const hasMultiFormat = evidence_type === 'multi_format' && visibleBlocks.length > 0;
  const hasLegacyText = evidence_text && !evidence_text.startsWith('Multi-format evidence document');
  const hasLegacyUrl = evidence_url;
  const hasEvidence = hasMultiFormat || hasLegacyText || hasLegacyUrl;

  if (!hasEvidence) {
    return <EvidenceEmptyState message="No evidence submitted for this task" />;
  }

  // Toggle block expansion
  const toggleBlock = (blockId) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  // Render multi-format evidence blocks
  const renderMultiFormatEvidence = () => {
    if (!hasMultiFormat) return null;

    return (
      <div className="space-y-4">
        {showMetadata && context && (
          <EvidenceHeader context={context} blockCount={visibleBlocks.length} />
        )}

        <div className="space-y-3">
          {visibleBlocks.map((block, index) => {
            const isExpanded = expandedBlocks.has(block.id);
            const key = block.id || `block-${index}`;

            // Uploader badge component (shown for non-student uploads)
            const uploaderBadge = block.uploaded_by_role && block.uploaded_by_role !== 'student' && block.uploaded_by_name && (
              <div className="mb-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Added by {block.uploaded_by_name} ({block.uploaded_by_role === 'advisor' ? 'Advisor' : 'Parent'})
              </div>
            );

            switch (block.block_type) {
              case 'text':
                return (
                  <div key={key}>
                    {uploaderBadge}
                    <TextBlock
                      block={block}
                      isExpanded={isExpanded}
                      onToggle={() => toggleBlock(block.id)}
                      displayMode={displayMode}
                    />
                  </div>
                );

              case 'image':
                return (
                  <div key={key}>
                    {uploaderBadge}
                    <ImageBlock
                      block={block}
                      displayMode={displayMode}
                    />
                  </div>
                );

              case 'link':
                return (
                  <div key={key}>
                    {uploaderBadge}
                    <LinkBlock
                      block={block}
                      displayMode={displayMode}
                    />
                  </div>
                );

              case 'video':
                return (
                  <div key={key}>
                    {uploaderBadge}
                    <VideoBlock
                      block={block}
                      displayMode={displayMode}
                    />
                  </div>
                );

              case 'document':
                return (
                  <div key={key}>
                    {uploaderBadge}
                    <DocumentBlock
                      block={block}
                      displayMode={displayMode}
                    />
                  </div>
                );

              default:
                return (
                  <div key={key} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Unknown block type: {block.block_type}
                    </p>
                  </div>
                );
            }
          })}
        </div>
      </div>
    );
  };

  // Render legacy text evidence as a card
  const renderLegacyTextEvidence = () => {
    if (!hasLegacyText) return null;

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {showMetadata && context && (
          <EvidenceHeader context={context} blockCount={1} />
        )}
        <div className="prose max-w-none">
          <p className="text-gray-900 whitespace-pre-wrap font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {evidence_text}
          </p>
        </div>
      </div>
    );
  };

  // Render legacy URL evidence as a link card
  const renderLegacyUrlEvidence = () => {
    if (!hasLegacyUrl) return null;

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {showMetadata && context && (
          <EvidenceHeader context={context} blockCount={1} />
        )}
        <a
          href={evidence_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 text-purple-600 hover:text-purple-800 font-semibold transition-colors"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span className="break-all">{evidence_url}</span>
        </a>
      </div>
    );
  };

  // Main render
  return (
    <div className={`unified-evidence-display ${displayMode}`}>
      {hasMultiFormat && renderMultiFormatEvidence()}
      {hasLegacyText && renderLegacyTextEvidence()}
      {hasLegacyUrl && renderLegacyUrlEvidence()}
    </div>
  );
};

UnifiedEvidenceDisplay.propTypes = {
  evidence: PropTypes.shape({
    evidence_type: PropTypes.oneOf(['multi_format', 'legacy_text', 'legacy_link', 'text', 'link']),
    evidence_blocks: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string,
      block_type: PropTypes.oneOf(['text', 'image', 'link', 'video', 'document']).isRequired,
      content: PropTypes.object.isRequired,
      order_index: PropTypes.number,
      is_private: PropTypes.bool
    })),
    evidence_text: PropTypes.string,
    evidence_url: PropTypes.string,
    evidence_content: PropTypes.string, // Legacy field name
    is_confidential: PropTypes.bool,
    owner_user_id: PropTypes.string
  }),
  context: PropTypes.shape({
    taskTitle: PropTypes.string,
    questTitle: PropTypes.string,
    pillar: PropTypes.string,
    completedAt: PropTypes.string,
    xpAwarded: PropTypes.number,
    student_name: PropTypes.string
  }),
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview']),
  showMetadata: PropTypes.bool,
  allowPrivateBlocks: PropTypes.bool,
  viewerUserId: PropTypes.string
};

export default UnifiedEvidenceDisplay;
