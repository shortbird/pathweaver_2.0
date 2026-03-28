/**
 * Learning Journal - Capture and organize learning moments.
 *
 * Desktop: sidebar with topics + main content area showing moments.
 * Mobile: toggle between topics list and moment detail view.
 */

import React, { useState } from 'react';
import { View, ScrollView, useWindowDimensions, Platform, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider, Skeleton,
} from '@/src/components/ui';
import { TopicsSidebar } from '@/src/components/journal/TopicsSidebar';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { CaptureModal } from '@/src/components/capture/CaptureModal';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { LearningEventCard } from '@/src/components/journal/LearningEventCard';
import { EditMomentModal } from '@/src/components/journal/EditMomentModal';
import {
  useUnifiedTopics, useUnassignedMoments, useTrackMoments, useQuestMoments,
  deleteInterestTrack, updateInterestTrack, evolveTrackToQuest,
} from '@/src/hooks/useJournal';
import type { LearningEvent } from '@/src/hooks/useJournal';
import api from '@/src/services/api';
import { router } from 'expo-router';

const DESKTOP_BREAKPOINT = 768;

type ViewType = 'unassigned' | 'topic' | 'track' | 'quest';
type MobileTab = 'topics' | 'detail';

export default function JournalScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ViewType>('unassigned');
  const [mobileTab, setMobileTab] = useState<MobileTab>('topics');
  const [captureVisible, setCaptureVisible] = useState(false);
  const [newTopicVisible, setNewTopicVisible] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LearningEvent | null>(null);

  const TOPIC_COLORS = ['#6D469B', '#EF597B', '#3DA24A', '#FF9028', '#2D8CFF', '#E84393'];

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;
    setCreatingTopic(true);
    try {
      const color = TOPIC_COLORS[Math.floor(Math.random() * TOPIC_COLORS.length)];
      await api.post('/api/interest-tracks', {
        name: newTopicName.trim(),
        color,
        icon: 'hardware-chip-outline',
      });
      setNewTopicName('');
      setNewTopicVisible(false);
      refetchTopics();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create topic');
    } finally {
      setCreatingTopic(false);
    }
  };

  const { topics, loading: topicsLoading, refetch: refetchTopics } = useUnifiedTopics();
  const { moments: unassigned, loading: unassignedLoading, refetch: refetchUnassigned } = useUnassignedMoments();
  const { track, moments: trackMoments, loading: trackLoading, refetch: refetchTrack } = useTrackMoments(
    selectedType === 'topic' || selectedType === 'track' ? selectedId : null
  );
  const { moments: questMoments, loading: questLoading, refetch: refetchQuest } = useQuestMoments(
    selectedType === 'quest' ? selectedId : null
  );

  const refetchCurrentView = async () => {
    await Promise.all([
      selectedType === 'unassigned' ? refetchUnassigned() :
      selectedType === 'topic' || selectedType === 'track' ? refetchTrack() :
      selectedType === 'quest' ? refetchQuest() : Promise.resolve(),
      refetchTopics(),
    ]);
  };

  const handleEvolve = async () => {
    if (!selectedId) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Evolve this topic into a quest? Your moments will be linked to the new quest.')
      : true; // Mobile could use Alert, but for now proceed
    if (!confirmed) return;
    try {
      const result = await evolveTrackToQuest(selectedId);
      refetchTopics();
      if (result.quest_id) {
        router.push(`/(app)/quests/${result.quest_id}`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to evolve topic');
    }
  };

  const handleDeleteTopic = async () => {
    if (!selectedId || !track) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${track.name}"? Moments will become unassigned.`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Topic', `Delete "${track.name}"? Moments will become unassigned.`, [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' },
          ]);
        });
    if (!confirmed) return;
    try {
      await deleteInterestTrack(selectedId);
      setSelectedId(null);
      setSelectedType('unassigned');
      refetchTopics();
      refetchUnassigned();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to delete topic');
    }
  };

  const [editingTopicName, setEditingTopicName] = useState(false);
  const [editTopicValue, setEditTopicValue] = useState('');

  const handleStartEditTopic = () => {
    if (track) {
      setEditTopicValue(track.name);
      setEditingTopicName(true);
    }
  };

  const handleSaveTopicName = async () => {
    if (!selectedId || !editTopicValue.trim()) return;
    try {
      await updateInterestTrack(selectedId, { name: editTopicValue.trim() });
      setEditingTopicName(false);
      refetchTopics();
      refetchTrack();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to rename topic');
    }
  };

  const handleSelectUnassigned = () => {
    setSelectedId(null);
    setSelectedType('unassigned');
    if (!isDesktop) setMobileTab('detail');
  };

  const handleSelectTopic = (id: string, type: 'topic' | 'track' | 'quest') => {
    setSelectedId(id);
    setSelectedType(type);
    if (!isDesktop) setMobileTab('detail');
  };

  // Determine which moments to show
  let activeMoments: any[] = [];
  let activeTitle = 'Unassigned Moments';
  let activeSubtitle = '';
  let activeLoading = false;

  if (selectedType === 'unassigned') {
    activeMoments = unassigned;
    activeTitle = 'Unassigned Moments';
    activeSubtitle = `${unassigned.length} moment${unassigned.length !== 1 ? 's' : ''} to organize`;
    activeLoading = unassignedLoading;
  } else if ((selectedType === 'topic' || selectedType === 'track') && track) {
    activeMoments = trackMoments;
    activeTitle = track.name;
    activeSubtitle = track.description || `${trackMoments.length} moment${trackMoments.length !== 1 ? 's' : ''}`;
    activeLoading = trackLoading;
  } else if (selectedType === 'quest') {
    activeMoments = questMoments;
    const questTopic = topics.find((t) => t.id === selectedId);
    activeTitle = questTopic?.name || 'Quest Moments';
    activeSubtitle = `${questMoments.length} moment${questMoments.length !== 1 ? 's' : ''}`;
    activeLoading = questLoading;
  }

  // ── Content panel ──
  const ContentPanel = () => (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <VStack className="px-5 md:px-6 pt-4 pb-12" space="md">
        {/* Header */}
        <VStack>
          <HStack className="items-center justify-between">
            {!isDesktop && (
              <Pressable onPress={() => setMobileTab('topics')} className="mr-3">
                <Ionicons name="arrow-back" size={22} color="#6D469B" />
              </Pressable>
            )}
            <VStack className="flex-1">
              <Heading size="lg" numberOfLines={1}>{activeTitle}</Heading>
              {activeSubtitle ? (
                <UIText size="sm" className="text-typo-500">{activeSubtitle}</UIText>
              ) : null}
            </VStack>
          </HStack>

          {/* Track color bar */}
          {(selectedType === 'topic' || selectedType === 'track') && track?.color && (
            <View
              className="h-1 rounded-full mt-3"
              style={{ backgroundColor: track.color }}
            />
          )}

          {/* Topic actions (edit / delete) */}
          {(selectedType === 'topic' || selectedType === 'track') && track && (
            <HStack className="gap-2 mt-2">
              <Pressable onPress={handleStartEditTopic} className="flex-row items-center gap-1.5 px-3 py-1.5 bg-surface-100 rounded-lg">
                <Ionicons name="create-outline" size={14} color="#6D469B" />
                <UIText size="xs" className="text-optio-purple font-poppins-medium">Rename</UIText>
              </Pressable>
              <Pressable onPress={handleDeleteTopic} className="flex-row items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg">
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                <UIText size="xs" className="text-red-500 font-poppins-medium">Delete</UIText>
              </Pressable>
            </HStack>
          )}

          {/* Rename topic inline */}
          {editingTopicName ? (
            <HStack className="gap-2 mt-2 items-center">
              <TextInput
                value={editTopicValue}
                onChangeText={setEditTopicValue}
                className="flex-1 bg-surface-50 border border-surface-200 rounded-lg p-2 text-sm"
                style={{ fontFamily: 'Poppins_400Regular' }}
                autoFocus
              />
              <Button size="xs" onPress={handleSaveTopicName} disabled={!editTopicValue.trim()}>
                <ButtonText>Save</ButtonText>
              </Button>
              <Pressable onPress={() => setEditingTopicName(false)}>
                <UIText size="xs" className="text-typo-400">Cancel</UIText>
              </Pressable>
            </HStack>
          ) : null}

          {/* Evolved indicator */}
          {(selectedType === 'topic' || selectedType === 'track') && track?.evolved_to_quest_id && (
            <Pressable onPress={() => router.push(`/(app)/quests/${track.evolved_to_quest_id}`)}>
              <Card variant="filled" size="sm" className="mt-3 bg-green-50 border border-green-200">
                <HStack className="items-center gap-3">
                  <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                  <UIText size="sm" className="text-green-700 font-poppins-medium flex-1">
                    This topic has evolved into a quest
                  </UIText>
                  <Ionicons name="chevron-forward" size={16} color="#16A34A" />
                </HStack>
              </Card>
            </Pressable>
          )}

          {/* Evolve prompt for tracks with 5+ moments */}
          {(selectedType === 'topic' || selectedType === 'track') && track && trackMoments.length >= 5 && !track.evolved_to_quest_id && (
            <Card variant="filled" size="sm" className="mt-3">
              <HStack className="items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-optio-purple/10 items-center justify-center">
                  <Ionicons name="sparkles" size={16} color="#6D469B" />
                </View>
                <VStack className="flex-1">
                  <UIText size="sm" className="font-poppins-medium">Ready to evolve!</UIText>
                  <UIText size="xs" className="text-typo-500">
                    This topic has {trackMoments.length} moments. Evolve it into a Quest to earn XP.
                  </UIText>
                </VStack>
                <Button size="xs" onPress={handleEvolve}>
                  <ButtonText>Evolve</ButtonText>
                </Button>
              </HStack>
            </Card>
          )}
        </VStack>

        {/* Loading */}
        {activeLoading && (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color="#6D469B" />
          </View>
        )}

        {/* Moments grid */}
        {!activeLoading && activeMoments.length > 0 && (
          <View className="flex flex-col md:flex-row md:flex-wrap gap-3">
            {activeMoments.map((event: any) => (
              <View key={event.id} className="md:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]">
                <LearningEventCard
                  event={event}
                  onDeleted={refetchCurrentView}
                  onEdit={(e) => setEditingEvent(e)}
                  topics={topics}
                  onAssigned={refetchCurrentView}
                />
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!activeLoading && activeMoments.length === 0 && (
          <Card variant="filled" size="lg" className="items-center py-10">
            <Ionicons
              name={selectedType === 'unassigned' ? 'checkmark-circle-outline' : 'sparkles-outline'}
              size={40}
              color="#9CA3AF"
            />
            <Heading size="sm" className="text-typo-500 mt-3">
              {selectedType === 'unassigned' ? 'All organized!' : 'No moments yet'}
            </Heading>
            <UIText size="sm" className="text-typo-400 mt-1 text-center px-4">
              {selectedType === 'unassigned'
                ? 'All your learning moments have been assigned to topics.'
                : 'Capture a learning moment and assign it to this topic.'}
            </UIText>
          </Card>
        )}
      </VStack>
    </ScrollView>
  );

  // ── Desktop layout ──
  if (isDesktop) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 flex-row">
          {/* Sidebar */}
          <View className="w-72 bg-white border-r border-surface-200 px-3 pt-4">
            <HStack className="items-center justify-between px-3 mb-3">
              <Heading size="md">Journal</Heading>
              <HStack className="items-center gap-2">
                <Pressable
                  onPress={() => setNewTopicVisible(true)}
                  className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center"
                >
                  <Ionicons name="folder-open-outline" size={16} color="#6D469B" />
                </Pressable>
                <Pressable
                  onPress={() => setCaptureVisible(true)}
                  className="w-8 h-8 rounded-full bg-optio-purple items-center justify-center"
                >
                  <Ionicons name="add" size={18} color="white" />
                </Pressable>
              </HStack>
            </HStack>
            <TopicsSidebar
              topics={topics}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectUnassigned={handleSelectUnassigned}
              onSelectTopic={handleSelectTopic}
              unassignedCount={unassigned.length}
            />
          </View>

          {/* Main content */}
          <View className="flex-1">
            <ContentPanel />
          </View>
        </View>
        <CaptureModal
          visible={captureVisible}
          onClose={() => setCaptureVisible(false)}
          onCaptured={() => { refetchUnassigned(); refetchTopics(); }}
        />
        <EditMomentModal
          visible={!!editingEvent}
          event={editingEvent}
          topics={topics}
          onClose={() => setEditingEvent(null)}
          onSaved={refetchCurrentView}
        />
        {/* New Topic Modal (desktop) */}
        <Modal visible={newTopicVisible} transparent animationType="none" onRequestClose={() => setNewTopicVisible(false)}>
          <Pressable className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setNewTopicVisible(false)}>
            <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: 400, maxWidth: '90%' }}>
              <VStack space="md">
                <Heading size="lg">New Topic</Heading>
                <TextInput
                  value={newTopicName}
                  onChangeText={setNewTopicName}
                  placeholder="Topic name (e.g. Robotics Club)"
                  placeholderTextColor="#9CA3AF"
                  className="bg-surface-50 rounded-xl p-4 text-base"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
                <HStack className="gap-3 justify-end">
                  <Button variant="outline" size="md" onPress={() => setNewTopicVisible(false)}>
                    <ButtonText>Cancel</ButtonText>
                  </Button>
                  <Button size="md" onPress={handleCreateTopic} loading={creatingTopic} disabled={!newTopicName.trim() || creatingTopic}>
                    <ButtonText>Create</ButtonText>
                  </Button>
                </HStack>
              </VStack>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Mobile layout ──
  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      {mobileTab === 'topics' ? (
        <VStack className="flex-1">
          <PageHeader title="Journal" />

          {/* Unassigned banner */}
          {unassigned.length > 0 && (
            <Pressable onPress={handleSelectUnassigned} className="mx-5 mb-3">
              <Card variant="filled" size="sm">
                <HStack className="items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-amber-100 items-center justify-center">
                    <Ionicons name="albums-outline" size={16} color="#B45309" />
                  </View>
                  <VStack className="flex-1">
                    <UIText size="sm" className="font-poppins-medium">
                      {unassigned.length} unassigned moment{unassigned.length !== 1 ? 's' : ''}
                    </UIText>
                    <UIText size="xs" className="text-typo-400">Tap to organize</UIText>
                  </VStack>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </HStack>
              </Card>
            </Pressable>
          )}

          <View className="flex-1 px-5">
            <Pressable
              onPress={() => setNewTopicVisible(true)}
              className="flex-row items-center gap-2 mb-3 px-3 py-2.5 bg-optio-purple/10 rounded-xl"
            >
              <Ionicons name="add-circle-outline" size={20} color="#6D469B" />
              <UIText size="sm" className="text-optio-purple font-poppins-medium">New Topic</UIText>
            </Pressable>
            <TopicsSidebar
              topics={topics}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectUnassigned={handleSelectUnassigned}
              onSelectTopic={handleSelectTopic}
              unassignedCount={unassigned.length}
            />
          </View>
        </VStack>
      ) : (
        <ContentPanel />
      )}
      <CaptureSheet
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        onCaptured={() => { refetchUnassigned(); refetchTopics(); }}
      />
      <EditMomentModal
        visible={!!editingEvent}
        event={editingEvent}
        topics={topics}
        onClose={() => setEditingEvent(null)}
        onSaved={refetchCurrentView}
      />

      {/* New Topic Modal */}
      <Modal visible={newTopicVisible} transparent animationType="none" onRequestClose={() => setNewTopicVisible(false)}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setNewTopicVisible(false)} />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
            <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">New Topic</Heading>
                <Pressable onPress={() => setNewTopicVisible(false)} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </HStack>
              <UIText size="sm" className="text-typo-500">
                Create a topic to organize your learning moments.
              </UIText>
              <TextInput
                value={newTopicName}
                onChangeText={setNewTopicName}
                placeholder="Topic name (e.g. Robotics Club)"
                placeholderTextColor="#9CA3AF"
                className="bg-surface-50 rounded-xl p-4 text-base"
                style={{ fontFamily: 'Poppins_400Regular' }}
              />
              <Button size="lg" onPress={handleCreateTopic} loading={creatingTopic} disabled={!newTopicName.trim() || creatingTopic} className="w-full">
                <ButtonText>Create Topic</ButtonText>
              </Button>
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
