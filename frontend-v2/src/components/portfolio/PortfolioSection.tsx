/**
 * PortfolioSection - Displays completed quests with expandable task/evidence details.
 * Evidence renders inline (images, videos, documents) matching the activity feed style.
 */

import React, { useState, useMemo } from 'react';
import { View, Pressable, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Card } from '@/src/components/ui';
import { PillarBadge } from '@/src/components/ui/pillar-badge';
import { getPillar } from '@/src/config/pillars';
import { VideoPlayer } from '@/src/components/feed/VideoPlayer';
import { DocumentViewer } from '@/src/components/feed/DocumentViewer';
import { MediaModal } from '@/src/components/feed/MediaModal';
import { displayImageUrl, isHeicUrl } from '@/src/services/imageUrl';
import type { Achievement } from '@/src/hooks/useProfile';

interface PortfolioSectionProps {
  achievements: Achievement[];
}

interface QuestGroup {
  questId: string;
  title: string;
  imageUrl: string | null;
  status: 'completed' | 'in_progress';
  tasks: TaskItem[];
  totalXp: number;
  pillars: string[];
  courseTitle?: string | null;
}

interface TaskItem {
  title: string;
  pillar: string;
  xpAwarded: number;
  completedAt: string;
  evidenceType: string;
  evidenceBlocks: any[];
  evidenceText?: string;
  evidenceUrl?: string;
  isCollaborative: boolean;
}

function buildQuestGroups(achievements: Achievement[]): QuestGroup[] {
  return achievements
    .map((achievement) => {
      const quest = achievement.quest;
      if (!quest) return null;

      const tasks: TaskItem[] = [];
      let totalXp = 0;
      const pillarSet = new Set<string>();

      Object.entries(achievement.task_evidence || {}).forEach(([taskTitle, taskEvidence]) => {
        const xp = taskEvidence.xp_awarded || 0;
        totalXp += xp;
        if (taskEvidence.pillar) pillarSet.add(taskEvidence.pillar);

        const evidenceBlocks = (taskEvidence.evidence_blocks || []).filter((b: any) => {
          if (!b || !b.content) return false;
          const c = b.content;
          if (b.block_type === 'image') return !!(c.url || c.items?.[0]?.url);
          if (b.block_type === 'video') return !!(c.url || c.items?.[0]?.url);
          if (b.block_type === 'text') return !!(c.text && c.text.trim());
          if (b.block_type === 'link') return !!(c.url || c.items?.[0]?.url);
          if (b.block_type === 'document') return !!(c.filename || c.items?.[0]?.filename || c.url || c.items?.[0]?.url);
          return true;
        });

        tasks.push({
          title: taskTitle,
          pillar: taskEvidence.pillar,
          xpAwarded: xp,
          completedAt: taskEvidence.completed_at,
          evidenceType: taskEvidence.evidence_type,
          evidenceBlocks,
          evidenceText: taskEvidence.evidence_content || taskEvidence.evidence_text,
          evidenceUrl: taskEvidence.evidence_url,
          isCollaborative: taskEvidence.is_collaborative || false,
        });
      });

      tasks.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

      return {
        questId: quest.id,
        title: quest.title,
        imageUrl: quest.image_url || quest.header_image_url || null,
        status: achievement.status,
        tasks,
        totalXp,
        pillars: Array.from(pillarSet),
        courseTitle: achievement.course?.course_title || null,
      };
    })
    .filter((g): g is QuestGroup => g !== null && g.tasks.length > 0)
    .sort((a, b) => {
      const aDate = a.tasks[0]?.completedAt || '';
      const bDate = b.tasks[0]?.completedAt || '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Expandable text block, matching feed style */
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;

  return (
    <Pressable onPress={() => isLong && setExpanded(!expanded)}>
      <View className="bg-surface-50 p-3 rounded-lg">
        <UIText
          size="sm"
          className="text-typo-500 italic"
          numberOfLines={expanded ? undefined : 4}
        >
          {text}
        </UIText>
        {isLong && (
          <UIText size="xs" className="text-optio-purple font-poppins-medium mt-1">
            {expanded ? 'Show less' : 'Read more'}
          </UIText>
        )}
      </View>
    </Pressable>
  );
}

/** Inline evidence display for a single task -- images, videos, docs rendered directly */
function InlineEvidence({ task }: { task: TaskItem }) {
  const [modal, setModal] = useState<{ type: 'image' | 'video' | 'document'; uri: string; title?: string } | null>(null);

  const blocks = task.evidenceBlocks;

  // Rescue HEIC files misclassified as documents or links -- treat them as images
  const getBlockUrl = (b: any) => b.content?.items?.[0]?.url || b.content?.url;
  const heicBlocks = blocks.filter((b: any) =>
    (b.block_type === 'document' || b.block_type === 'link') && isHeicUrl(getBlockUrl(b))
  );

  // Extract image URLs (real image blocks + rescued HEIC blocks)
  const allImageBlocks = [
    ...blocks.filter((b: any) => b.block_type === 'image'),
    ...heicBlocks,
  ];
  const rawImageUrl = allImageBlocks.length > 0 ? getBlockUrl(allImageBlocks[0]) : null;
  const imageUrl = displayImageUrl(rawImageUrl);

  const videoBlock = blocks.find((b: any) => b.block_type === 'video');
  const videoUrl = videoBlock ? getBlockUrl(videoBlock) : null;

  const textBlocks = blocks.filter((b: any) => b.block_type === 'text');
  // Filter HEIC files out of link and document blocks -- they render as images above
  const linkBlocks = blocks.filter((b: any) => b.block_type === 'link' && !isHeicUrl(getBlockUrl(b)));
  const documentBlocks = blocks.filter((b: any) => b.block_type === 'document' && !isHeicUrl(getBlockUrl(b)));

  // Additional images beyond the first
  const additionalImages = allImageBlocks
    .slice(1)
    .map((b: any) => displayImageUrl(getBlockUrl(b)))
    .filter(Boolean) as string[];

  const hasBlocks = blocks.length > 0;

  return (
    <VStack space="sm">
      {/* Primary image - full width, tappable for modal */}
      {imageUrl && (
        <Pressable onPress={() => setModal({ type: 'image', uri: imageUrl })}>
          <Image
            source={{ uri: imageUrl }}
            className="w-full rounded-lg"
            style={{ aspectRatio: 3 / 4, minHeight: 300 }}
            resizeMode="cover"
          />
        </Pressable>
      )}

      {/* Additional images */}
      {additionalImages.map((url: string, i: number) => (
        <Pressable key={`img-${i}`} onPress={() => setModal({ type: 'image', uri: url })}>
          <Image
            source={{ uri: url }}
            className="w-full rounded-lg"
            style={{ aspectRatio: 3 / 4, minHeight: 300 }}
            resizeMode="cover"
          />
        </Pressable>
      ))}

      {/* Video - inline player */}
      {videoUrl && !imageUrl && (
        <VideoPlayer uri={videoUrl} />
      )}

      {/* Text blocks - expandable */}
      {textBlocks.map((block: any, i: number) => {
        const text = block.content.text;
        if (!text || (imageUrl && i === 0 && textBlocks.length === 1)) {
          // Skip if there's an image and only one short text block (caption-like)
        }
        return text ? <ExpandableText key={`text-${i}`} text={text} /> : null;
      })}

      {/* Links */}
      {linkBlocks.map((block: any, i: number) => {
        const url = block.content.items?.[0]?.url || block.content.url;
        const title = block.content.items?.[0]?.title || block.content.title;
        if (!url) return null;
        return (
          <Pressable key={`link-${i}`} onPress={() => Linking.openURL(url)}>
            <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
              <HStack className="items-center gap-2">
                <Ionicons name="link-outline" size={16} color="#6D469B" />
                <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
                  {title || url}
                </UIText>
              </HStack>
            </View>
          </Pressable>
        );
      })}

      {/* Documents - rendered with DocumentViewer (shows PDF pages inline) */}
      {documentBlocks.map((block: any, i: number) => {
        const docItem = block.content.items?.[0] || block.content;
        const docUrl = docItem.url || block.content.url;
        if (!docUrl) return null;
        return (
          <Pressable key={`doc-${i}`} onPress={() => setModal({ type: 'document', uri: docUrl, title: docItem.title || docItem.filename })}>
            <DocumentViewer uri={docUrl} title={docItem.title || docItem.filename || undefined} />
          </Pressable>
        );
      })}

      {/* Legacy evidence (no blocks) */}
      {!hasBlocks && task.evidenceText && (
        <ExpandableText text={task.evidenceText} />
      )}
      {!hasBlocks && task.evidenceUrl && isHeicUrl(task.evidenceUrl) && !imageUrl && (
        <Pressable onPress={() => setModal({ type: 'image', uri: displayImageUrl(task.evidenceUrl)! })}>
          <Image
            source={{ uri: displayImageUrl(task.evidenceUrl)! }}
            className="w-full rounded-lg"
            style={{ aspectRatio: 3 / 4, minHeight: 300 }}
            resizeMode="cover"
          />
        </Pressable>
      )}
      {!hasBlocks && task.evidenceUrl && !isHeicUrl(task.evidenceUrl) && (
        <Pressable onPress={() => Linking.openURL(task.evidenceUrl!)}>
          <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
            <HStack className="items-center gap-2">
              <Ionicons name="link-outline" size={16} color="#6D469B" />
              <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
                {task.evidenceUrl}
              </UIText>
            </HStack>
          </View>
        </Pressable>
      )}

      {/* Full-screen media modal */}
      {modal && (
        <MediaModal
          visible={!!modal}
          onClose={() => setModal(null)}
          type={modal.type}
          uri={modal.uri}
          title={modal.title}
        />
      )}
    </VStack>
  );
}

/** Expanded task list for a quest */
function TaskList({ tasks }: { tasks: TaskItem[] }) {
  return (
    <VStack className="border-t border-surface-200">
      {tasks.map((task, idx) => (
        <VStack
          key={task.title}
          className={idx > 0 ? 'border-t border-surface-100' : ''}
        >
          {/* Task header */}
          <View className="px-4 py-3 bg-surface-50">
            <HStack className="items-center gap-2">
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <UIText size="sm" className="font-poppins-medium text-typo-700 flex-1" numberOfLines={1}>
                {task.title}
              </UIText>
              {task.isCollaborative && (
                <View className="bg-blue-100 px-1.5 py-0.5 rounded">
                  <UIText size="xs" className="text-blue-700">Collab</UIText>
                </View>
              )}
            </HStack>
            <HStack className="items-center gap-2 mt-1 ml-6">
              <PillarBadge pillar={task.pillar} size="sm" />
              <UIText size="xs" className="text-typo-400">+{task.xpAwarded} XP</UIText>
              <UIText size="xs" className="text-typo-400">{formatDate(task.completedAt)}</UIText>
            </HStack>
          </View>
          {/* Task evidence - rendered inline */}
          <View className="px-4 py-3">
            <InlineEvidence task={task} />
          </View>
        </VStack>
      ))}
    </VStack>
  );
}

/** Single quest card with expand/collapse */
function QuestCard({ group }: { group: QuestGroup }) {
  const [expanded, setExpanded] = useState(false);
  const primaryPillar = group.pillars[0] || 'stem';
  const pillarConfig = getPillar(primaryPillar);

  return (
    <Card variant="outline" size="sm" className="overflow-hidden">
      <Pressable onPress={() => setExpanded(!expanded)}>
        {/* Hero image */}
        <View style={{ height: 128, overflow: 'hidden' }}>
          {group.imageUrl ? (
            <Image
              source={{ uri: group.imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: pillarConfig.color + '30',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={pillarConfig.icon} size={48} color={pillarConfig.color + '60'} />
              </View>
            </View>
          )}
          {/* XP badge overlay */}
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <UIText size="xs" className="font-poppins-semibold text-optio-purple">
              +{group.totalXp} XP
            </UIText>
          </View>
          {/* In-progress badge */}
          {group.status === 'in_progress' && (
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: 'rgba(245, 158, 11, 0.9)',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <UIText size="xs" className="font-poppins-medium" style={{ color: '#FFFFFF' }}>
                In Progress
              </UIText>
            </View>
          )}
          {/* Chevron indicator */}
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
            }}
          >
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={group.imageUrl ? '#FFFFFF' : pillarConfig.color}
            />
          </View>
        </View>

        {/* Quest info */}
        <View className="p-3">
          <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
            {group.title}
          </UIText>
          {group.courseTitle && (
            <HStack className="items-center gap-1 mt-0.5">
              <Ionicons name="school-outline" size={11} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple">{group.courseTitle}</UIText>
            </HStack>
          )}
          <HStack className="items-center gap-2 mt-1.5 flex-wrap">
            {group.pillars.map((pillar) => (
              <PillarBadge key={pillar} pillar={pillar} size="sm" />
            ))}
            <UIText size="xs" className="text-typo-400">
              {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
            </UIText>
          </HStack>
        </View>
      </Pressable>

      {/* Expanded task list */}
      {expanded && <TaskList tasks={group.tasks} />}
    </Card>
  );
}

export function PortfolioSection({ achievements }: PortfolioSectionProps) {
  const questGroups = useMemo(() => buildQuestGroups(achievements), [achievements]);

  if (questGroups.length === 0) {
    return (
      <Card variant="elevated" size="md">
        <VStack className="items-center py-6" space="sm">
          <Ionicons name="images-outline" size={40} color="#D1D5DB" />
          <UIText size="sm" className="text-typo-400 text-center">
            Complete quests to build your portfolio
          </UIText>
        </VStack>
      </Card>
    );
  }

  return (
    <VStack space="md">
      {questGroups.map((group) => (
        <QuestCard key={group.questId} group={group} />
      ))}
    </VStack>
  );
}
