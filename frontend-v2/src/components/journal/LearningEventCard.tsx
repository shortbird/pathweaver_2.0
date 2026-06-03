/**
 * LearningEventCard - Displays a single learning moment.
 * Shows title, description, pillars, evidence thumbnails, topic tags.
 * Supports edit and delete actions.
 */

import React, { memo, useState } from 'react';
import { View, Pressable, Alert, Platform, TextInput } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, PillarBadge } from '../ui';
import type { LearningEvent, UnifiedTopic } from '@/src/hooks/useJournal';
import { deleteLearningEvent, assignMomentToTopic, deleteChildLearningEvent } from '@/src/hooks/useJournal';
import api from '@/src/services/api';
import { TaskPickerSheet, attachMomentToTask, detachMomentFromTask } from './TaskPickerSheet';
import { AudioClipPreview } from '../capture/VoiceRecorder';
import { useThemeColors } from '@/src/hooks/useThemeColors';

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
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTopicMenu, setShowTopicMenu] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [taskPickerVisible, setTaskPickerVisible] = useState(false);

  const handleAttachTask = async (taskId: string) => {
    try {
      await attachMomentToTask(event.id, taskId);
      setTaskPickerVisible(false);
      setShowActions(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to attach moment to task.');
    }
  };

  const handleDetachTask = async () => {
    try {
      await detachMomentFromTask(event.id);
      setTaskPickerVisible(false);
      setShowActions(false);
      await onAssigned?.();
    } catch {
      Alert.alert('Error', 'Failed to detach moment.');
    }
  };

  const getBlockUrl = (b: any) => b?.file_url || b?.content?.url || b?.content?.items?.[0]?.url;
  const imageBlock = event.evidence_blocks?.find((b) => b.block_type === 'image' && getBlockUrl(b));
  const videoBlock = !imageBlock ? event.evidence_blocks?.find((b) => b.block_type === 'video' && getBlockUrl(b)) : null;
  const heroBlock = imageBlock || videoBlock;
  // Voice notes get an inline player; everything else (except the hero) shows as
  // a small evidence-type icon badge.
  const audioBlocks = event.evidence_blocks?.filter((b) => b.block_type === 'audio' && getBlockUrl(b)) || [];
  const otherEvidence = event.evidence_blocks?.filter((b) => b !== heroBlock && b.block_type !== 'audio') || [];
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
      setShowActions(false);
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
      setShowActions(false);
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

  return (
    <Pressable onPress={() => { if (onPress) { onPress(); } else if (!readOnly) { setShowActions(!showActions); } }}>
      <Card variant="elevated" size="sm" className="overflow-hidden">
        {/* Media header */}
        {imageBlock && getBlockUrl(imageBlock) ? (
          <View className="-mx-3 -mt-3 mb-3">
            <ExpoImage
              source={{ uri: getBlockUrl(imageBlock) }}
              className="w-full h-40 rounded-t-xl"
              style={{ width: '100%', height: 160 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
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
              <View className="w-full h-40 bg-surface-100 dark:bg-dark-surface-200 rounded-t-xl items-center justify-center">
                <Ionicons name="play-circle" size={40} color="#6D469B" />
              </View>
            )}
          </View>
        ) : null}

        <VStack space="xs">
          {/* Title + date */}
          <HStack className="items-start justify-between">
            <UIText size="sm" className="font-poppins-semibold flex-1">
              {event.title || event.description || 'Learning Moment'}
            </UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-2 flex-shrink-0">{dateStr}</UIText>
          </HStack>

          {/* Action menu */}
          {showActions ? (
            <VStack space="xs" className="py-1">
              <HStack className="gap-2">
                {onEdit ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); setShowActions(false); onEdit(event); }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface-100 dark:bg-dark-surface-200 rounded-lg"
                  >
                    <Ionicons name="create-outline" size={14} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">Edit</UIText>
                  </Pressable>
                ) : null}
                {!childId && (availableTracks.length > 0 || availableQuests.length > 0) ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); setShowTopicMenu(!showTopicMenu); }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface-100 dark:bg-dark-surface-200 rounded-lg"
                  >
                    <Ionicons name="folder-outline" size={14} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">Assign</UIText>
                  </Pressable>
                ) : null}
                {!childId ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); setTaskPickerVisible(true); }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface-100 dark:bg-dark-surface-200 rounded-lg"
                  >
                    <Ionicons name="flag-outline" size={14} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">
                      {event.attached_task ? 'Change task' : 'Attach task'}
                    </UIText>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); setShowActions(false); handleDelete(); }}
                  disabled={deleting}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg"
                  style={{ opacity: deleting ? 0.5 : 1 }}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <UIText size="xs" className="text-red-500 font-poppins-medium">
                    {deleting ? 'Deleting...' : 'Delete'}
                  </UIText>
                </Pressable>
              </HStack>

              {/* Inline topic picker */}
              {showTopicMenu ? (
                <View className="bg-surface-50 dark:bg-dark-surface-50 rounded-lg p-2 border border-surface-200 dark:border-dark-surface-300">
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
                        style={{ opacity: !newTopicName.trim() || creatingTopic ? 0.4 : 1 }}
                      >
                        <Ionicons name="checkmark-circle" size={22} color="#6D469B" />
                      </Pressable>
                      <Pressable onPress={(e) => { e.stopPropagation?.(); setShowNewTopic(false); setNewTopicName(''); }}>
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
              ) : null}
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

          {/* Attached task chip */}
          {event.attached_task ? (
            <HStack className="items-center gap-1.5 px-2 py-1 rounded-lg bg-optio-purple/5 border border-optio-purple/20 self-start">
              <Ionicons name="flag" size={12} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium" numberOfLines={1}>
                {event.attached_task.quest_title ? `${event.attached_task.quest_title}: ` : ''}
                {event.attached_task.title}
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
        currentTaskId={event.attached_task_id || null}
        allowDetach={!!event.attached_task_id}
        onDetach={handleDetachTask}
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
