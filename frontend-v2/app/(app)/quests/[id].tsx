/**
 * Quest Detail - Hero image → description → progress → task list.
 *
 * Works on web and native. Tasks expand inline; the personalization wizard
 * (manual / AI / browse-suggestions) is the same on every platform.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Image, Pressable, Alert, Platform } from 'react-native';
import { safeOpenURL } from '@/src/utils/linking';
import api from '@/src/services/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuestDetail, PILLARS, DIPLOMA_SUBJECTS } from '@/src/hooks/useQuestDetail';
import { useQuestEngagement } from '@/src/hooks/useDashboard';
import { QuestEngagement } from '@/src/components/engagement/QuestEngagement';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { MiniHeatmap } from '@/src/components/engagement/MiniHeatmap';
import { TaskCreationWizard } from '@/src/components/tasks/TaskCreationWizard';
import { useCaptureContextStore } from '@/src/stores/captureContextStore';
import { TaskEvidenceSheet } from '@/src/components/capture/TaskEvidenceSheet';
import { AudioClipPreview } from '@/src/components/capture/VoiceRecorder';
import { DocumentViewer } from '@/src/components/feed/DocumentViewer';
import { ScrollToTopFab } from '@/src/components/ui/ScrollToTopFab';
import { ClassDetailHeader } from '@/src/components/class/ClassDetailHeader';
import { getSubject } from '@/src/components/class/SUBJECTS';
import { EditMomentModal } from '@/src/components/journal/EditMomentModal';
import { TaskEditModal } from '@/src/components/tasks/TaskEditModal';
import type { LearningEvent } from '@/src/hooks/useJournal';
import { useThemeColors } from '@/src/hooks/useThemeColors';
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
  const c = useThemeColors();

  // Learning-moment evidence (scans, photos) stores the URL/name in the
  // file_url/file_name COLUMNS with an empty content {}, while task evidence
  // stores them inside content. Resolve from both or moment scans render blank
  // in the quest task dropdown (bug #15/#16).
  const url = content.url || block.file_url || content.value || content.items?.[0]?.url;
  const filename = content.filename || content.title || block.file_name || 'Document';

  if (blockType === 'image' && url) {
    return (
      <View className="rounded-xl overflow-hidden bg-surface-100 dark:bg-dark-surface-200">
        <Image source={{ uri: url }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
        {content.caption && (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 px-2 py-1.5">{content.caption}</UIText>
        )}
      </View>
    );
  }

  if (blockType === 'video' && url) {
    return (
      <Pressable onPress={() => safeOpenURL(url)}>
        <View
          className="rounded-xl overflow-hidden items-center justify-center"
          style={{ height: 160, backgroundColor: '#1F1F2E' }}
        >
          <Ionicons name="play-circle" size={56} color="#FFFFFF" />
          <UIText size="xs" className="text-white font-poppins-medium mt-2">Tap to play video</UIText>
        </View>
      </Pressable>
    );
  }

  if (blockType === 'link' && url) {
    return (
      <Pressable
        onPress={() => safeOpenURL(url)}
        className="active:opacity-70"
      >
        <HStack className="items-center gap-2 p-3 bg-surface-100 dark:bg-dark-surface-200 rounded-lg">
          <Ionicons name="link" size={18} color="#2469D1" />
          <VStack className="flex-1 min-w-0">
            {content.title && content.title !== url && (
              <UIText size="xs" className="font-poppins-medium" numberOfLines={1}>{content.title}</UIText>
            )}
            <UIText size="xs" className="text-pillar-stem" numberOfLines={1}>{url}</UIText>
          </VStack>
          <Ionicons name="open-outline" size={14} color={c.iconMuted} />
        </HStack>
      </Pressable>
    );
  }

  if (blockType === 'text') {
    return (
      <View className="p-3 bg-surface-50 dark:bg-dark-surface-50 rounded-lg border border-surface-200 dark:border-dark-surface-300">
        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" style={{ lineHeight: 20 }}>
          {content.text || content.value || ''}
        </UIText>
      </View>
    );
  }

  if (blockType === 'document' && url) {
    // Scans/PDFs are the most common moment evidence; render an actual inline
    // page preview (DocumentViewer) instead of a bare "tap to open" chip so the
    // student sees the file here, not just the moment text (bug: "I should see
    // the actual files/image preview here").
    if (url.toLowerCase().includes('.pdf')) {
      return <DocumentViewer uri={url} title={filename} />;
    }
    return (
      <Pressable
        onPress={() => safeOpenURL(url)}
        className="active:opacity-70"
      >
        <HStack className="items-center gap-2 p-3 bg-surface-100 dark:bg-dark-surface-200 rounded-lg">
          <Ionicons name="document-attach" size={18} color={c.icon} />
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 flex-1" numberOfLines={1}>
            {filename}
          </UIText>
          <Ionicons name="open-outline" size={14} color={c.iconMuted} />
        </HStack>
      </Pressable>
    );
  }

  if (blockType === 'audio' && url) {
    // Use the same playback chip we use in capture previews — gives the student
    // a real Play/Pause + scrubber so they can confirm what was recorded.
    return (
      <AudioClipPreview
        clip={{
          uri: url,
          name: filename || 'voice-note',
          fileSize: 0,
          durationMs: content.duration_ms || 0,
        }}
      />
    );
  }

  return null;
}

function TaskItem({
  task,
  onComplete,
  onDelete,
  onEditMoment,
  onEditTask,
  classSubject,
}: {
  task: any;
  onComplete: (taskId: string) => void;  // just update local state, no API call
  onDelete: (taskId: string) => void;
  /** Open the moment editor for an is_moment task (bug #16). */
  onEditMoment?: (task: any) => void;
  /** Open the task editor (pillar + diploma subjects) for a regular task. */
  onEditTask?: (task: any) => void;
  /** When set, this task belongs to a class quest — render the transcript
   *  subject + attributed credit XP in place of the pillar badge. */
  classSubject?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [evidenceBlocks, setEvidenceBlocks] = useState<any[]>([]);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [evidenceSheetVisible, setEvidenceSheetVisible] = useState(false);
  const c = useThemeColors();
  const pillar = pillarColors[task.pillar] || pillarColors.stem;
  const subjectMeta = classSubject ? getSubject(classSubject) : null;
  const isClassTask = !!subjectMeta;
  // Subject XP attributed to this class's transcript subject (the diploma
  // credit this task pays). Falls back to the task's full xp_value if no
  // explicit distribution is on the task.
  const creditXp = isClassTask
    ? (task.subject_xp_distribution?.[classSubject!] ?? task.xp_value ?? task.xp_amount ?? 0)
    : null;

  const refetchEvidence = async () => {
    if (task.is_moment) return;
    try {
      const { data } = await api.get(`/api/evidence/documents/${task.id}`);
      setEvidenceBlocks(data.blocks || []);
    } catch {
      // No evidence yet
    }
  };

  // Fetch evidence on mount (for count indicator) and when expanded (for full display)
  // Moment-tasks carry their evidence inline from the backend — skip the API call
  useEffect(() => {
    if (task.is_moment) {
      setEvidenceBlocks(task.evidence_blocks || []);
      setEvidenceLoaded(true);
      return;
    }
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
  }, [task.id, task.is_moment]);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: evidenceBlocks.map(normalizeBlockForSave),
        status: 'completed',
      });
      onComplete(task.id);
    } catch {
      // Error
    } finally {
      setCompleting(false);
    }
  };

  // All evidence add flows live in TaskEvidenceSheet (photo/video/voice/text/link
  // in one bottom sheet). No more inline buttons.

  // Left border: pillar color for regular quest tasks, subject accent for class tasks.
  const borderStyle = isClassTask && subjectMeta
    ? { borderLeftColor: subjectMeta.accent, borderLeftWidth: 4 }
    : undefined;

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <Card
        variant={expanded ? 'elevated' : 'outline'}
        size="sm"
        className={isClassTask ? '' : `border-l-4 ${pillar.bar}`}
        style={borderStyle}
      >
        <VStack space="sm">
          {/* Header row */}
          <HStack className="items-center gap-3">
            {task.is_moment ? (
              <View className="flex-shrink-0 w-6 h-6 rounded-full bg-optio-purple/15 items-center justify-center">
                <Ionicons name="journal" size={14} color="#6D469B" />
              </View>
            ) : (
              <Pressable
                onPress={(e) => { e.stopPropagation(); if (!task.is_completed) handleComplete(); }}
                className="flex-shrink-0"
              >
                <Ionicons
                  name={task.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={task.is_completed ? '#16A34A' : c.iconMuted}
                />
              </Pressable>
            )}
            <VStack className="flex-1 min-w-0">
              <HStack className="items-center gap-1.5">
                <UIText
                  size="sm"
                  numberOfLines={1}
                  className={`flex-shrink font-poppins-medium ${task.is_completed && !task.is_moment ? 'text-typo-400 dark:text-dark-typo-400 line-through' : ''}`}
                >
                  {task.title}
                </UIText>
                {/* Edit pillar + diploma subjects — sits just right of the title,
                    only while expanded. */}
                {expanded && !task.is_moment && !isClassTask && onEditTask && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onEditTask(task); }}
                    hitSlop={8}
                    accessibilityLabel="Edit pillar and subjects"
                  >
                    <Ionicons name="pencil-outline" size={15} color="#6D469B" />
                  </Pressable>
                )}
              </HStack>
              <HStack className="items-center gap-2">
                {isClassTask && subjectMeta ? (
                  <View
                    style={{ backgroundColor: `${subjectMeta.accent}1A` }}
                    className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                  >
                    <Ionicons name={subjectMeta.icon} size={11} color={subjectMeta.accent} />
                    <UIText size="xs" style={{ color: subjectMeta.accent }} className="font-poppins-medium">
                      {subjectMeta.name} · {creditXp} XP
                    </UIText>
                  </View>
                ) : (
                  <>
                    <View className={`px-1.5 py-0.5 rounded ${pillar.bg}`}>
                      <UIText size="xs" className={pillar.text}>
                        {task.pillar === 'stem' ? 'STEM' : task.pillar?.charAt(0).toUpperCase() + task.pillar?.slice(1)}
                      </UIText>
                    </View>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{task.xp_value || task.xp_amount || 0} XP</UIText>
                  </>
                )}
                {task.is_moment && (
                  <View className="px-1.5 py-0.5 rounded bg-optio-purple/10">
                    <UIText size="xs" className="text-optio-purple" style={{ fontSize: 10 }}>From Journal</UIText>
                  </View>
                )}
                {!task.is_moment && evidenceBlocks.length > 0 && (
                  <HStack className="items-center gap-1">
                    <Ionicons name="attach" size={12} color={c.iconMuted} />
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{evidenceBlocks.length}</UIText>
                  </HStack>
                )}
              </HStack>
            </VStack>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={c.iconMuted}
            />
          </HStack>

          {/* Expanded detail */}
          {expanded && (
            <VStack space="sm" className="ml-9">
              {task.description && (
                <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">{task.description}</UIText>
              )}
              {task.diploma_subjects?.length > 0 && (
                <HStack className="items-center gap-1 flex-wrap">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Subjects:</UIText>
                  {task.diploma_subjects.map((s: string) => (
                    <Badge key={s} action="muted">
                      <BadgeText className="text-typo-500 dark:text-dark-typo-500">{s}</BadgeText>
                    </Badge>
                  ))}
                </HStack>
              )}

              {/* Evidence display */}
              {evidenceBlocks.length > 0 && (
                <VStack space="sm">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Evidence</UIText>
                  {evidenceBlocks.map((block, idx) => (
                    <EvidenceBlockDisplay key={block.id || idx} block={block} />
                  ))}
                </VStack>
              )}

              {/* Single Add Evidence button — opens the bottom sheet that handles
                  photo/video/voice/text/link in one flow. */}
              {!task.is_completed && (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); setEvidenceSheetVisible(true); }}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-optio-purple/10 active:bg-optio-purple/20"
                  style={{ minHeight: 44 }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#6D469B" />
                  <UIText size="sm" className="text-optio-purple font-poppins-semibold">
                    {evidenceBlocks.length > 0 ? 'Add more evidence' : 'Add evidence'}
                  </UIText>
                </Pressable>
              )}

              {/* Completed status */}
              {task.is_completed && task.completed_at && (
                <UIText size="xs" className="text-green-600">
                  Completed {new Date(task.completed_at).toLocaleDateString()}
                </UIText>
              )}

              {/* Edit a journal moment in place — add a title/details/more
                  evidence without leaving the quest (bug #16). */}
              {task.is_moment && onEditMoment && (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onEditMoment(task); }}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-optio-purple/10 active:bg-optio-purple/20"
                  style={{ minHeight: 44 }}
                >
                  <Ionicons name="pencil-outline" size={16} color="#6D469B" />
                  <UIText size="sm" className="text-optio-purple font-poppins-semibold">Edit moment</UIText>
                </Pressable>
              )}

              {/* Primary action: full-width Complete. Remove is demoted to a
                  muted text link with a confirmation dialog. */}
              {!task.is_completed && (
                <VStack space="sm" className="mt-2">
                  <Button size="lg" className="w-full" onPress={handleComplete} loading={completing}>
                    <ButtonText>
                      <HStack className="items-center gap-2">
                        <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                        <UIText className="text-white font-poppins-semibold">Complete task</UIText>
                      </HStack>
                    </ButtonText>
                  </Button>
                  {!task.is_required && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        if (Platform.OS === 'web') {
                          if (window.confirm(`Remove "${task.title}" from this quest?`)) {
                            onDelete(task.id);
                          }
                          return;
                        }
                        Alert.alert(
                          'Remove task?',
                          `"${task.title}" will be removed from this quest. Any evidence you've added to it will be lost.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => onDelete(task.id) },
                          ],
                        );
                      }}
                      hitSlop={8}
                      style={{ minHeight: 36, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Remove from quest</UIText>
                    </Pressable>
                  )}
                </VStack>
              )}
            </VStack>
          )}
        </VStack>
      </Card>

      {/* Bottom sheet: photo/video/voice/text/link in a single Add Evidence flow */}
      <TaskEvidenceSheet
        visible={evidenceSheetVisible}
        taskId={task.id}
        taskTitle={task.title}
        existingBlocks={evidenceBlocks}
        onClose={() => setEvidenceSheetVisible(false)}
        onSaved={refetchEvidence}
      />
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
  const c = useThemeColors();
  const [enrolling, setEnrolling] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [restartModalVisible, setRestartModalVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Moment being edited via the in-quest "Edit moment" button (bug #16). We
  // fetch the FULL learning_event first — the quest's moment-task is a reduced
  // shape, and EditMomentModal writes back the full form, so editing the
  // partial would wipe pillars/event_date.
  const [editMomentEvent, setEditMomentEvent] = useState<LearningEvent | null>(null);
  // Regular task being edited (pillar + diploma subjects) via the in-quest
  // "Edit pillar & subjects" button.
  const [editTask, setEditTask] = useState<any | null>(null);
  const scrollRef = React.useRef<ScrollView>(null);

  const handleEditMoment = async (task: any) => {
    const eventId = String(task.id || '').replace(/^moment-/, '');
    if (!eventId) return;
    try {
      const { data } = await api.get(`/api/learning-events/${eventId}`);
      if (data?.event) setEditMomentEvent(data.event);
    } catch {
      Alert.alert('Could not open', 'This moment could not be loaded for editing.');
    }
  };

  // Publish quest context to the global Capture button while this screen is
  // focused, so the center "+" knows to scope the task picker to this quest.
  // Clear it on unfocus, otherwise the next Capture would still target this
  // quest from another screen.
  const setQuestCtx = useCaptureContextStore((s) => s.setQuest);
  const clearQuestCtx = useCaptureContextStore((s) => s.clear);
  useFocusEffect(
    React.useCallback(() => {
      if (quest?.id && quest?.title && !!quest?.user_enrollment) {
        setQuestCtx({ questId: quest.id, questTitle: quest.title });
      }
      return () => clearQuestCtx();
    }, [quest?.id, quest?.title, quest?.user_enrollment, setQuestCtx, clearQuestCtx]),
  );

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
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
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
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={48} color={c.iconMuted} />
        <Heading size="md" className="text-typo-500 dark:text-dark-typo-500 mt-4">Quest not found</Heading>
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2 text-center">{error || 'This quest may have been removed.'}</UIText>
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
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 600)}
        scrollEventThrottle={64}
      >

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
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-surface-200 dark:bg-dark-surface-300 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color={c.text} />
            </Pressable>
          </View>
        )}

        {/* Constrained content below image */}
        <VStack className="max-w-4xl w-full md:mx-auto">
          <VStack className="px-5 md:px-8 pt-6 pb-12" space="lg">

            {/* Title + engagement */}
            <VStack testID="quest-detail-header" space="sm">
              {/* leading-snug: the default RN line height clipped descenders
                  (the "g" in a title got cut off — bug #2). */}
              <Heading testID="quest-title" size="2xl" className="leading-snug">{quest.title}</Heading>
              {isEnrolled && engagement?.rhythm && (
                <HStack className="items-center gap-3">
                  <RhythmBadge rhythm={engagement.rhythm} compact />
                  {calendarDays.length > 0 && <MiniHeatmap days={calendarDays} />}
                </HStack>
              )}
            </VStack>

            {/* Class header (only for class-type quests) */}
            {quest.quest_type === 'class' && isEnrolled && (
              <ClassDetailHeader
                questId={quest.id}
                transcriptSubject={quest.transcript_subject || null}
                refreshKey={`${tasks.length}-${completedCount}`}
              />
            )}

            {/* Description — prefer big_idea (richer copy used on web v1) and
                fall back to description. Many curated quests only fill one. */}
            {(quest.big_idea || quest.description) ? (
              <UIText testID="quest-description" size="md" className="text-typo-700 dark:text-dark-typo-300 leading-6">
                {quest.big_idea || quest.description}
              </UIText>
            ) : null}

            {/* Enrollment CTA (not enrolled) */}
            {!isEnrolled && (
              <Card variant="elevated" size="lg" className="items-center">
                <VStack space="md" className="items-center w-full">
                  <Ionicons name="rocket" size={32} color="#6D469B" />
                  <Heading size="md">Ready to start?</Heading>
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">
                    Enroll in this quest to begin your personalized learning journey.
                  </UIText>
                  <Button size="lg" className="w-full" onPress={handleEnroll} loading={enrolling}>
                    <ButtonText>Start Quest</ButtonText>
                  </Button>
                </VStack>
              </Card>
            )}

            {/* Engagement mini-calendar (enrolled) — replaces task-completion
                progress. Hidden for classes, which track XP-toward-credit in the
                ClassDetailHeader instead. */}
            {isEnrolled && quest.quest_type !== 'class' && (
              <QuestEngagement engagement={engagement} />
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
                        classSubject={quest.quest_type === 'class' ? (quest.transcript_subject || null) : null}
                        onComplete={(taskId) => {
                          // TaskItem.handleComplete already POSTed to the API.
                          // Just update local state here -- no second API call.
                          if (!quest) return;
                          refetch();
                        }}
                        onDelete={deleteTask}
                        onEditMoment={handleEditMoment}
                        onEditTask={setEditTask}
                      />
                    ))}
                  </VStack>
                ) : (
                  <Card variant="filled" size="md" className="items-center py-6">
                    <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">No tasks yet. Add your first task below.</UIText>
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
                  isClassQuest={quest.quest_type === 'class'}
                  classSubject={quest.quest_type === 'class' ? (quest.transcript_subject || null) : null}
                />

                {/* Leave Quest — "End Class" for class-type quests */}
                <Divider className="mt-4" />
                <Pressable
                  onPress={() => {
                    const isClass = quest.quest_type === 'class';
                    const confirmMsg = isClass
                      ? 'End this class? Your completed tasks will be preserved.'
                      : 'Leave this quest? Your completed tasks will be preserved.';
                    if (Platform.OS === 'web') {
                      if (window.confirm(confirmMsg)) {
                        handleLeaveQuest();
                      }
                      return;
                    }
                    Alert.alert(
                      isClass ? 'End Class?' : 'Leave Quest?',
                      'Your completed tasks will be preserved. You can re-enroll later.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: isClass ? 'End Class' : 'Leave',
                          style: 'destructive',
                          onPress: handleLeaveQuest,
                        },
                      ],
                    );
                  }}
                  className="py-3 items-center"
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <UIText size="sm" className="text-red-400">
                    {quest.quest_type === 'class' ? 'End Class' : 'Leave Quest'}
                  </UIText>
                </Pressable>
              </VStack>
            )}

          </VStack>
        </VStack>
      </ScrollView>

      {/* No quest-scoped FAB here — the global center Capture button reads
          captureContextStore.quest while this screen is focused, so it
          already opens the sheet scoped to this quest. */}

      <ScrollToTopFab
        visible={showScrollTop}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        bottomOffset={24}
      />

      {/* Restart Quest Modal */}
      {restartModalVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 50 }}>
          <Card variant="elevated" size="lg" className="mx-6 max-w-md w-full">
            <VStack space="md" className="items-center">
              <Ionicons name="refresh-circle-outline" size={40} color="#6D469B" />
              <Heading size="md" className="text-center">Welcome Back!</Heading>
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">
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
                  <ButtonText className="text-typo-400 dark:text-dark-typo-400">Cancel</ButtonText>
                </Button>
              </VStack>
            </VStack>
          </Card>
        </View>
      )}

      {/* In-quest moment editor (bug #16) */}
      <EditMomentModal
        visible={!!editMomentEvent}
        event={editMomentEvent}
        topics={[]}
        onClose={() => setEditMomentEvent(null)}
        onSaved={() => { setEditMomentEvent(null); refetch(); }}
      />

      {/* In-quest task editor — pillar + diploma subjects */}
      <TaskEditModal
        visible={!!editTask}
        task={editTask}
        onClose={() => setEditTask(null)}
        onSaved={() => { setEditTask(null); refetch(); }}
      />
    </SafeAreaView>
  );
}
