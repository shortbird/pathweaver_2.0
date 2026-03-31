import React, { useState, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import UnifiedEvidenceDisplay from '../evidence/UnifiedEvidenceDisplay';
import { getPillarGradient, getPillarDisplayName } from '../../config/pillars';

/**
 * QuestAccordionGallery - Displays portfolio evidence grouped by quest.
 *
 * Desktop: quest cards in a column layout; clicking opens a modal with tasks/evidence.
 * Mobile: quest cards stacked; clicking expands inline accordion.
 * Evidence detail is shown within the quest context with back navigation.
 */
const QuestAccordionGallery = ({ achievements, isOwner, transferCreditsCard }) => {
  const [expandedQuests, setExpandedQuests] = useState(new Set());
  const [selectedPillar, setSelectedPillar] = useState('all');
  const [modalQuest, setModalQuest] = useState(null);
  const [mobileEvidence, setMobileEvidence] = useState(null); // { item, questTitle }
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Build quest-grouped data from achievements
  const questGroups = useMemo(() => {
    return achievements
      .map(achievement => {
        const quest = achievement.quest;
        const tasks = [];
        let totalXp = 0;
        const pillarSet = new Set();

        Object.entries(achievement.task_evidence || {}).forEach(([taskTitle, taskEvidence]) => {
          const evidenceBlocks = (taskEvidence.evidence_blocks || []).filter(b => {
            if (!b || !b.content) return false;
            const c = b.content;
            if (b.block_type === 'image') return !!(c.url || c.items?.[0]?.url);
            if (b.block_type === 'video') return !!(c.url || c.items?.[0]?.url);
            if (b.block_type === 'text') return !!(c.text && c.text.trim());
            if (b.block_type === 'link') return !!(c.url || c.items?.[0]?.url);
            if (b.block_type === 'document') return !!(c.filename || c.items?.[0]?.filename || c.url || c.items?.[0]?.url);
            return true;
          });
          const hasLegacyText = taskEvidence.evidence_text && !taskEvidence.evidence_text.startsWith('Multi-format evidence document');
          const hasLegacyUrl = taskEvidence.evidence_url;
          const hasEvidence = evidenceBlocks.length > 0 || hasLegacyText || hasLegacyUrl;

          if (hasEvidence) {
            const xp = taskEvidence.xp_awarded || 0;
            totalXp += xp;
            if (taskEvidence.pillar) pillarSet.add(taskEvidence.pillar);

            const items = [];
            if (evidenceBlocks.length > 0) {
              evidenceBlocks.forEach((block, blockIndex) => {
                items.push({
                  id: `${quest.id}-${taskTitle}-${blockIndex}`,
                  questTitle: quest.title,
                  questId: quest.id,
                  taskTitle,
                  pillar: taskEvidence.pillar,
                  xpAwarded: xp,
                  completedAt: taskEvidence.completed_at,
                  block,
                  evidence: { ...taskEvidence, evidence_type: taskEvidence.evidence_type || 'multi_format' },
                  achievementStatus: achievement.status,
                  isCollaborative: taskEvidence.is_collaborative || false,
                });
              });
            } else {
              items.push({
                id: `${quest.id}-${taskTitle}-legacy`,
                questTitle: quest.title,
                questId: quest.id,
                taskTitle,
                pillar: taskEvidence.pillar,
                xpAwarded: xp,
                completedAt: taskEvidence.completed_at,
                block: null,
                evidence: taskEvidence,
                achievementStatus: achievement.status,
                isCollaborative: taskEvidence.is_collaborative || false,
              });
            }

            tasks.push({
              title: taskTitle,
              pillar: taskEvidence.pillar,
              xpAwarded: xp,
              completedAt: taskEvidence.completed_at,
              evidence: { ...taskEvidence, evidence_type: taskEvidence.evidence_type || (evidenceBlocks.length > 0 ? 'multi_format' : taskEvidence.evidence_type) },
              evidenceBlocks,
              hasLegacyText,
              hasLegacyUrl,
              isCollaborative: taskEvidence.is_collaborative || false,
              items,
            });
          }
        });

        tasks.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

        return {
          questId: quest.id,
          title: quest.title,
          imageUrl: quest.image_url || quest.header_image_url,
          status: achievement.status,
          tasks,
          totalXp,
          pillars: Array.from(pillarSet),
        };
      })
      .filter(group => group.tasks.length > 0)
      .sort((a, b) => {
        const aLatest = a.tasks[0]?.completedAt || '';
        const bLatest = b.tasks[0]?.completedAt || '';
        return new Date(bLatest) - new Date(aLatest);
      });
  }, [achievements]);

  const allPillars = useMemo(() => {
    const set = new Set();
    questGroups.forEach(g => g.pillars.forEach(p => set.add(p)));
    return Array.from(set);
  }, [questGroups]);

  const filteredGroups = useMemo(() => {
    if (selectedPillar === 'all') return questGroups;
    return questGroups.filter(g => g.pillars.includes(selectedPillar));
  }, [questGroups, selectedPillar]);

  const handleQuestClick = (group) => {
    if (isDesktop) {
      setModalQuest(group);
    } else {
      setExpandedQuests(prev => {
        const next = new Set(prev);
        if (next.has(group.questId)) {
          next.delete(group.questId);
        } else {
          next.add(group.questId);
        }
        return next;
      });
    }
  };

  const handleMobileEvidenceClick = (item, questTitle) => {
    setMobileEvidence({ item, questTitle });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (questGroups.length === 0) {
    return null;
  }

  return (
    <div className="quest-accordion-gallery">
      {/* Controls row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setSelectedPillar('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedPillar === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({questGroups.length})
          </button>
          {allPillars.map(pillar => {
            const count = questGroups.filter(g => g.pillars.includes(pillar)).length;
            return (
              <button
                key={pillar}
                onClick={() => setSelectedPillar(pillar)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedPillar === pillar
                    ? `bg-gradient-to-r ${getPillarGradient(pillar)} text-white`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {getPillarDisplayName(pillar)} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Quest cards */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
        {transferCreditsCard}
        {filteredGroups.map(group => {
          const isExpanded = expandedQuests.has(group.questId);
          const primaryPillar = group.pillars[0];
          const gradientClass = getPillarGradient(primaryPillar);

          return (
            <div
              key={group.questId}
              className="rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col mb-4 break-inside-avoid"
            >
              <button
                onClick={() => handleQuestClick(group)}
                className="w-full text-left"
              >
                <div className="relative h-32 overflow-hidden">
                  {group.imageUrl ? (
                    <img src={group.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${gradientClass}`} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute top-2 right-2 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-semibold text-optio-purple">
                    +{group.totalXp} XP
                  </div>
                  <div className="absolute bottom-2 right-2 md:hidden">
                    <svg
                      className={`w-5 h-5 text-white/80 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">{group.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {group.pillars.map(pillar => (
                      <span
                        key={pillar}
                        className={`inline-block px-2 py-0.5 rounded-full text-white text-xs font-medium bg-gradient-to-r ${getPillarGradient(pillar)}`}
                      >
                        {getPillarDisplayName(pillar)}
                      </span>
                    ))}
                    <span className="text-xs text-gray-500">
                      {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                </div>
              </button>

              {/* Mobile only: inline expanded task list */}
              {!isDesktop && isExpanded && (
                <TaskList
                  tasks={group.tasks}
                  onEvidenceClick={(item) => handleMobileEvidenceClick(item, group.title)}
                  formatDate={formatDate}
                />
              )}
            </div>
          );
        })}
      </div>

      {filteredGroups.length === 0 && selectedPillar !== 'all' && (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No quests match this filter</p>
          <button
            onClick={() => setSelectedPillar('all')}
            className="mt-2 text-sm text-optio-purple hover:text-purple-800 font-medium"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Desktop: Quest detail modal (handles its own evidence drill-down) */}
      {modalQuest && (
        <QuestDetailModal
          group={modalQuest}
          onClose={() => setModalQuest(null)}
          formatDate={formatDate}
        />
      )}

      {/* Mobile: Evidence detail modal with back to quest */}
      {mobileEvidence && (
        <EvidenceDetailView
          item={mobileEvidence.item}
          questTitle={mobileEvidence.questTitle}
          onBack={() => setMobileEvidence(null)}
        />
      )}
    </div>
  );
};

/**
 * Task list used by both mobile inline and desktop modal.
 */
const TaskList = ({ tasks, onEvidenceClick, formatDate }) => (
  <div className="border-t border-gray-100">
    {tasks.map((task, taskIndex) => (
      <div
        key={task.title}
        className={`${taskIndex > 0 ? 'border-t border-gray-100' : ''}`}
      >
        <div className="px-4 py-3 bg-gray-50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 truncate">{task.title}</span>
              {task.isCollaborative && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded flex-shrink-0">
                  Collaborative
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-500">
              <span className={`px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${getPillarGradient(task.pillar)}`}>
                {getPillarDisplayName(task.pillar)}
              </span>
              <span>+{task.xpAwarded} XP</span>
              <span className="hidden sm:inline">{formatDate(task.completedAt)}</span>
            </div>
          </div>
        </div>
        <div className="px-4 py-3">
          {task.evidenceBlocks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {task.items.map(item => (
                <EvidenceCard key={item.id} item={item} onClick={() => onEvidenceClick?.(item)} />
              ))}
            </div>
          ) : (
            <div
              className="cursor-pointer rounded-lg border border-gray-200 p-3 hover:border-optio-purple hover:shadow-sm transition-all"
              onClick={() => onEvidenceClick?.(task.items[0])}
            >
              {task.evidence.evidence_text && (
                <p className="text-sm text-gray-700 line-clamp-3">{task.evidence.evidence_text}</p>
              )}
              {task.evidence.evidence_url && (
                <p className="text-sm text-optio-purple truncate mt-1">{task.evidence.evidence_url}</p>
              )}
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
);

/**
 * Desktop modal - manages its own evidence drill-down with back navigation.
 */
const QuestDetailModal = ({ group, onClose, formatDate }) => {
  const [activeEvidence, setActiveEvidence] = useState(null);
  const primaryPillar = group.pillars[0];
  const gradientClass = getPillarGradient(primaryPillar);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (activeEvidence) {
          setActiveEvidence(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, activeEvidence]);

  const formatDateLong = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={() => { if (activeEvidence) setActiveEvidence(null); else onClose(); }}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="relative h-44 flex-shrink-0 overflow-hidden">
          {group.imageUrl ? (
            <img src={group.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradientClass}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Top bar: back or close */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            {activeEvidence ? (
              <button
                onClick={() => setActiveEvidence(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-black/30 hover:bg-black/50 rounded-full text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                All Tasks
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="p-2 bg-black/30 hover:bg-black/50 rounded-full text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quest title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            {activeEvidence ? (
              <>
                <p className="text-white/70 text-xs font-medium mb-1">{group.title}</p>
                <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {activeEvidence.taskTitle}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-white text-xs font-medium bg-gradient-to-r ${getPillarGradient(activeEvidence.pillar)}`}>
                    {getPillarDisplayName(activeEvidence.pillar)}
                  </span>
                  <span className="text-white/80 text-xs">+{activeEvidence.xpAwarded} XP</span>
                  <span className="text-white/60 text-xs">{formatDateLong(activeEvidence.completedAt)}</span>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {group.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {group.pillars.map(pillar => (
                    <span
                      key={pillar}
                      className={`inline-block px-2.5 py-0.5 rounded-full text-white text-xs font-medium bg-gradient-to-r ${getPillarGradient(pillar)}`}
                    >
                      {getPillarDisplayName(pillar)}
                    </span>
                  ))}
                  <span className="text-white/80 text-xs">
                    {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                  <span className="text-white font-semibold text-sm ml-auto">
                    +{group.totalXp} XP
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="overflow-y-auto flex-1">
          {activeEvidence ? (
            <div className="p-6">
              <UnifiedEvidenceDisplay
                evidence={activeEvidence.evidence}
                displayMode="full"
              />
            </div>
          ) : (
            <TaskList
              tasks={group.tasks}
              onEvidenceClick={(item) => setActiveEvidence(item)}
              formatDate={formatDate}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Mobile evidence detail - full-screen modal with back to quest.
 */
const EvidenceDetailView = ({ item, questTitle, onBack }) => {
  const gradientClass = getPillarGradient(item.pillar);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onBack(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onBack]);

  const formatDateLong = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={onBack}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 bg-gradient-to-r ${gradientClass}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white/70 text-xs font-medium truncate">{questTitle}</p>
              <h3 className="text-white font-semibold text-sm truncate">{item.taskTitle}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 ml-10">
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-white text-xs font-medium">
              {getPillarDisplayName(item.pillar)}
            </span>
            <span className="text-white/80 text-xs">+{item.xpAwarded} XP</span>
            <span className="text-white/60 text-xs">{formatDateLong(item.completedAt)}</span>
          </div>
        </div>

        {/* Evidence content */}
        <div className="overflow-y-auto flex-1 p-4">
          <UnifiedEvidenceDisplay
            evidence={item.evidence}
            displayMode="full"
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Individual evidence block card.
 */
const EvidenceCard = ({ item, onClick }) => {
  const block = item.block;
  if (!block) return null;

  return (
    <div
      className="cursor-pointer rounded-lg border border-gray-200 overflow-hidden hover:border-optio-purple hover:shadow-sm transition-all"
      onClick={onClick}
    >
      {block.block_type === 'image' && (() => {
        const imageUrl = block.content.items?.[0]?.url || block.content.url;
        const altText = block.content.items?.[0]?.alt || block.content.alt_text || 'Evidence';
        if (!imageUrl) return <div className="p-3 text-gray-400 text-sm">No image</div>;
        return <img src={imageUrl} alt={altText} className="w-full h-32 object-cover" loading="lazy" />;
      })()}

      {block.block_type === 'video' && (() => {
        const videoUrl = block.content.items?.[0]?.url || block.content.url;
        const videoTitle = block.content.items?.[0]?.title || block.content.title;
        const thumbnailUrl = getVideoThumbnail(videoUrl);
        return (
          <div className="relative h-32">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={videoTitle || 'Video'} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow">
                <svg className="w-5 h-5 text-optio-purple ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            </div>
            {videoTitle && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-white text-xs truncate">{videoTitle}</p>
              </div>
            )}
          </div>
        );
      })()}

      {block.block_type === 'text' && (
        <div className="p-3">
          <p className="text-sm text-gray-700 line-clamp-3">{block.content.text}</p>
        </div>
      )}

      {block.block_type === 'link' && (() => {
        const linkItem = block.content.items?.[0] || { url: block.content.url, title: block.content.title };
        if (!linkItem.url) return <div className="p-3 text-gray-400 text-sm">No link</div>;
        let domain;
        try { domain = new URL(linkItem.url).hostname.replace('www.', ''); } catch { domain = linkItem.url; }
        return (
          <div className="p-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-optio-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{linkItem.title || domain}</p>
              <p className="text-xs text-gray-500 truncate">{domain}</p>
            </div>
          </div>
        );
      })()}

      {block.block_type === 'document' && (() => {
        const docItem = block.content.items?.[0] || { filename: block.content.filename, title: block.content.title };
        return (
          <div className="p-3 flex items-center gap-2">
            <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{docItem.title || docItem.filename || 'Document'}</p>
              <p className="text-xs text-gray-500">Click to view</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

function getVideoThumbnail(url) {
  if (!url) return null;
  let match;
  match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
  if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  match = url.match(/vimeo\.com\/(\d+)/);
  if (match) return `https://vumbnail.com/${match[1]}.jpg`;
  return null;
}

QuestAccordionGallery.propTypes = {
  achievements: PropTypes.arrayOf(PropTypes.shape({
    quest: PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      image_url: PropTypes.string,
      header_image_url: PropTypes.string,
    }).isRequired,
    task_evidence: PropTypes.object,
    status: PropTypes.string,
  })).isRequired,
  onEvidenceClick: PropTypes.func,
  isOwner: PropTypes.bool,
  transferCreditsCard: PropTypes.node,
};

EvidenceCard.propTypes = {
  item: PropTypes.object.isRequired,
  onClick: PropTypes.func,
};

export default QuestAccordionGallery;
