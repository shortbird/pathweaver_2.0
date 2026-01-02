import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import Masonry from 'react-masonry-css';
import UnifiedEvidenceDisplay from '../evidence/UnifiedEvidenceDisplay';
import CollaborationBadge from '../collaboration/CollaborationBadge';
import { getPillarGradient, getPillarDisplayName } from '../../config/pillars';
import './EvidenceMasonryGallery.css';

const EvidenceMasonryGallery = ({ achievements, onEvidenceClick, isOwner }) => {
  const [selectedPillar, setSelectedPillar] = useState('all');
  const [selectedQuest, setSelectedQuest] = useState('all');

  // Extract YouTube video ID and generate thumbnail URL
  const getYouTubeThumbnail = (url) => {
    if (!url) return null;
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/;
    const match = url.match(regex);
    return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
  };

  // Extract Vimeo video ID for thumbnail (uses vumbnail service)
  const getVimeoThumbnail = (url) => {
    if (!url) return null;
    const regex = /vimeo\.com\/(\d+)/;
    const match = url.match(regex);
    return match ? `https://vumbnail.com/${match[1]}.jpg` : null;
  };

  // Get video thumbnail URL
  const getVideoThumbnail = (url) => {
    if (!url) return null;
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return getYouTubeThumbnail(url);
    }
    if (url.includes('vimeo.com')) {
      return getVimeoThumbnail(url);
    }
    return null;
  };

  // Get domain from URL for display
  const getDomain = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  // Extract all evidence blocks from achievements
  const allEvidence = useMemo(() => {
    const evidence = [];

    achievements.forEach(achievement => {
      Object.entries(achievement.task_evidence || {}).forEach(([taskTitle, taskEvidence]) => {
        // Handle both multi-format and legacy evidence
        const evidenceBlocks = taskEvidence.evidence_blocks || [];
        const hasLegacyText = taskEvidence.evidence_text && !taskEvidence.evidence_text.startsWith('Multi-format evidence document');
        const hasLegacyUrl = taskEvidence.evidence_url;

        // Create evidence items for each block or legacy evidence
        if (evidenceBlocks.length > 0) {
          evidenceBlocks.forEach((block, blockIndex) => {
            evidence.push({
              id: `${achievement.quest.id}-${taskTitle}-${blockIndex}`,
              questTitle: achievement.quest.title,
              questId: achievement.quest.id,
              questImage: achievement.quest.image_url || achievement.quest.header_image_url,
              taskTitle,
              pillar: taskEvidence.pillar,
              xpAwarded: taskEvidence.xp_awarded,
              completedAt: taskEvidence.completed_at,
              block,
              evidence: taskEvidence,
              achievementStatus: achievement.status,
              isCollaborative: taskEvidence.is_collaborative || false
            });
          });
        } else if (hasLegacyText || hasLegacyUrl) {
          evidence.push({
            id: `${achievement.quest.id}-${taskTitle}-legacy`,
            questTitle: achievement.quest.title,
            questId: achievement.quest.id,
            questImage: achievement.quest.image_url || achievement.quest.header_image_url,
            taskTitle,
            pillar: taskEvidence.pillar,
            xpAwarded: taskEvidence.xp_awarded,
            completedAt: taskEvidence.completed_at,
            block: null,
            evidence: taskEvidence,
            achievementStatus: achievement.status,
            isCollaborative: taskEvidence.is_collaborative || false
          });
        }
      });
    });

    // Sort by completion date (most recent first)
    return evidence.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [achievements]);

  // Get unique quests and pillars for filters
  const quests = useMemo(() => {
    const questMap = new Map();
    achievements.forEach(achievement => {
      if (!questMap.has(achievement.quest.id)) {
        questMap.set(achievement.quest.id, {
          id: achievement.quest.id,
          title: achievement.quest.title
        });
      }
    });
    return Array.from(questMap.values());
  }, [achievements]);

  const pillars = useMemo(() => {
    const pillarSet = new Set();
    allEvidence.forEach(item => {
      if (item.pillar) pillarSet.add(item.pillar);
    });
    return Array.from(pillarSet);
  }, [allEvidence]);

  // Filter evidence based on selected filters
  const filteredEvidence = useMemo(() => {
    return allEvidence.filter(item => {
      const pillarMatch = selectedPillar === 'all' || item.pillar === selectedPillar;
      const questMatch = selectedQuest === 'all' || item.questId === selectedQuest;
      return pillarMatch && questMatch;
    });
  }, [allEvidence, selectedPillar, selectedQuest]);

  // Masonry breakpoint columns - reduced to 2 columns for less cramped feel
  const breakpointColumns = {
    default: 2,
    1536: 2,
    1280: 2,
    1024: 2,
    768: 1,
    640: 1
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleEvidenceClick = (item) => {
    if (onEvidenceClick) {
      onEvidenceClick(item);
    }
  };

  if (allEvidence.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-gray-500 text-lg">
          {isOwner
            ? 'No evidence yet. Complete quest tasks to showcase your learning!'
            : 'No evidence has been submitted yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="evidence-masonry-gallery">
      {/* Filter Controls */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">Filter by:</span>
        </div>

        {/* Quest Filter */}
        <select
          value={selectedQuest}
          onChange={(e) => setSelectedQuest(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        >
          <option value="all">All Quests ({allEvidence.length})</option>
          {quests.map(quest => {
            const count = allEvidence.filter(e => e.questId === quest.id).length;
            return (
              <option key={quest.id} value={quest.id}>
                {quest.title} ({count})
              </option>
            );
          })}
        </select>

        {/* Pillar Filter */}
        <select
          value={selectedPillar}
          onChange={(e) => setSelectedPillar(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        >
          <option value="all">All Pillars</option>
          {pillars.map(pillar => {
            const count = allEvidence.filter(e => e.pillar === pillar).length;
            return (
              <option key={pillar} value={pillar}>
                {getPillarDisplayName(pillar)} ({count})
              </option>
            );
          })}
        </select>

        {/* Clear Filters */}
        {(selectedPillar !== 'all' || selectedQuest !== 'all') && (
          <button
            onClick={() => {
              setSelectedPillar('all');
              setSelectedQuest('all');
            }}
            className="text-sm text-optio-purple hover:text-purple-800 font-medium"
          >
            Clear filters
          </button>
        )}

        {/* Results count */}
        <div className="ml-auto text-sm text-gray-500">
          Showing {filteredEvidence.length} of {allEvidence.length} items
        </div>
      </div>

      {/* Masonry Grid */}
      {filteredEvidence.length > 0 ? (
        <Masonry
          breakpointCols={breakpointColumns}
          className="masonry-grid"
          columnClassName="masonry-grid-column"
        >
          {filteredEvidence.map((item) => {
            const gradientClass = getPillarGradient(item.pillar);
            const pillarName = getPillarDisplayName(item.pillar);

            return (
              <div
                key={item.id}
                className="masonry-item bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100"
                onClick={() => handleEvidenceClick(item)}
              >
                {/* Quest Context Header */}
                <div className={`p-3 bg-gradient-to-r ${gradientClass}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-semibold text-sm truncate">
                        {item.questTitle}
                      </h4>
                      <p className="text-white/90 text-xs truncate">
                        {item.taskTitle}
                      </p>
                      {item.isCollaborative && (
                        <div className="mt-1.5">
                          <CollaborationBadge size="xs" />
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded text-white text-xs font-medium">
                        +{item.xpAwarded} XP
                      </span>
                    </div>
                  </div>
                </div>

                {/* Evidence Content */}
                <div className="p-4">
                  {item.block ? (
                    // Render specific block - handle both old format (content.url) and new format (content.items)
                    <div className="evidence-preview">
                      {item.block.block_type === 'image' && (() => {
                        const imageUrl = item.block.content.items?.[0]?.url || item.block.content.url;
                        const altText = item.block.content.items?.[0]?.alt || item.block.content.alt_text || 'Evidence';
                        if (!imageUrl) return <div className="text-gray-400 text-sm">No image available</div>;
                        return (
                          <img
                            src={imageUrl}
                            alt={altText}
                            className="w-full h-auto rounded-lg"
                            loading="lazy"
                          />
                        );
                      })()}
                      {item.block.block_type === 'video' && (() => {
                        const videoUrl = item.block.content.items?.[0]?.url || item.block.content.url;
                        const videoTitle = item.block.content.items?.[0]?.title || item.block.content.title;
                        if (!videoUrl) return <div className="text-gray-400 text-sm">No video available</div>;
                        const thumbnailUrl = getVideoThumbnail(videoUrl);

                        if (thumbnailUrl) {
                          // Show thumbnail for YouTube/Vimeo
                          return (
                            <div className="relative">
                              <img
                                src={thumbnailUrl}
                                alt={videoTitle || 'Video thumbnail'}
                                className="w-full h-auto rounded-lg object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg hover:bg-black/30 transition-colors">
                                <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                  <svg className="w-7 h-7 text-optio-purple ml-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                  </svg>
                                </div>
                              </div>
                              {videoTitle && (
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-lg">
                                  <p className="text-white text-sm font-medium truncate">{videoTitle}</p>
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Fallback for direct video files
                        return (
                          <div className="relative">
                            <video
                              src={videoUrl}
                              className="w-full h-auto rounded-lg"
                              controls={false}
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg">
                              <svg className="w-12 h-12 text-white opacity-90" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </div>
                          </div>
                        );
                      })()}
                      {item.block.block_type === 'text' && (
                        <div className="prose prose-sm max-w-none">
                          <p className="text-gray-700 line-clamp-4">
                            {item.block.content.text}
                          </p>
                        </div>
                      )}
                      {item.block.block_type === 'link' && (() => {
                        const linkItem = item.block.content.items?.[0] || {
                          url: item.block.content.url,
                          title: item.block.content.title
                        };
                        if (!linkItem.url) return <div className="text-gray-400 text-sm">No link available</div>;
                        const domain = getDomain(linkItem.url);
                        return (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-optio-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              <p className="text-sm font-medium text-gray-900 truncate flex-1">
                                {linkItem.title || domain}
                              </p>
                            </div>
                            <p className="text-xs text-optio-purple mt-1 truncate">
                              {domain}
                            </p>
                          </div>
                        );
                      })()}
                      {item.block.block_type === 'document' && (() => {
                        const docItem = item.block.content.items?.[0] || {
                          filename: item.block.content.filename,
                          title: item.block.content.title
                        };
                        return (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <svg className="w-8 h-8 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {docItem.title || docItem.filename || 'Document'}
                              </p>
                              <p className="text-xs text-gray-500">
                                Click to view
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    // Render legacy evidence
                    <div className="text-sm text-gray-700 line-clamp-4">
                      {item.evidence.evidence_text && (
                        <p>{item.evidence.evidence_text}</p>
                      )}
                      {item.evidence.evidence_url && (
                        <a
                          href={item.evidence.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-optio-purple hover:underline break-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.evidence.evidence_url}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer with metadata */}
                <div className="px-4 pb-3 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${gradientClass} text-xs font-medium`}>
                      {pillarName}
                    </span>
                  </div>
                  <span>{formatDate(item.completedAt)}</span>
                </div>
              </div>
            );
          })}
        </Masonry>
      ) : (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-gray-500">No evidence matches your filters</p>
          <button
            onClick={() => {
              setSelectedPillar('all');
              setSelectedQuest('all');
            }}
            className="mt-2 text-sm text-optio-purple hover:text-purple-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

EvidenceMasonryGallery.propTypes = {
  achievements: PropTypes.arrayOf(PropTypes.shape({
    quest: PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      image_url: PropTypes.string,
      header_image_url: PropTypes.string
    }).isRequired,
    task_evidence: PropTypes.object,
    status: PropTypes.string
  })).isRequired,
  onEvidenceClick: PropTypes.func,
  isOwner: PropTypes.bool
};

export default EvidenceMasonryGallery;
