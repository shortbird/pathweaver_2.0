/**
 * LearningEventCard - Displays a single learning moment.
 * Shows title, description, pillars, evidence thumbnails, topic tags.
 * Supports edit and delete actions.
 */

import React, { memo, useState } from 'react';
import { View, Pressable, Alert, Platform, TextInput } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, PillarBadge, ActionSheet, type ActionSheetAction } from '../ui';
import type { LearningEvent, UnifiedTopic } from '@/src/hooks/useJournal';
import { deleteLearningEvent, assignMomentToTopic, deleteChildLearningEvent } from '@/src/hooks/useJournal';
import api from '@/src/services/api';
import { TaskPickerSheet, attachMomentToTask, detachMomentFromTask } from './TaskPickerSheet';
import { AudioClipPreview } from '../capture/VoiceRecorder';
import { VideoPlayer } from '../feed/VideoPlayer';
import { DocumentViewer } from '../feed/DocumentViewer';
import { MediaModal } from '../feed/MediaModal';
import { safeOpenURL } from '@/src/utils/linking';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useMediaUploadStore } from '@/src/stores/mediaUploadStore';
import { displayImageUrl } from '@/src/services/imageUrl';

const evidenceIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'document-text-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  link: 'link-outline',
  document: 'attach-outline',
  audio: 'mic-outline',
};

interface LearningEventCardProps {
  event: LearningEvent;
  onPress?: () => void;
  onDeleted?: () => void;
  onEdit?: (event: LearningEvent) => void;
  topics?: UnifiedTopic[];
  onAssigned?: () => void;
  /** Parent view: the moment belongs to this child, so delete routes through
   *  the parent-scoped endpoint. Student-only actions (topic assign, task
   *  attach, inline topic creation) are hidden in this mode. */
  childId?: string;
  /** Fully read-only — no action menu opens on tap. Used for a child's
   *  self-captured moments, which a parent can view but not edit/delete. */
  readOnly?: boolean;
}

function LearningEventCardImpl({ event, onPress, onDeleted, onEdit, topics, onAssigned, childId, readOnly }: LearningEventCardProps) {
  const c = useThemeColors();
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  // Background video upload progress for this moment (if one is in flight).
  const uploadingPct = useMediaUploadStore((s) => s.uploads[event.id]);
  const [deleting, setDeleting] = useState(false);
  const [showTopicMenu, setShowTopicMenu] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [taskPickerVisible, setTaskPickerVisible] = useState(false);
  const [mediaModal, setMediaModal] = useState<{ type: 'image' | 'video' | 'document'; uri: string; title?: string } | null>(null);

  const handleAttachTask = async (taskId: string) => {
    try {
      await attachMomentToTask(event.id, taskId);
      setTaskPickerVisible(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to attach moment to task.');
    }
  };

  const handleDetachTask = async () => {
    try {
      await detachMomentFromTask(event.id);
      setTaskPickerVisible(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to detach moment.');
    }
  };

  // Add this moment as a brand-new task on a quest (convert-to-task), the same
  // capability the capture flow has (bug #12 parity in the Unassigned Moments
  // drawer). The quest's detail screen dedupes the moment vs the new task.
  const handleAddAsNewTask = async (questId: string) => {
    try {
      await api.post(`/api/learning-events/${event.id}/convert-to-task`, { quest_id: questId });
      setTaskPickerVisible(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to add the moment as a new task.');
    }
  };

  const getBlockUrl = (b: any) => b?.file_url || b?.content?.url || b?.content?.items?.[0]?.url;
  // Render ALL image blocks, not just the first — a moment with multiple photos
  // was only showing image #1 ("I uploaded two pictures but only one shows").
  const imageBlocks = event.evidence_blocks?.filter((b) => b.block_type === 'image' && getBlockUrl(b)) || [];
  const imageUrls = Array.from(
    new Set(
      imageBlocks
        .map((b) => displayImageUrl(getBlockUrl(b)))
        .filter((u): u is string => !!u)
    )
  );
  // Video is the hero only when there are no images to show.
  const videoBlock = imageUrls.length === 0 ? event.evidence_blocks?.find((b) => b.block_type === 'video' && getBlockUrl(b)) : null;
  // Voice notes get an inline player; everything else (except rendered media)
  // shows as a small evidence-type icon badge.
  const audioBlocks = event.evidence_blocks?.filter((b) => b.block_type === 'audio' && getBlockUrl(b)) || [];
  // PDFs/documents get an inline preview (DocumentViewer), so don't also reduce
  // them to a tiny type icon in the indicator row.
  const documentBlocks = event.evidence_blocks?.filter((b) => b.block_type === 'document' && getBlockUrl(b)) || [];
  // Links render inline as a real, tappable row (with the description as their
  // context) — NOT as a tiny icon — so a link + its context read as one item
  // instead of looking like two (bug #6).
  const getLinkUrl = (b: any) => getBlockUrl(b) || b?.content?.url || b?.content?.value;
  const linkBlocks = event.evidence_blocks?.filter((b) => b.block_type === 'link' && getLinkUrl(b)) || [];
  const otherEvidence = event.evidence_blocks?.filter(
    (b) => b.block_type !== 'image' && b !== videoBlock && b.block_type !== 'audio' && b.block_type !== 'document' && b.block_type !== 'link',
  ) || [];
  // Primary attachment for a card tap: open it full-screen ("tapping the item
  // should bring up the full view of the attachment"; the 3-dot button is the
  // menu). Falls back to the actions sheet when the moment has no media.
  const primaryMedia: { type: 'image' | 'video' | 'document'; uri: string; title?: string } | null =
    imageUrls.length > 0
      ? { type: 'image', uri: imageUrls[0] }
      : videoBlock && getBlockUrl(videoBlock)
      ? { type: 'video', uri: getBlockUrl(videoBlock) }
      : documentBlocks.length > 0 && getBlockUrl(documentBlocks[0])
      ? { type: 'document', uri: getBlockUrl(documentBlocks[0]), title: documentBlocks[0]?.content?.name || documentBlocks[0]?.file_name }
      : null;

  // Task-evidence moments get an auto description "Evidence for: <task>" and no
  // real title, which then echoes the attached-task chip — so the moment and its
  // task read as two items ("X" + "Evidence for: X"). Strip the prefix so the
  // heading IS the task, and show only quest context in the chip (the heading
  // already carries the task), collapsing them into one thing.
  const EVIDENCE_PREFIX = 'Evidence for: ';
  const isAutoEvidence = !event.title && !!event.description?.startsWith(EVIDENCE_PREFIX);
  const displayTitle =
    event.title ||
    (isAutoEvidence ? event.description!.slice(EVIDENCE_PREFIX.length) : event.description) ||
    'Learning Moment';
  const taskChipText = event.attached_task
    ? isAutoEvidence
      ? event.attached_task.quest_title || null
      : `${event.attached_task.quest_title ? `${event.attached_task.quest_title}: ` : ''}${event.attached_task.title}`
    : null;

  const rawDate = event.event_date || event.created_at;
  // Append T12:00 to date-only strings to avoid UTC midnight → previous day in local timezone
  const parsedDate = rawDate && !rawDate.includes('T') ? new Date(rawDate + 'T12:00:00') : new Date(rawDate);
  const dateStr = parsedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const availableTracks = topics?.filter((t) => t.type === 'topic' || t.type === 'track') || [];
  const currentTopicId = event.topics?.find((t) => t.type === 'topic')?.id || event.track_id || null;

  // Active quests the moment can be assigned to. Unlike tracks (single-select),
  // a moment can belong to multiple quests, so each quest row toggles its own
  // assignment independently.
  const availableQuests = topics?.filter((t) => t.type === 'quest') || [];
  const assignedQuestIds = new Set(
    (event.topics || []).filter((t) => t.type === 'quest').map((t) => t.id),
  );

  const TOPIC_COLORS = ['#6D469B', '#EF597B', '#3DA24A', '#FF9028', '#2D8CFF', '#E84393'];

  const handleCreateAndAssign = async () => {
    if (!newTopicName.trim()) return;
    setCreatingTopic(true);
    try {
      const color = TOPIC_COLORS[Math.floor(Math.random() * TOPIC_COLORS.length)];
      const { data } = await api.post('/api/interest-tracks', {
        name: newTopicName.trim(),
        color,
        icon: 'hardware-chip-outline',
      });
      const newTrackId = data.track?.id || data.id;
      if (newTrackId) {
        await assignMomentToTopic(event.id, 'track', newTrackId, 'add');
      }
      setNewTopicName('');
      setShowNewTopic(false);
      setShowTopicMenu(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to create topic.');
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleAssignToTopic = async (topicId: string | null) => {
    setAssigning(true);
    try {
      // Remove old assignment
      if (currentTopicId) {
        await assignMomentToTopic(event.id, 'track', currentTopicId, 'remove');
      }
      // Add new assignment
      if (topicId) {
        await assignMomentToTopic(event.id, 'track', topicId, 'add');
      }
      setShowTopicMenu(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to assign to topic.');
    } finally {
      setAssigning(false);
    }
  };

  const handleToggleQuest = async (questId: string) => {
    setAssigning(true);
    try {
      const action = assignedQuestIds.has(questId) ? 'remove' : 'add';
      await assignMomentToTopic(event.id, 'quest', questId, action);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to assign to quest.');
    } finally {
      setAssigning(false);
    }
  };

  const handleDelete = async () => {
    const doDelete = Platform.OS === 'web'
      ? window.confirm('Delete this learning moment? This cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Moment', 'This cannot be undone.', [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' },
          ]);
        });

    if (!doDelete) return;
    setDeleting(true);
    try {
      await (childId ? deleteChildLearningEvent(childId, event.id) : deleteLearningEvent(event.id));
      onDeleted?.();
    } catch (err: any) {
      // Surface the server's actual reason (the API interceptor also reports it
      // to Sentry) instead of a generic message.
      const msg = err?.response?.data?.error || err?.message || 'Failed to delete moment.';
      Alert.alert('Error', msg);
    } finally {
      setDeleting(false);
    }
  };

  // Secondary actions live behind a single "⋯" affordance / card tap, surfaced
  // as an ActionSheet (≥44pt rows, Delete isolated in red) — replaces the old
  // cramped inline button row.
  const actions: ActionSheetAction[] = [];
  if (onEdit) {
    actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline', onPress: () => onEdit(event) });
  }
  if (!childId && (availableTracks.length > 0 || availableQuests.length > 0)) {
    actions.push({ key: 'assign', label: 'Assign to topic', icon: 'folder-outline', onPress: () => setShowTopicMenu(true) });
  }
  if (!childId) {
    actions.push({
      key: 'attach',
      label: event.attached_task ? 'Change task' : 'Attach task',
      icon: 'rocket-outline',
      onPress: () => setTaskPickerVisible(true),
    });
  }
  actions.push({ key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true, disabled: deleting, onPress: handleDelete });

  return (
    <Pressable onPress={() => {
      if (onPress) { onPress(); }
      else if (primaryMedia) { setMediaModal(primaryMedia); }
      else if (!readOnly) { setActionsSheetOpen(true); }
    }}>
      <Card variant="elevated" size="sm" className="overflow-hidden">
        {/* Media header */}
        {imageUrls.length === 1 ? (
          <View className="-mx-3 -mt-3 mb-3">
            <ExpoImage
              // displayImageUrl (applied above) rewrites HEIC/HEIF (iPhone photos)
              // to Supabase's transcoding endpoint; without it those uploads
              // render blank ("pictures not showing of uploaded images").
              source={{ uri: imageUrls[0] }}
              className="w-full h-40 rounded-t-xl"
              style={{ width: '100%', height: 160 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
          </View>
        ) : imageUrls.length > 1 ? (
          // Multiple photos — 2-up grid so every image shows, not just the first.
          <View className="-mx-3 -mt-3 mb-3 flex-row flex-wrap">
            {imageUrls.map((uri, i) => (
              <View key={`img-${i}`} style={{ width: '50%', padding: 1 }}>
                <ExpoImage
                  source={{ uri }}
                  style={{ width: '100%', height: 120 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                />
              </View>
            ))}
          </View>
        ) : videoBlock && getBlockUrl(videoBlock) ? (
          <View className="-mx-3 -mt-3 mb-3">
            {Platform.OS === 'web' ? (
              <video
                src={getBlockUrl(videoBlock)}
                controls
                style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: '#000' }}
              />
            ) : (
              // Real inline player (was a static placeholder) so videos are
              // watchable directly in the journal.
              <View style={{ height: 220 }}>
                <VideoPlayer uri={getBlockUrl(videoBlock)} fillContainer />
              </View>
            )}
          </View>
        ) : uploadingPct !== undefined ? (
          // Media still uploading in the background — show progress so it doesn't
          // look like the attachment failed (covers image/audio/doc/video).
          <View className="-mx-3 -mt-3 mb-3">
            <View className="w-full h-40 bg-surface-100 dark:bg-dark-surface-200 rounded-t-xl items-center justify-center">
              <Ionicons name="cloud-upload-outline" size={28} color="#6D469B" />
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 font-poppins-medium">
                Uploading… {uploadingPct}%
              </UIText>
            </View>
          </View>
        ) : null}

        <VStack space="xs">
          {/* Title + date */}
          <HStack className="items-start justify-between">
            <UIText size="sm" className="font-poppins-semibold flex-1">
              {displayTitle}
            </UIText>
            <HStack className="items-center gap-1 ml-2 flex-shrink-0">
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{dateStr}</UIText>
              {!readOnly && !onPress && actions.length > 0 ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); setActionsSheetOpen(true); }}
                  hitSlop={10}
                  className="w-8 h-8 rounded-full items-center justify-center active:bg-surface-100 dark:active:bg-dark-surface-200"
                  accessibilityRole="button"
                  accessibilityLabel="Moment actions"
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={c.iconMuted} />
                </Pressable>
              ) : null}
            </HStack>
          </HStack>

          {/* Assign-to-topic picker — opened from the actions sheet. */}
          {showTopicMenu ? (
            <VStack space="xs" className="py-1">
              <View className="bg-surface-50 dark:bg-dark-surface-50 rounded-lg p-2 border border-surface-200 dark:border-dark-surface-300">
                <HStack className="items-center justify-between px-2 pb-1">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">Assign to topic</UIText>
                  <Pressable onPress={(e) => { e.stopPropagation?.(); setShowTopicMenu(false); }} hitSlop={10}>
                    <Ionicons name="close" size={16} color={c.iconMuted} />
                  </Pressable>
                </HStack>
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); handleAssignToTopic(null); }}
                    className={`flex-row items-center gap-2 px-2 py-1.5 rounded ${!currentTopicId ? 'bg-surface-200 dark:bg-dark-surface-300' : ''}`}
                    disabled={assigning}
                  >
                    <Ionicons name="remove-circle-outline" size={14} color={c.iconMuted} />
                    <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">Unassigned</UIText>
                  </Pressable>
                  {availableTracks.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={(e) => { e.stopPropagation?.(); handleAssignToTopic(t.id); }}
                      className={`flex-row items-center gap-2 px-2 py-1.5 rounded ${currentTopicId === t.id ? 'bg-optio-purple/10' : ''}`}
                      disabled={assigning}
                    >
                      <View
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: (t.color || '#6D469B') + '30' }}
                      />
                      <UIText size="xs" className={currentTopicId === t.id ? 'font-poppins-medium text-optio-purple' : 'text-typo dark:text-dark-typo'}>
                        {t.name}
                      </UIText>
                    </Pressable>
                  ))}
                  <View className="h-px bg-surface-200 dark:bg-dark-surface-300 my-1" />
                  {showNewTopic ? (
                    <HStack className="items-center gap-1.5 px-2 py-1">
                      <TextInput
                        value={newTopicName}
                        onChangeText={setNewTopicName}
                        placeholder="Topic name"
                        placeholderTextColor={c.textFaint}
                        autoFocus
                        onSubmitEditing={handleCreateAndAssign}
                        className="flex-1 bg-white dark:bg-dark-surface-100 text-typo dark:text-dark-typo rounded px-2 py-1 text-xs border border-surface-200 dark:border-dark-surface-300"
                        style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}
                      />
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); handleCreateAndAssign(); }}
                        disabled={!newTopicName.trim() || creatingTopic}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Create topic"
                        style={{ opacity: !newTopicName.trim() || creatingTopic ? 0.4 : 1 }}
                      >
                        <Ionicons name="checkmark-circle" size={22} color="#6D469B" />
                      </Pressable>
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); setShowNewTopic(false); setNewTopicName(''); }}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel new topic"
                      >
                        <Ionicons name="close-circle" size={22} color={c.iconMuted} />
                      </Pressable>
                    </HStack>
                  ) : (
                    <Pressable
                      onPress={(e) => { e.stopPropagation?.(); setShowNewTopic(true); }}
                      className="flex-row items-center gap-2 px-2 py-1.5 rounded"
                    >
                      <Ionicons name="add-circle-outline" size={14} color="#6D469B" />
                      <UIText size="xs" className="text-optio-purple font-poppins-medium">New Topic</UIText>
                    </Pressable>
                  )}

                  {/* Quests — independent multi-toggle (a moment can belong to
                      a topic and one or more quests). Tap to add/remove. */}
                  {availableQuests.length > 0 ? (
                    <>
                      <View className="h-px bg-surface-200 dark:bg-dark-surface-300 my-1" />
                      <HStack className="items-center gap-1.5 px-2 py-1">
                        <Ionicons name="flag-outline" size={12} color={c.iconMuted} />
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase">Quests</UIText>
                      </HStack>
                      {availableQuests.map((q) => {
                        const assigned = assignedQuestIds.has(q.id);
                        return (
                          <Pressable
                            key={q.id}
                            onPress={(e) => { e.stopPropagation?.(); handleToggleQuest(q.id); }}
                            className={`flex-row items-center gap-2 px-2 py-1.5 rounded ${assigned ? 'bg-optio-purple/10' : ''}`}
                            disabled={assigning}
                          >
                            <Ionicons
                              name={assigned ? 'checkmark-circle' : 'flag-outline'}
                              size={14}
                              color={assigned ? '#6D469B' : c.iconMuted}
                            />
                            <UIText size="xs" className={assigned ? 'font-poppins-medium text-optio-purple' : 'text-typo dark:text-dark-typo'} numberOfLines={1}>
                              {q.name}
                            </UIText>
                          </Pressable>
                        );
                      })}
                    </>
                  ) : null}
                </View>
            </VStack>
          ) : null}

          {/* Description (only if different from title) */}
          {event.description && event.title && event.description !== event.title ? (
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>
              {event.description}
            </UIText>
          ) : null}

          {/* Voice notes — inline audio player. Wrapped so play taps don't also
              trigger the card's tap-to-open-actions handler. */}
          {audioBlocks.map((b, i) => (
            <Pressable key={`audio-${i}`} onPress={(e) => e.stopPropagation?.()} style={{ marginTop: i > 0 ? 8 : 0 }}>
              <AudioClipPreview
                clip={{ uri: getBlockUrl(b)!, name: 'Voice note', fileSize: 0, durationMs: (b as any).content?.duration_ms || 0 }}
              />
            </Pressable>
          ))}

          {/* PDFs / documents — inline page preview (was just a type icon). */}
          {documentBlocks.map((b, i) => (
            <Pressable key={`doc-${i}`} onPress={(e) => e.stopPropagation?.()} style={{ marginTop: 4 }}>
              <DocumentViewer
                uri={getBlockUrl(b)!}
                title={(b as any).file_name || (b as any).content?.filename || (b as any).content?.title || 'Document'}
              />
            </Pressable>
          ))}

          {/* Links — inline tappable row (the moment's description above is the
              context for the link, so they read as one item — bug #6). */}
          {linkBlocks.map((b, i) => {
            const linkUrl = getLinkUrl(b)!;
            const linkTitle = (b as any).content?.title;
            return (
              <Pressable
                key={`link-${i}`}
                onPress={(e) => { e.stopPropagation?.(); safeOpenURL(linkUrl); }}
                className="active:opacity-70"
                style={{ marginTop: 2 }}
              >
                <HStack className="items-center gap-2 p-3 bg-surface-100 dark:bg-dark-surface-200 rounded-lg">
                  <Ionicons name="link" size={16} color="#2469D1" />
                  <VStack className="flex-1 min-w-0">
                    {linkTitle && linkTitle !== linkUrl ? (
                      <UIText size="xs" className="font-poppins-medium" numberOfLines={1}>{linkTitle}</UIText>
                    ) : null}
                    <UIText size="xs" className="text-pillar-stem" numberOfLines={1}>{linkUrl}</UIText>
                  </VStack>
                  <Ionicons name="open-outline" size={14} color={c.iconMuted} />
                </HStack>
              </Pressable>
            );
          })}

          {/* Pillars + evidence indicators */}
          <HStack className="items-center gap-2 flex-wrap">
            {(event.pillars || []).map((p) => (
              <PillarBadge key={p} pillar={p} />
            ))}
            {otherEvidence.length > 0 ? (
              <HStack className="items-center gap-1 ml-auto">
                {otherEvidence.slice(0, 3).map((b, i) => (
                  <Ionicons
                    key={i}
                    name={evidenceIcons[b.block_type] || 'ellipse-outline'}
                    size={14}
                    color={c.iconMuted}
                  />
                ))}
              </HStack>
            ) : null}
          </HStack>

          {/* Attached task chip — quest/task context badge. For auto-evidence
              moments the heading already shows the task, so this shows only the
              quest (or is hidden) to avoid repeating it. */}
          {taskChipText ? (
            <HStack className="items-center gap-1.5 px-2 py-1 rounded-lg bg-optio-purple/5 border border-optio-purple/20 self-start">
              <Ionicons name="flag" size={12} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium" numberOfLines={1}>
                {taskChipText}
              </UIText>
            </HStack>
          ) : null}

          {/* Topic tags */}
          {event.topics && event.topics.length > 0 ? (
            <HStack className="items-center gap-1 flex-wrap">
              {event.topics.map((t) => (
                <View
                  key={`${t.type}-${t.id}`}
                  className="px-1.5 py-0.5 rounded bg-surface-100 dark:bg-dark-surface-200"
                >
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    {t.name}
                  </UIText>
                </View>
              ))}
            </HStack>
          ) : null}
        </VStack>
      </Card>

      <TaskPickerSheet
        visible={taskPickerVisible}
        onClose={() => setTaskPickerVisible(false)}
        onPicked={(task) => handleAttachTask(task.id)}
        onAddAsNewTask={(quest) => handleAddAsNewTask(quest.id)}
        currentTaskId={event.attached_task_id || null}
        allowDetach={!!event.attached_task_id}
        onDetach={handleDetachTask}
      />

      <ActionSheet
        visible={actionsSheetOpen}
        onClose={() => setActionsSheetOpen(false)}
        actions={actions}
      />

      <MediaModal
        visible={!!mediaModal}
        onClose={() => setMediaModal(null)}
        type={mediaModal?.type ?? 'image'}
        uri={mediaModal?.uri ?? ''}
        title={mediaModal?.title}
      />
    </Pressable>
  );
}

// P4: memoize — same event identity + same attach state skips re-render.
export const LearningEventCard = memo(LearningEventCardImpl, (prev, next) => {
  if (prev.onPress !== next.onPress) return false;
  if (prev.onDeleted !== next.onDeleted) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onAssigned !== next.onAssigned) return false;
  if (prev.topics !== next.topics) return false;
  const a = prev.event;
  const b = next.event;
  // Topic membership drives the Assign picker's selected/checked state, so a
  // change there (e.g. toggling a quest assignment) must force a re-render.
  const topicSig = (e: LearningEvent) =>
    (e.topics || []).map((t) => `${t.type}:${t.id}`).sort().join('|');
  return (
    a.id === b.id &&
    a.attached_task_id === b.attached_task_id &&
    a.title === b.title &&
    a.description === b.description &&
    topicSig(a) === topicSig(b)
  );
});
