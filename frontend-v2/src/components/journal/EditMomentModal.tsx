/**
 * EditMomentModal - Full editing interface for a learning moment.
 *
 * Allows editing title, description, pillars, event date, and topic assignment.
 * Includes AI suggestions for title + pillars from the description.
 * Shows attached evidence (images, videos, text, links, documents) inline.
 * Works on both web (centered dialog) and mobile (bottom sheet).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Modal, Pressable, TextInput, ScrollView, Platform,
  KeyboardAvoidingView, ActivityIndicator, Alert, Image, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, Card, Divider,
} from '../ui';
import { pillarKeys, getPillar } from '@/src/config/pillars';
import { displayImageUrl, isHeicUrl } from '@/src/services/imageUrl';
import type { LearningEvent, UnifiedTopic, EvidenceBlock } from '@/src/hooks/useJournal';
import { updateLearningEvent, getAiSuggestions, assignMomentToTopic } from '@/src/hooks/useJournal';

interface EditMomentModalProps {
  visible: boolean;
  event: LearningEvent | null;
  topics: UnifiedTopic[];
  onClose: () => void;
  onSaved: () => void;
}

function EvidenceBlockView({ block }: { block: EvidenceBlock }) {
  // URL can be in file_url column OR inside content.url (older upload pattern)
  const resolvedUrl = block.file_url || block.content?.url || block.content?.items?.[0]?.url;
  const isImage = block.block_type === 'image' || isHeicUrl(resolvedUrl);
  const imageUrl = displayImageUrl(resolvedUrl);

  if (isImage && imageUrl) {
    return (
      <View className="rounded-xl overflow-hidden border border-surface-200">
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: 200 }}
          resizeMode="cover"
        />
        {block.file_name && (
          <View className="px-3 py-1.5 bg-surface-50">
            <UIText size="xs" className="text-typo-400" numberOfLines={1}>{block.file_name}</UIText>
          </View>
        )}
      </View>
    );
  }

  if (block.block_type === 'video' && resolvedUrl) {
    if (Platform.OS === 'web') {
      return (
        <View className="rounded-xl overflow-hidden border border-surface-200">
          <video
            src={resolvedUrl}
            controls
            style={{ width: '100%', maxHeight: 500, objectFit: 'contain', backgroundColor: '#000', borderRadius: 12 }}
          />
          {block.file_name ? (
            <View className="px-3 py-1.5 bg-surface-50">
              <UIText size="xs" className="text-typo-400" numberOfLines={1}>{block.file_name}</UIText>
            </View>
          ) : null}
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => Linking.openURL(resolvedUrl)}
        className="rounded-xl overflow-hidden border border-surface-200"
      >
        <View className="h-32 bg-surface-100 items-center justify-center">
          <View className="w-14 h-14 rounded-full bg-optio-purple/15 items-center justify-center">
            <Ionicons name="play" size={28} color="#6D469B" />
          </View>
        </View>
        <View className="px-3 py-2 bg-surface-50">
          <UIText size="xs" className="text-typo-500" numberOfLines={1}>
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
      <View className="bg-surface-50 rounded-xl p-4 border border-surface-200">
        <UIText size="sm" className="text-typo">{text}</UIText>
      </View>
    );
  }

  if (block.block_type === 'link') {
    const url = block.content?.url || resolvedUrl || '';
    const linkTitle = block.content?.title || block.file_name || url;
    if (!url) return null;
    return (
      <Pressable
        onPress={() => Linking.openURL(url)}
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
        onPress={() => Linking.openURL(resolvedUrl)}
        className="flex-row items-center gap-3 bg-surface-50 rounded-xl p-3 border border-surface-200"
      >
        <View className="w-10 h-10 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name="document-attach" size={20} color="#6D469B" />
        </View>
        <VStack className="flex-1 min-w-0">
          <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
            {block.file_name || 'Document'}
          </UIText>
          <UIText size="xs" className="text-typo-400">Tap to open</UIText>
        </VStack>
        <Ionicons name="open-outline" size={16} color="#9CA3AF" />
      </Pressable>
    );
  }

  return null;
}

export function EditMomentModal({ visible, event, topics, onClose, onSaved }: EditMomentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
  const [eventDate, setEventDate] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggested, setAiSuggested] = useState(false);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const dateInputRef = useRef<any>(null);

  // Populate form from event
  useEffect(() => {
    if (event && visible) {
      setTitle(event.title || '');
      setDescription(event.description || '');
      setSelectedPillars(event.pillars || []);
      setEventDate(event.event_date ? event.event_date.split('T')[0] : '');
      const trackTopic = event.topics?.find((t) => t.type === 'topic');
      setSelectedTopicId(trackTopic?.id || event.track_id || null);
      setAiSuggested(false);
      setShowTopicPicker(false);
    }
  }, [event, visible]);

  const togglePillar = (key: string) => {
    setSelectedPillars((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleAiSuggest = async () => {
    if (!description.trim() || description.trim().length < 30) {
      Alert.alert('More detail needed', 'Write at least 30 characters for AI suggestions.');
      return;
    }
    setAiLoading(true);
    try {
      const data = await getAiSuggestions(description.trim());
      if (data.success && data.suggestions) {
        if (data.suggestions.title) {
          setTitle(data.suggestions.title);
        }
        if (data.suggestions.pillars?.length > 0) {
          setSelectedPillars(data.suggestions.pillars);
        }
        setAiSuggested(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to get AI suggestions.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!event) return;
    setSaving(true);
    try {
      // Always send the full current state to avoid diff/null edge cases
      await updateLearningEvent(event.id, {
        title: title.trim() || null,
        description: description.trim() || event.description,
        pillars: selectedPillars,
        event_date: eventDate || null,
      });

      // Handle topic assignment change
      const currentTopicId = event.topics?.find((t) => t.type === 'topic')?.id || event.track_id || null;
      if (selectedTopicId !== currentTopicId) {
        if (currentTopicId) {
          await assignMomentToTopic(event.id, 'track', currentTopicId, 'remove');
        }
        if (selectedTopicId) {
          await assignMomentToTopic(event.id, 'track', selectedTopicId, 'add');
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

  if (!event) return null;

  const availableTracks = topics.filter((t) => t.type === 'topic' || t.type === 'track');
  const selectedTopicName = availableTracks.find((t) => t.id === selectedTopicId)?.name;

  const content = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <VStack space="md" className="pb-6">
        {/* Title */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Title</UIText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Add a title (optional)"
            placeholderTextColor="#9CA3AF"
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              fontFamily: 'Poppins_400Regular',
              color: '#1F2937',
            }}
          />
        </VStack>

        {/* Description */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Description</UIText>
          <TextInput
            value={description}
            onChangeText={(text) => { setDescription(text); setAiSuggested(false); }}
            placeholder="What did you learn?"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              fontFamily: 'Poppins_400Regular',
              color: '#1F2937',
              minHeight: 100,
              textAlignVertical: 'top',
            }}
          />
        </VStack>

        {/* AI Suggestions */}
        <Pressable
          onPress={handleAiSuggest}
          disabled={aiLoading || description.trim().length < 30}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: aiSuggested ? '#F0FDF4' : '#F5F0FF',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: aiSuggested ? '#BBF7D0' : '#E8DFFB',
            opacity: description.trim().length < 30 ? 0.5 : 1,
            alignSelf: 'flex-start',
          }}
        >
          {aiLoading ? (
            <ActivityIndicator size="small" color="#6D469B" />
          ) : (
            <Ionicons
              name={aiSuggested ? 'checkmark-circle' : 'sparkles'}
              size={18}
              color={aiSuggested ? '#16A34A' : '#6D469B'}
            />
          )}
          <UIText
            size="sm"
            className="font-poppins-medium"
            style={{ color: aiSuggested ? '#16A34A' : '#6D469B' }}
          >
            {aiLoading ? 'Thinking...' : aiSuggested ? 'Suggestions applied' : 'AI suggest title & pillars'}
          </UIText>
        </Pressable>

        <Divider />

        {/* Pillars */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Pillars</UIText>
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
                    borderColor: selected ? pc.color : '#E5E7EB',
                    backgroundColor: selected ? pc.color + '15' : '#fff',
                  }}
                >
                  <Ionicons
                    name={selected ? pc.iconFilled : pc.icon}
                    size={14}
                    color={selected ? pc.color : '#9CA3AF'}
                  />
                  <UIText
                    size="xs"
                    className="font-poppins-medium"
                    style={{ color: selected ? pc.color : '#6B7280' }}
                  >
                    {pc.label}
                  </UIText>
                </Pressable>
              );
            })}
          </HStack>
        </VStack>

        {/* Event Date */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Date</UIText>
          {Platform.OS === 'web' ? (
            <input
              ref={dateInputRef}
              type="date"
              value={eventDate}
              onChange={(e: any) => setEventDate(e.target.value)}
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                fontFamily: 'Poppins, sans-serif',
                color: eventDate ? '#1F2937' : '#9CA3AF',
                border: 'none',
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <UIText size="sm" style={{ color: eventDate ? '#1F2937' : '#9CA3AF' }}>
                {eventDate || 'Select a date'}
              </UIText>
            </Pressable>
          )}
        </VStack>

        {/* Topic Assignment */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Topic</UIText>
          <Pressable
            onPress={() => setShowTopicPicker(!showTopicPicker)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F9FAFB',
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
                  <UIText size="sm" className="text-typo">{selectedTopicName}</UIText>
                </>
              ) : (
                <UIText size="sm" style={{ color: '#9CA3AF' }}>Unassigned</UIText>
              )}
            </HStack>
            <Ionicons name={showTopicPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
          </Pressable>

          {showTopicPicker && (
            <Card variant="elevated" size="sm" className="mt-1">
              <VStack space="xs">
                <Pressable
                  onPress={() => { setSelectedTopicId(null); setShowTopicPicker(false); }}
                  className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${!selectedTopicId ? 'bg-surface-100' : ''}`}
                >
                  <Ionicons name="remove-circle-outline" size={16} color="#9CA3AF" />
                  <UIText size="sm" className="text-typo-500">Unassigned</UIText>
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
                      className={selectedTopicId === t.id ? 'font-poppins-medium text-optio-purple' : 'text-typo'}
                    >
                      {t.name}
                    </UIText>
                    {selectedTopicId === t.id && (
                      <Ionicons name="checkmark" size={16} color="#6D469B" style={{ marginLeft: 'auto' }} />
                    )}
                  </Pressable>
                ))}

                {availableTracks.length === 0 && (
                  <UIText size="xs" className="text-typo-400 px-3 py-2">
                    No topics yet. Create one from the journal sidebar.
                  </UIText>
                )}
              </VStack>
            </Card>
          )}
        </VStack>

        {/* Evidence — show actual content */}
        {event.evidence_blocks && event.evidence_blocks.length > 0 && (
          <>
            <Divider />
            <VStack space="sm">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">
                Attachments ({event.evidence_blocks.length})
              </UIText>
              {event.evidence_blocks
                .sort((a, b) => a.order_index - b.order_index)
                .map((block, i) => (
                  <EvidenceBlockView key={block.id || i} block={block} />
                ))}
            </VStack>
          </>
        )}

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
              backgroundColor: '#fff',
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
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
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
      <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 32,
            maxHeight: '90%',
          }}
        >
          <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />
          <HStack className="items-center justify-between mb-4">
            <Heading size="lg">Edit Moment</Heading>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center"
            >
              <Ionicons name="close" size={18} color="#6B7280" />
            </Pressable>
          </HStack>
          {content}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
