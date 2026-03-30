/**
 * Quest Detail - Notion-style document layout.
 *
 * Hero image → description → metadata → task list (expandable inline).
 * Inline task creation with optional AI generation.
 * Web only.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Image, Pressable, TextInput, ActivityIndicator } from 'react-native';
import api from '@/src/services/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuestDetail, PILLARS, DIPLOMA_SUBJECTS } from '@/src/hooks/useQuestDetail';
import { useQuestEngagement } from '@/src/hooks/useDashboard';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { MiniHeatmap } from '@/src/components/engagement/MiniHeatmap';
import { TaskCreationWizard } from '@/src/components/tasks/TaskCreationWizard';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton, Input, InputField,
} from '@/src/components/ui';

const pillarColors: Record<string, { bg: string; text: string; bar: string }> = {
  stem: { bg: 'bg-pillar-stem/15', text: 'text-pillar-stem', bar: 'bg-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', text: 'text-pillar-art', bar: 'bg-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', text: 'text-pillar-communication', bar: 'bg-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', text: 'text-pillar-civics', bar: 'bg-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', text: 'text-pillar-wellness', bar: 'bg-pillar-wellness' },
};

// ── Task Item (expandable) ──

const blockTypeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'document-text-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  link: 'link-outline',
  document: 'attach-outline',
};

/** Normalize a block for POST (backend expects `type`, DB returns `block_type`) */
function normalizeBlockForSave(block: any) {
  const { block_type, ...rest } = block;
  return { ...rest, type: block.type || block_type };
}

function EvidenceBlockDisplay({ block }: { block: any }) {
  const blockType = block.block_type || block.type;
  const content = block.content || {};

  if (blockType === 'image' && content.url) {
    return (
      <View className="rounded-lg overflow-hidden">
        <Image source={{ uri: content.url }} className="w-full h-40" resizeMode="cover" />
        {content.caption && <UIText size="xs" className="text-typo-400 mt-1">{content.caption}</UIText>}
      </View>
    );
  }

  if (blockType === 'video' && content.url) {
    return (
      <HStack className="items-center gap-2 p-3 bg-surface-100 rounded-lg">
        <Ionicons name="videocam" size={20} color="#6D469B" />
        <VStack className="flex-1">
          <UIText size="xs" className="font-poppins-medium">Video</UIText>
          <UIText size="xs" className="text-typo-400" numberOfLines={1}>{content.url}</UIText>
        </VStack>
      </HStack>
    );
  }

  if (blockType === 'link' && (content.url || content.value)) {
    return (
      <HStack className="items-center gap-2 p-3 bg-surface-100 rounded-lg">
        <Ionicons name="link" size={18} color="#2469D1" />
        <VStack className="flex-1">
          {content.title && <UIText size="xs" className="font-poppins-medium">{content.title}</UIText>}
          <UIText size="xs" className="text-pillar-stem" numberOfLines={1}>{content.url || content.value}</UIText>
        </VStack>
      </HStack>
    );
  }

  if (blockType === 'text') {
    return (
      <View className="p-3 bg-surface-50 rounded-lg">
        <UIText size="xs" className="text-typo-500">{content.text || content.value || ''}</UIText>
      </View>
    );
  }

  if (blockType === 'document' && content.url) {
    return (
      <HStack className="items-center gap-2 p-3 bg-surface-100 rounded-lg">
        <Ionicons name="document-attach" size={18} color="#6B7280" />
        <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={1}>
          {content.filename || content.title || 'Document'}
        </UIText>
      </HStack>
    );
  }

  return null;
}

function TaskItem({
  task,
  onComplete,
  onDelete,
}: {
  task: any;
  onComplete: (taskId: string) => void;  // just update local state, no API call
  onDelete: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [evidenceBlocks, setEvidenceBlocks] = useState<any[]>([]);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [textEvidence, setTextEvidence] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const colors = pillarColors[task.pillar] || pillarColors.stem;

  // Fetch evidence on mount (for count indicator) and when expanded (for full display)
  useEffect(() => {
    if (!evidenceLoaded) {
      (async () => {
        try {
          const { data } = await api.get(`/api/evidence/documents/${task.id}`);
          setEvidenceBlocks(data.blocks || []);
        } catch {
          // No evidence yet
        } finally {
          setEvidenceLoaded(true);
        }
      })();
    }
  }, [task.id]);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Save any pending text evidence + complete
      const blocks = [...evidenceBlocks];
      if (textEvidence.trim()) {
        blocks.push({ type: 'text', content: { text: textEvidence.trim() }, order_index: blocks.length });
      }
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: blocks.map(normalizeBlockForSave),
        status: 'completed',
      });
      onComplete(task.id);
      setTextEvidence('');
      setShowTextInput(false);
    } catch {
      // Error
    } finally {
      setCompleting(false);
    }
  };

  const handleFileUpload = async () => {
    // Web: use file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,.pdf,.doc,.docx';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const maxSize = isVideo ? 50 * 1024 * 1024 : isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
      if (file.size > maxSize) {
        const maxMB = maxSize / (1024 * 1024);
        const fileMB = (file.size / (1024 * 1024)).toFixed(1);
        const fileType = isVideo ? 'videos' : isImage ? 'images' : 'documents';
        alert(`File too large (${fileMB}MB). Maximum for ${fileType} is ${maxMB}MB.`);
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await api.post(`/api/evidence/documents/${task.id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        // Determine block type from file
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const blockType = isImage ? 'image' : isVideo ? 'video' : 'document';

        const newBlock = {
          type: blockType,
          content: {
            url: data.url,
            filename: data.filename || file.name,
            title: file.name,
          },
          order_index: evidenceBlocks.length,
        };

        // Save the block
        const updatedBlocks = [...evidenceBlocks, newBlock];
        await api.post(`/api/evidence/documents/${task.id}`, {
          blocks: updatedBlocks.map(normalizeBlockForSave),
          status: 'draft',
        });
        setEvidenceBlocks(updatedBlocks);
      } catch {
        // Upload error
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleAddText = async () => {
    if (!textEvidence.trim()) return;
    const newBlock = {
      type: 'text',
      content: { text: textEvidence.trim() },
      order_index: evidenceBlocks.length,
    };
    const updatedBlocks = [...evidenceBlocks, newBlock];
    try {
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: updatedBlocks.map(normalizeBlockForSave),
        status: 'draft',
      });
      setEvidenceBlocks(updatedBlocks);
      setTextEvidence('');
      setShowTextInput(false);
    } catch {
      // Error
    }
  };

  const handleAddLink = async () => {
    const url = prompt('Enter a URL:');
    if (!url) return;
    const newBlock = {
      type: 'link',
      content: { url, title: url },
      order_index: evidenceBlocks.length,
    };
    const updatedBlocks = [...evidenceBlocks, newBlock];
    try {
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: updatedBlocks.map(normalizeBlockForSave),
        status: 'draft',
      });
      setEvidenceBlocks(updatedBlocks);
    } catch {
      // Error
    }
  };

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <Card variant={expanded ? 'elevated' : 'outline'} size="sm" className={`border-l-4 ${colors.bar}`}>
        <VStack space="sm">
          {/* Header row */}
          <HStack className="items-center gap-3">
            <Pressable
              onPress={(e) => { e.stopPropagation(); if (!task.is_completed) handleComplete(); }}
              className="flex-shrink-0"
            >
              <Ionicons
                name={task.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={task.is_completed ? '#16A34A' : '#D1D5DB'}
              />
            </Pressable>
            <VStack className="flex-1 min-w-0">
              <UIText
                size="sm"
                className={`font-poppins-medium ${task.is_completed ? 'text-typo-400 line-through' : ''}`}
              >
                {task.title}
              </UIText>
              <HStack className="items-center gap-2">
                <View className={`px-1.5 py-0.5 rounded ${colors.bg}`}>
                  <UIText size="xs" className={colors.text}>
                    {task.pillar === 'stem' ? 'STEM' : task.pillar?.charAt(0).toUpperCase() + task.pillar?.slice(1)}
                  </UIText>
                </View>
                <UIText size="xs" className="text-typo-400">{task.xp_value || task.xp_amount || 0} XP</UIText>
                {evidenceBlocks.length > 0 && (
                  <HStack className="items-center gap-1">
                    <Ionicons name="attach" size={12} color="#9CA3AF" />
                    <UIText size="xs" className="text-typo-400">{evidenceBlocks.length}</UIText>
                  </HStack>
                )}
              </HStack>
            </VStack>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#9CA3AF"
            />
          </HStack>

          {/* Expanded detail */}
          {expanded && (
            <VStack space="sm" className="ml-9">
              {task.description && (
                <UIText size="xs" className="text-typo-500">{task.description}</UIText>
              )}
              {task.diploma_subjects?.length > 0 && (
                <HStack className="items-center gap-1 flex-wrap">
                  <UIText size="xs" className="text-typo-400">Subjects:</UIText>
                  {task.diploma_subjects.map((s: string) => (
                    <Badge key={s} action="muted">
                      <BadgeText className="text-typo-500">{s}</BadgeText>
                    </Badge>
                  ))}
                </HStack>
              )}

              {/* Evidence display */}
              {evidenceBlocks.length > 0 && (
                <VStack space="sm">
                  <UIText size="xs" className="text-typo-400 font-poppins-medium">Evidence</UIText>
                  {evidenceBlocks.map((block, idx) => (
                    <EvidenceBlockDisplay key={block.id || idx} block={block} />
                  ))}
                </VStack>
              )}

              {/* Evidence upload (not completed) */}
              {!task.is_completed && (
                <VStack space="sm">
                  <UIText size="xs" className="text-typo-400 font-poppins-medium">Add Evidence</UIText>
                  <HStack className="gap-2 flex-wrap">
                    <Pressable
                      onPress={handleFileUpload}
                      className="flex-row items-center gap-1.5 px-3 py-2 bg-surface-100 rounded-lg active:bg-surface-200"
                    >
                      <Ionicons name="image-outline" size={16} color="#6B7280" />
                      <UIText size="xs" className="text-typo-500">
                        {uploading ? 'Uploading...' : 'Photo/File'}
                      </UIText>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowTextInput(!showTextInput)}
                      className="flex-row items-center gap-1.5 px-3 py-2 bg-surface-100 rounded-lg active:bg-surface-200"
                    >
                      <Ionicons name="document-text-outline" size={16} color="#6B7280" />
                      <UIText size="xs" className="text-typo-500">Text</UIText>
                    </Pressable>
                    <Pressable
                      onPress={handleAddLink}
                      className="flex-row items-center gap-1.5 px-3 py-2 bg-surface-100 rounded-lg active:bg-surface-200"
                    >
                      <Ionicons name="link-outline" size={16} color="#6B7280" />
                      <UIText size="xs" className="text-typo-500">Link</UIText>
                    </Pressable>
                  </HStack>

                  {showTextInput && (
                    <VStack space="xs">
                      <TextInput
                        className="border border-surface-200 rounded-lg p-3 text-sm min-h-[80px] font-poppins"
                        placeholder="Describe what you did, what you learned..."
                        value={textEvidence}
                        onChangeText={setTextEvidence}
                        multiline
                        textAlignVertical="top"
                        placeholderTextColor="#9CA3AF"
                      />
                      <HStack className="gap-2">
                        <Button size="xs" onPress={handleAddText} disabled={!textEvidence.trim()}>
                          <ButtonText>Save Text</ButtonText>
                        </Button>
                        <Button size="xs" variant="link" onPress={() => { setShowTextInput(false); setTextEvidence(''); }}>
                          <ButtonText className="text-typo-400">Cancel</ButtonText>
                        </Button>
                      </HStack>
                    </VStack>
                  )}
                </VStack>
              )}

              {/* Completed status */}
              {task.is_completed && task.completed_at && (
                <UIText size="xs" className="text-green-600">
                  Completed {new Date(task.completed_at).toLocaleDateString()}
                </UIText>
              )}

              {/* Action buttons */}
              {!task.is_completed && (
                <HStack className="gap-2">
                  <Button size="xs" onPress={handleComplete} loading={completing}>
                    <ButtonText>Complete Task</ButtonText>
                  </Button>
                  {!task.is_required && (
                    <Button size="xs" variant="outline" action="negative" onPress={() => onDelete(task.id)}>
                      <ButtonText>Remove</ButtonText>
                    </Button>
                  )}
                </HStack>
              )}
            </VStack>
          )}
        </VStack>
      </Card>
    </Pressable>
  );
}

// ── Main Quest Detail Page ──

export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    quest, loading, error,
    refetch, enroll, completeTask, generateTasks, acceptTask, deleteTask,
  } = useQuestDetail(id || null);
  const isEnrolled = !!quest?.user_enrollment;
  const { data: engagement } = useQuestEngagement(isEnrolled ? quest?.id || null : null);
  const [enrolling, setEnrolling] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [restartModalVisible, setRestartModalVisible] = useState(false);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enroll();
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.response?.data?.requires_confirmation) {
        setRestartModalVisible(true);
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleRestartFresh = async () => {
    setRestartModalVisible(false);
    setEnrolling(true);
    try {
      await api.post(`/api/quests/${id}/enroll`, { force_new: true });
      await refetch();
    } catch {
      // Error
    } finally {
      setEnrolling(false);
    }
  };

  const handleLoadPrevious = async () => {
    setRestartModalVisible(false);
    setEnrolling(true);
    try {
      await api.post(`/api/quests/${id}/enroll`, { load_previous_tasks: true, force_new: true });
      await refetch();
    } catch {
      // Error
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <VStack className="px-5 md:px-8 pt-6" space="lg">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-8 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="h-32 rounded-xl" />
        </VStack>
      </SafeAreaView>
    );
  }

  if (error || !quest) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
        <Heading size="md" className="text-typo-500 mt-4">Quest not found</Heading>
        <UIText size="sm" className="text-typo-400 mt-2 text-center">{error || 'This quest may have been removed.'}</UIText>
        <Button className="mt-6" onPress={() => router.back()}>
          <ButtonText>Go Back</ButtonText>
        </Button>
      </SafeAreaView>
    );
  }

  const tasks = quest.quest_tasks || [];
  const completedCount = tasks.filter((t) => t.is_completed).length;
  const totalXP = tasks.reduce((sum, t) => sum + (t.xp_value || t.xp_amount || 0), 0);
  const earnedXP = tasks.filter((t) => t.is_completed).reduce((sum, t) => sum + (t.xp_value || t.xp_amount || 0), 0);
  const allComplete = tasks.length > 0 && completedCount === tasks.length;
  const imageUrl = quest.header_image_url || quest.image_url;
  const calendarDays = engagement?.calendar?.days || [];

  // XP by pillar
  const pillarXP = tasks.reduce((acc, t) => {
    if (t.is_completed && t.pillar) {
      acc[t.pillar] = (acc[t.pillar] || 0) + (t.xp_value || t.xp_amount || 0);
    }
    return acc;
  }, {} as Record<string, number>);

  const handleLeaveQuest = async () => {
    try {
      await api.delete(`/api/quests/${quest.id}/enrollment`);
      router.back();
    } catch {
      // Fallback: try the older endpoint
      try {
        await api.post(`/api/quests/${quest.id}/end`, {});
        router.back();
      } catch {
        // Error
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>

        {/* Full-bleed hero image */}
        {imageUrl ? (
          <View className="h-72 md:h-96 w-full">
            <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="cover" />
            <Pressable
              onPress={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="white" />
            </Pressable>
          </View>
        ) : (
          <View className="h-48 w-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="rocket-outline" size={60} color="#6D469B" />
            <Pressable
              onPress={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-surface-200 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </Pressable>
          </View>
        )}

        {/* Constrained content below image */}
        <VStack className="max-w-4xl w-full md:mx-auto">
          <VStack className="px-5 md:px-8 pt-6 pb-12" space="lg">

            {/* Title + engagement */}
            <VStack testID="quest-detail-header" space="sm">
              <Heading testID="quest-title" size="2xl">{quest.title}</Heading>
              {isEnrolled && engagement?.rhythm && (
                <HStack className="items-center gap-3">
                  <RhythmBadge rhythm={engagement.rhythm} compact />
                  {calendarDays.length > 0 && <MiniHeatmap days={calendarDays} />}
                </HStack>
              )}
            </VStack>

            {/* Description */}
            <UIText testID="quest-description" className="text-typo-500 leading-6">
              {quest.description}
            </UIText>

            {/* Approach Examples */}
            {!isEnrolled && quest.approach_examples && (
              <Card variant="outline" size="md">
                <VStack space="sm">
                  <HStack className="items-center gap-2">
                    <Ionicons name="bulb-outline" size={18} color="#6D469B" />
                    <UIText size="sm" className="font-poppins-semibold">How others have approached this</UIText>
                  </HStack>
                  {(Array.isArray(quest.approach_examples) ? quest.approach_examples : [quest.approach_examples]).map((ex: any, idx: number) => (
                    <HStack key={idx} className="items-start gap-2 ml-1">
                      <UIText size="xs" className="text-optio-purple mt-0.5">•</UIText>
                      <UIText size="xs" className="text-typo-500 flex-1">
                        {typeof ex === 'string' ? ex : ex.text || ex.description || JSON.stringify(ex)}
                      </UIText>
                    </HStack>
                  ))}
                </VStack>
              </Card>
            )}

            {/* Enrollment CTA (not enrolled) */}
            {!isEnrolled && (
              <Card variant="elevated" size="lg" className="items-center">
                <VStack space="md" className="items-center w-full">
                  <Ionicons name="rocket" size={32} color="#6D469B" />
                  <Heading size="md">Ready to start?</Heading>
                  <UIText size="sm" className="text-typo-500 text-center">
                    Enroll in this quest to begin your personalized learning journey.
                  </UIText>
                  <Button size="lg" className="w-full" onPress={handleEnroll} loading={enrolling}>
                    <ButtonText>Start Quest</ButtonText>
                  </Button>
                </VStack>
              </Card>
            )}

            {/* Quest Progress (enrolled) */}
            {isEnrolled && tasks.length > 0 && (
              <Card variant="elevated" size="md">
                <VStack space="sm">
                  <HStack className="items-center justify-between">
                    <UIText size="sm" className="font-poppins-medium">Progress</UIText>
                    <UIText size="sm" className="font-poppins-bold text-optio-purple">
                      {completedCount}/{tasks.length} tasks
                    </UIText>
                  </HStack>
                  {/* Progress bar */}
                  <View className="h-2.5 bg-surface-200 rounded-full overflow-hidden">
                    <View
                      className="h-full bg-optio-purple rounded-full"
                      style={{ width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%` }}
                    />
                  </View>
                  <HStack className="items-center justify-between">
                    <HStack className="items-center gap-1">
                      <Ionicons name="star" size={14} color="#FF9028" />
                      <UIText size="xs" className="text-typo-500 font-poppins-medium">
                        {earnedXP} / {totalXP} XP
                      </UIText>
                    </HStack>
                    {/* Pillar breakdown */}
                    <HStack className="items-center gap-2 flex-wrap">
                      {Object.entries(pillarXP).map(([pillar, xp]) => (
                        <HStack key={pillar} className="items-center gap-1">
                          <View className={`w-2.5 h-2.5 rounded-full ${(pillarColors[pillar] || pillarColors.stem).bar}`} />
                          <UIText size="xs" className="text-typo-500 font-poppins-medium">
                            {pillar === 'stem' ? 'STEM' : pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                          </UIText>
                          <UIText size="xs" className="text-typo-400">{xp}</UIText>
                        </HStack>
                      ))}
                    </HStack>
                  </HStack>
                </VStack>
              </Card>
            )}

            {/* Completion Celebration */}
            {isEnrolled && allComplete && (
              <Card variant="elevated" size="lg" className="border-2 border-green-300 bg-green-50">
                <VStack space="sm" className="items-center">
                  <Ionicons name="trophy" size={40} color="#16A34A" />
                  <Heading size="md" className="text-green-800">Quest Complete!</Heading>
                  <UIText size="sm" className="text-green-700 text-center">
                    You earned {earnedXP} XP across {tasks.length} tasks. Great work!
                  </UIText>
                </VStack>
              </Card>
            )}

            {/* Task list (enrolled) */}
            {isEnrolled && (
              <VStack testID="quest-task-list" space="sm">
                <HStack className="items-center justify-between">
                  <Heading size="md">Tasks</Heading>
                  <Pressable
                    onPress={() => setAddTaskOpen(true)}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-optio-purple/10 active:bg-optio-purple/20"
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">Add Task</UIText>
                  </Pressable>
                </HStack>

                {tasks.length > 0 ? (
                  <VStack space="sm">
                    {[...tasks].sort((a, b) => {
                      // Incomplete first, then by reverse order (newest first)
                      if (a.is_completed !== b.is_completed) return Number(a.is_completed) - Number(b.is_completed);
                      return (b.order_index ?? Infinity) - (a.order_index ?? Infinity);
                    }).map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onComplete={(taskId) => {
                          // TaskItem.handleComplete already POSTed to the API.
                          // Just update local state here -- no second API call.
                          if (!quest) return;
                          refetch();
                        }}
                        onDelete={deleteTask}
                      />
                    ))}
                  </VStack>
                ) : (
                  <Card variant="filled" size="md" className="items-center py-6">
                    <UIText size="sm" className="text-typo-500">No tasks yet. Add your first task below.</UIText>
                  </Card>
                )}

                {/* Task creation wizard */}
                <TaskCreationWizard
                  questId={quest.id}
                  questTitle={quest.title}
                  open={addTaskOpen}
                  onClose={() => setAddTaskOpen(false)}
                  onGenerate={generateTasks}
                  onAcceptTask={acceptTask}
                />

                {/* Leave Quest */}
                <Divider className="mt-4" />
                <Pressable
                  onPress={() => {
                    if (typeof window !== 'undefined' && window.confirm('Leave this quest? Your completed tasks will be preserved.')) {
                      handleLeaveQuest();
                    }
                  }}
                  className="py-3 items-center"
                >
                  <UIText size="sm" className="text-red-400">Leave Quest</UIText>
                </Pressable>
              </VStack>
            )}

          </VStack>
        </VStack>
      </ScrollView>
      {/* Restart Quest Modal */}
      {restartModalVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 50 }}>
          <Card variant="elevated" size="lg" className="mx-6 max-w-md w-full">
            <VStack space="md" className="items-center">
              <Ionicons name="refresh-circle-outline" size={40} color="#6D469B" />
              <Heading size="md" className="text-center">Welcome Back!</Heading>
              <UIText size="sm" className="text-typo-500 text-center">
                You've worked on this quest before. Would you like to continue where you left off or start fresh?
              </UIText>
              <VStack space="sm" className="w-full">
                <Button size="lg" className="w-full" onPress={handleLoadPrevious}>
                  <ButtonText>Continue Previous Progress</ButtonText>
                </Button>
                <Button size="lg" variant="outline" className="w-full" onPress={handleRestartFresh}>
                  <ButtonText>Start Fresh</ButtonText>
                </Button>
                <Button size="sm" variant="link" className="w-full" onPress={() => setRestartModalVisible(false)}>
                  <ButtonText className="text-typo-400">Cancel</ButtonText>
                </Button>
              </VStack>
            </VStack>
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
}
