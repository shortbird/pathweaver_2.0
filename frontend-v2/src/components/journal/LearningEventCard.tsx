/**
 * LearningEventCard - Displays a single learning moment.
 * Shows title, description, pillars, evidence thumbnails, topic tags.
 * Supports edit and delete actions.
 */

import React, { useState } from 'react';
import { View, Image, Pressable, Alert, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, PillarBadge } from '../ui';
import type { LearningEvent, UnifiedTopic } from '@/src/hooks/useJournal';
import { deleteLearningEvent, assignMomentToTopic } from '@/src/hooks/useJournal';
import api from '@/src/services/api';

const evidenceIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'document-text-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  link: 'link-outline',
  document: 'attach-outline',
};

interface LearningEventCardProps {
  event: LearningEvent;
  onPress?: () => void;
  onDeleted?: () => void;
  onEdit?: (event: LearningEvent) => void;
  topics?: UnifiedTopic[];
  onAssigned?: () => void;
}

export function LearningEventCard({ event, onPress, onDeleted, onEdit, topics, onAssigned }: LearningEventCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTopicMenu, setShowTopicMenu] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  const getBlockUrl = (b: any) => b?.file_url || b?.content?.url || b?.content?.items?.[0]?.url;
  const imageBlock = event.evidence_blocks?.find((b) => b.block_type === 'image' && getBlockUrl(b));
  const videoBlock = !imageBlock ? event.evidence_blocks?.find((b) => b.block_type === 'video' && getBlockUrl(b)) : null;
  const heroBlock = imageBlock || videoBlock;
  const otherEvidence = event.evidence_blocks?.filter((b) => b !== heroBlock) || [];
  const rawDate = event.event_date || event.created_at;
  // Append T12:00 to date-only strings to avoid UTC midnight → previous day in local timezone
  const parsedDate = rawDate && !rawDate.includes('T') ? new Date(rawDate + 'T12:00:00') : new Date(rawDate);
  const dateStr = parsedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const availableTracks = topics?.filter((t) => t.type === 'topic' || t.type === 'track') || [];
  const currentTopicId = event.topics?.find((t) => t.type === 'topic')?.id || event.track_id || null;

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
      await deleteLearningEvent(event.id);
      onDeleted?.();
    } catch {
      Alert.alert('Error', 'Failed to delete moment.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Pressable onPress={() => { if (onPress) { onPress(); } else { setShowActions(!showActions); } }}>
      <Card variant="elevated" size="sm" className="overflow-hidden">
        {/* Media header */}
        {imageBlock && getBlockUrl(imageBlock) ? (
          <View className="-mx-3 -mt-3 mb-3">
            <Image
              source={{ uri: getBlockUrl(imageBlock) }}
              className="w-full h-40 rounded-t-xl"
              resizeMode="cover"
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
              <View className="w-full h-40 bg-surface-100 rounded-t-xl items-center justify-center">
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
            <UIText size="xs" className="text-typo-400 ml-2 flex-shrink-0">{dateStr}</UIText>
          </HStack>

          {/* Action menu */}
          {showActions ? (
            <VStack space="xs" className="py-1">
              <HStack className="gap-2">
                {onEdit ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); setShowActions(false); onEdit(event); }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface-100 rounded-lg"
                  >
                    <Ionicons name="create-outline" size={14} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">Edit</UIText>
                  </Pressable>
                ) : null}
                {availableTracks.length > 0 ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); setShowTopicMenu(!showTopicMenu); }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface-100 rounded-lg"
                  >
                    <Ionicons name="folder-outline" size={14} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">Assign</UIText>
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
                <View className="bg-surface-50 rounded-lg p-2 border border-surface-200">
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); handleAssignToTopic(null); }}
                    className={`flex-row items-center gap-2 px-2 py-1.5 rounded ${!currentTopicId ? 'bg-surface-200' : ''}`}
                    disabled={assigning}
                  >
                    <Ionicons name="remove-circle-outline" size={14} color="#9CA3AF" />
                    <UIText size="xs" className="text-typo-500">Unassigned</UIText>
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
                      <UIText size="xs" className={currentTopicId === t.id ? 'font-poppins-medium text-optio-purple' : 'text-typo'}>
                        {t.name}
                      </UIText>
                    </Pressable>
                  ))}
                  <View className="h-px bg-surface-200 my-1" />
                  {showNewTopic ? (
                    <HStack className="items-center gap-1.5 px-2 py-1">
                      <TextInput
                        value={newTopicName}
                        onChangeText={setNewTopicName}
                        placeholder="Topic name"
                        placeholderTextColor="#9CA3AF"
                        autoFocus
                        onSubmitEditing={handleCreateAndAssign}
                        className="flex-1 bg-white rounded px-2 py-1 text-xs border border-surface-200"
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
                        <Ionicons name="close-circle" size={22} color="#9CA3AF" />
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
                </View>
              ) : null}
            </VStack>
          ) : null}

          {/* Description (only if different from title) */}
          {event.description && event.title && event.description !== event.title ? (
            <UIText size="xs" className="text-typo-500" numberOfLines={2}>
              {event.description}
            </UIText>
          ) : null}

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
                    color="#9CA3AF"
                  />
                ))}
              </HStack>
            ) : null}
          </HStack>

          {/* Topic tags */}
          {event.topics && event.topics.length > 0 ? (
            <HStack className="items-center gap-1 flex-wrap">
              {event.topics.map((t) => (
                <View
                  key={`${t.type}-${t.id}`}
                  className="px-1.5 py-0.5 rounded bg-surface-100"
                >
                  <UIText size="xs" className="text-typo-400">
                    {t.name}
                  </UIText>
                </View>
              ))}
            </HStack>
          ) : null}
        </VStack>
      </Card>
    </Pressable>
  );
}
