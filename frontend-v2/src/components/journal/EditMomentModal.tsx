/**
 * EditMomentModal - Full editing interface for a learning moment.
 *
 * Allows editing title, description, pillars, event date, and topic assignment.
 * Shows attached evidence (images, videos, text, links, documents) inline.
 * Works on both web (centered dialog) and mobile (bottom sheet).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Modal, Pressable, TextInput, ScrollView, Platform,
  KeyboardAvoidingView, ActivityIndicator, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { safeOpenURL } from '@/src/utils/linking';
import { Ionicons } from '@expo/vector-icons';
import { enqueueUpload, type QueuedMediaItem } from '@/src/services/uploadQueue';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, Card, Divider,
} from '../ui';
import { pillarKeys, getPillar } from '@/src/config/pillars';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { displayImageUrl, isHeicUrl } from '@/src/services/imageUrl';
import type { LearningEvent, UnifiedTopic, EvidenceBlock } from '@/src/hooks/useJournal';
import {
  updateLearningEvent, assignMomentToTopic,
  updateChildLearningEvent, assignChildMomentToTopic, createTopic,
} from '@/src/hooks/useJournal';

interface EditMomentModalProps {
  visible: boolean;
  event: LearningEvent | null;
  topics: UnifiedTopic[];
  onClose: () => void;
  onSaved: () => void;
  /** When set, the moment belongs to this child and edits route through the
   *  parent-scoped endpoints. Pillar editing is hidden in this mode because the
   *  parent endpoint only persists title/description/date/topic. */
  childId?: string;
}

function EvidenceBlockView({ block }: { block: EvidenceBlock }) {
  const c = useThemeColors();
  // URL can be in file_url column OR inside content.url (older upload pattern)
  const resolvedUrl = block.file_url || block.content?.url || block.content?.items?.[0]?.url;
  const isImage = block.block_type === 'image' || isHeicUrl(resolvedUrl);
  const imageUrl = displayImageUrl(resolvedUrl);

  if (isImage && imageUrl) {
    return (
      <View className="rounded-xl overflow-hidden border border-surface-200 dark:border-dark-surface-300">
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: 200 }}
          resizeMode="cover"
        />
        {block.file_name && (
          <View className="px-3 py-1.5 bg-surface-50 dark:bg-dark-surface-50">
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{block.file_name}</UIText>
          </View>
        )}
      </View>
    );
  }

  if (block.block_type === 'video' && resolvedUrl) {
    if (Platform.OS === 'web') {
      return (
        <View className="rounded-xl overflow-hidden border border-surface-200 dark:border-dark-surface-300">
          <video
            src={resolvedUrl}
            controls
            style={{ width: '100%', maxHeight: 500, objectFit: 'contain', backgroundColor: '#000', borderRadius: 12 }}
          />
          {block.file_name ? (
            <View className="px-3 py-1.5 bg-surface-50 dark:bg-dark-surface-50">
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{block.file_name}</UIText>
            </View>
          ) : null}
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => safeOpenURL(resolvedUrl)}
        className="rounded-xl overflow-hidden border border-surface-200 dark:border-dark-surface-300"
      >
        <View className="h-32 bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
          <View className="w-14 h-14 rounded-full bg-optio-purple/15 items-center justify-center">
            <Ionicons name="play" size={28} color="#6D469B" />
          </View>
        </View>
        <View className="px-3 py-2 bg-surface-50 dark:bg-dark-surface-50">
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>
            {block.file_name || 'Video'}
          </UIText>
        </View>
      </Pressable>
    );
  }

  if (block.block_type === 'text') {
    const text = block.content?.text || block.content?.body || '';
    if (!text) return null;
    return (
      <View className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 border border-surface-200 dark:border-dark-surface-300">
        <UIText size="sm" className="text-typo dark:text-dark-typo">{text}</UIText>
      </View>
    );
  }

  if (block.block_type === 'link') {
    const url = block.content?.url || resolvedUrl || '';
    const linkTitle = block.content?.title || block.file_name || url;
    if (!url) return null;
    return (
      <Pressable
        onPress={() => safeOpenURL(url)}
        className="flex-row items-center gap-3 bg-blue-50 rounded-xl p-3 border border-blue-200"
      >
        <Ionicons name="link" size={20} color="#2469D1" />
        <VStack className="flex-1 min-w-0">
          <UIText size="sm" className="text-blue-700 font-poppins-medium" numberOfLines={1}>{linkTitle}</UIText>
          <UIText size="xs" className="text-blue-500" numberOfLines={1}>{url}</UIText>
        </VStack>
        <Ionicons name="open-outline" size={16} color="#2469D1" />
      </Pressable>
    );
  }

  // Document / fallback
  if (resolvedUrl) {
    return (
      <Pressable
        onPress={() => safeOpenURL(resolvedUrl)}
        className="flex-row items-center gap-3 bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-3 border border-surface-200 dark:border-dark-surface-300"
      >
        <View className="w-10 h-10 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name="document-attach" size={20} color="#6D469B" />
        </View>
        <VStack className="flex-1 min-w-0">
          <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
            {block.file_name || 'Document'}
          </UIText>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Tap to open</UIText>
        </VStack>
        <Ionicons name="open-outline" size={16} color={c.iconMuted} />
      </Pressable>
    );
  }

  return null;
}

export function EditMomentModal({ visible, event, topics, onClose, onSaved, childId }: EditMomentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [eventDate, setEventDate] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  // Inline "create new topic" inside the picker.
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  // Topics created from within this modal, merged into the list + selectable now.
  const [extraTopics, setExtraTopics] = useState<UnifiedTopic[]>([]);
  const dateInputRef = useRef<any>(null);
  const c = useThemeColors();

  // Populate form from event
  useEffect(() => {
    if (event && visible) {
      setTitle(event.title || '');
      setDescription(event.description || '');
      setSelectedPillars(event.pillars || []);
      setEventDate(event.event_date ? event.event_date.split('T')[0] : '');
      const trackTopic = event.topics?.find((t) => t.type === 'topic');
      setSelectedTopicId(trackTopic?.id || event.track_id || null);
      setShowTopicPicker(false);
      setShowCreateTopic(false);
      setNewTopicName('');
      setExtraTopics([]);
    }
  }, [event, visible]);

  const togglePillar = (key: string) => {
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    if (!event) return;
    setSaving(true);
    try {
      // Always send the full current state to avoid diff/null edge cases.
      // Parent mode routes through the child-scoped endpoint, which doesn't
      // accept pillars (see updateChildLearningEvent).
      if (childId) {
        await updateChildLearningEvent(childId, event.id, {
          title: title.trim() || null,
          description: description.trim() || event.description,
          event_date: eventDate || null,
        });
      } else {
        await updateLearningEvent(event.id, {
          title: title.trim() || null,
          description: description.trim() || event.description,
          pillars: selectedPillars,
          event_date: eventDate || null,
        });
      }

      // Handle topic assignment change
      const currentTopicId = event.topics?.find((t) => t.type === 'topic')?.id || event.track_id || null;
      if (selectedTopicId !== currentTopicId) {
        const assign = childId
          ? (id: string, action: 'add' | 'remove') => assignChildMomentToTopic(childId, event.id, 'track', id, action)
          : (id: string, action: 'add' | 'remove') => assignMomentToTopic(event.id, 'track', id, action);
        if (currentTopicId) {
          await assign(currentTopicId, 'remove');
        }
        if (selectedTopicId) {
          await assign(selectedTopicId, 'add');
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to save changes.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  // Attach more evidence to an existing moment. The learning-event evidence
  // endpoint REPLACES a moment's blocks, so we resend every existing block as
  // extraBlocks alongside the newly picked media — otherwise the existing
  // evidence would be wiped. The upload runs in the durable background queue;
  // the new blocks land on the moment once it finishes (journal/feed refetch
  // via onUploadComplete), so we leave the modal open and just confirm.
  const handleAddEvidence = async () => {
    if (!event) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets?.length) return;
    setAddingEvidence(true);
    try {
      const items: QueuedMediaItem[] = result.assets.map((a) => ({
        uri: a.uri,
        type: a.type === 'video' ? 'video' : 'image',
        name: a.fileName || a.uri.split('/').pop() || `evidence.${a.type === 'video' ? 'mp4' : 'jpg'}`,
        fileSize: a.fileSize,
      }));
      const extraBlocks = (event.evidence_blocks || []).map((b) => ({
        block_type: b.block_type,
        content: b.content ?? {},
        file_url: b.file_url,
        file_name: b.file_name,
      }));
      await enqueueUpload({ eventId: event.id, studentId: childId, items, extraBlocks });
      onSaved();
      Alert.alert('Adding evidence', 'Your evidence is uploading and will appear on the moment shortly.');
    } catch {
      Alert.alert('Error', 'Could not add evidence. Please try again.');
    } finally {
      setAddingEvidence(false);
    }
  };

  const handleCreateTopic = async () => {
    const name = newTopicName.trim();
    if (!name || creatingTopic) return;
    setCreatingTopic(true);
    try {
      const track = await createTopic(name, { childId });
      const topic: UnifiedTopic = {
        id: track.id, name: track.name, color: track.color, type: 'topic',
      } as UnifiedTopic;
      setExtraTopics((prev) => [...prev, topic]);
      setSelectedTopicId(track.id);
      setNewTopicName('');
      setShowCreateTopic(false);
      setShowTopicPicker(false);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to create topic');
    } finally {
      setCreatingTopic(false);
    }
  };

  if (!event) return null;

  const availableTracks = [
    ...topics.filter((t) => t.type === 'topic' || t.type === 'track'),
    ...extraTopics,
  ];
  const selectedTopicName = availableTracks.find((t) => t.id === selectedTopicId)?.name;

  const content = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <VStack space="md" className="pb-6">
        {/* Title */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Title</UIText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Add a title (optional)"
            placeholderTextColor={c.textFaint}
            style={{
              backgroundColor: c.background,
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              fontFamily: 'Poppins_400Regular',
              color: c.text,
            }}
          />
        </VStack>

        {/* Description */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Description</UIText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What did you learn?"
            placeholderTextColor={c.textFaint}
            multiline
            numberOfLines={4}
            style={{
              backgroundColor: c.background,
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              fontFamily: 'Poppins_400Regular',
              color: c.text,
              minHeight: 100,
              textAlignVertical: 'top',
            }}
          />
        </VStack>

        {!childId && <Divider />}

        {/* Pillars (self-edit only — parent endpoint doesn't persist pillars) */}
        {!childId && (
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Pillars</UIText>
          <HStack className="flex-wrap gap-2">
            {pillarKeys.map((key) => {
              const pc = getPillar(key);
              const selected = selectedPillars.includes(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => togglePillar(key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: selected ? pc.color : c.border,
                    backgroundColor: selected ? pc.color + '15' : c.card,
                  }}
                >
                  <Ionicons
                    name={selected ? pc.iconFilled : pc.icon}
                    size={14}
                    color={selected ? pc.color : c.iconMuted}
                  />
                  <UIText
                    size="xs"
                    className="font-poppins-medium"
                    style={{ color: selected ? pc.color : c.textMuted }}
                  >
                    {pc.label}
                  </UIText>
                </Pressable>
              );
            })}
          </HStack>
        </VStack>
        )}

        {/* Event Date */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Date</UIText>
          {Platform.OS === 'web' ? (
            <input
              ref={dateInputRef}
              type="date"
              value={eventDate}
              onChange={(e: any) => setEventDate(e.target.value)}
              style={{
                backgroundColor: c.background,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                fontFamily: 'Poppins, sans-serif',
                color: eventDate ? c.text : c.textFaint,
                border: 'none',
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: c.background,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <UIText size="sm" style={{ color: eventDate ? c.text : c.textFaint }}>
                {eventDate || 'Select a date'}
              </UIText>
            </Pressable>
          )}
        </VStack>

        {/* Topic Assignment */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Topic</UIText>
          <Pressable
            onPress={() => setShowTopicPicker(!showTopicPicker)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: c.background,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <HStack className="items-center gap-2 flex-1">
              {selectedTopicId && selectedTopicName ? (
                <>
                  <View
                    className="w-5 h-5 rounded items-center justify-center"
                    style={{
                      backgroundColor: (availableTracks.find((t) => t.id === selectedTopicId)?.color || '#6D469B') + '30',
                    }}
                  >
                    <Ionicons name="folder-outline" size={12} color={availableTracks.find((t) => t.id === selectedTopicId)?.color || '#6D469B'} />
                  </View>
                  <UIText size="sm" className="text-typo dark:text-dark-typo">{selectedTopicName}</UIText>
                </>
              ) : (
                <UIText size="sm" style={{ color: c.textFaint }}>Unassigned</UIText>
              )}
            </HStack>
            <Ionicons name={showTopicPicker ? 'chevron-up' : 'chevron-down'} size={18} color={c.iconMuted} />
          </Pressable>

          {showTopicPicker && (
            <Card variant="elevated" size="sm" className="mt-1">
              <VStack space="xs">
                <Pressable
                  onPress={() => { setSelectedTopicId(null); setShowTopicPicker(false); }}
                  className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${!selectedTopicId ? 'bg-surface-100 dark:bg-dark-surface-200' : ''}`}
                >
                  <Ionicons name="remove-circle-outline" size={16} color={c.iconMuted} />
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Unassigned</UIText>
                </Pressable>

                {availableTracks.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => { setSelectedTopicId(t.id); setShowTopicPicker(false); }}
                    className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${selectedTopicId === t.id ? 'bg-optio-purple/10' : ''}`}
                  >
                    <View
                      className="w-5 h-5 rounded items-center justify-center"
                      style={{ backgroundColor: (t.color || '#6D469B') + '30' }}
                    >
                      <Ionicons name="folder-outline" size={12} color={t.color || '#6D469B'} />
                    </View>
                    <UIText
                      size="sm"
                      className={selectedTopicId === t.id ? 'font-poppins-medium text-optio-purple' : 'text-typo dark:text-dark-typo'}
                    >
                      {t.name}
                    </UIText>
                    {selectedTopicId === t.id && (
                      <Ionicons name="checkmark" size={16} color="#6D469B" style={{ marginLeft: 'auto' }} />
                    )}
                  </Pressable>
                ))}

                {/* Create a new topic inline (no need to leave the modal). */}
                {showCreateTopic ? (
                  <HStack className="items-center gap-2 px-1 py-1">
                    <TextInput
                      value={newTopicName}
                      onChangeText={setNewTopicName}
                      placeholder="New topic name"
                      placeholderTextColor={c.textFaint}
                      autoFocus
                      onSubmitEditing={handleCreateTopic}
                      returnKeyType="done"
                      editable={!creatingTopic}
                      className="flex-1 bg-surface-50 dark:bg-dark-surface-50 rounded-lg px-3 py-2 text-sm text-typo dark:text-dark-typo"
                      style={{ fontFamily: 'Poppins_400Regular' }}
                    />
                    <Pressable
                      onPress={handleCreateTopic}
                      disabled={!newTopicName.trim() || creatingTopic}
                      className="px-3 py-2 rounded-lg bg-optio-purple"
                      style={{ opacity: !newTopicName.trim() || creatingTopic ? 0.5 : 1 }}
                    >
                      {creatingTopic
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <UIText size="sm" className="text-white font-poppins-medium">Add</UIText>}
                    </Pressable>
                  </HStack>
                ) : (
                  <Pressable
                    onPress={() => setShowCreateTopic(true)}
                    className="flex-row items-center gap-2 px-3 py-2 rounded-lg"
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#6D469B" />
                    <UIText size="sm" className="text-optio-purple font-poppins-medium">Create new topic</UIText>
                  </Pressable>
                )}
              </VStack>
            </Card>
          )}
        </VStack>

        {/* Evidence — show actual content + allow attaching more */}
        <>
          <Divider />
          <VStack space="sm">
            {event.evidence_blocks && event.evidence_blocks.length > 0 && (
              <>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">
                  Attachments ({event.evidence_blocks.length})
                </UIText>
                {event.evidence_blocks
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((block, i) => (
                    <EvidenceBlockView key={block.id || i} block={block} />
                  ))}
              </>
            )}
            <Pressable
              onPress={handleAddEvidence}
              disabled={addingEvidence}
              className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-optio-purple/50"
              accessibilityRole="button"
              accessibilityLabel="Add photo or video evidence"
            >
              {addingEvidence ? (
                <ActivityIndicator size="small" color="#6D469B" />
              ) : (
                <Ionicons name="add-circle-outline" size={20} color="#6D469B" />
              )}
              <UIText size="sm" className="text-optio-purple font-poppins-medium">
                {addingEvidence ? 'Adding…' : 'Add photo or video'}
              </UIText>
            </Pressable>
          </VStack>
        </>

        {/* Save button */}
        <Button
          size="lg"
          onPress={handleSave}
          disabled={saving}
          loading={saving}
        >
          <ButtonText>Save Changes</ButtonText>
        </Button>
      </VStack>
    </ScrollView>
  );

  // Desktop: centered dialog
  if (Platform.OS === 'web') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderRadius: 20,
              width: '100%',
              maxWidth: 540,
              maxHeight: '85vh' as any,
              padding: 28,
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            } as any}
          >
            <HStack className="items-center justify-between mb-4">
              <Heading size="lg">Edit Moment</Heading>
              <Pressable
                onPress={onClose}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={18} color={c.icon} />
              </Pressable>
            </HStack>
            {content}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Mobile: bottom sheet
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 32,
            maxHeight: '90%',
          }}
        >
          <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mb-4" />
          <HStack className="items-center justify-between mb-4">
            <Heading size="lg">Edit Moment</Heading>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            >
              <Ionicons name="close" size={18} color={c.icon} />
            </Pressable>
          </HStack>
          {content}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
