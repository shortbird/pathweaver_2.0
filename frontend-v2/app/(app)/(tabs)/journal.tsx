/**
 * Learning Journal - Capture and organize learning moments.
 *
 * Desktop: sidebar with topics + main content area showing moments.
 * Mobile: toggle between topics list and moment detail view.
 */

import React, { useState, useRef } from 'react';
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
import { FeedCard } from '@/src/components/feed/FeedCard';
import { useFeed } from '@/src/hooks/useFeed';
import { QuestTasksSection } from '@/src/components/journal/QuestTasksSection';
import { GenerateTasksModal } from '@/src/components/journal/GenerateTasksModal';
import { ScrollToTopFab } from '@/src/components/ui/ScrollToTopFab';
import {
  useUnifiedTopics, useUnassignedMoments, useTrackMoments, useQuestMoments, useQuestTasks,
  deleteInterestTrack, updateInterestTrack, evolveTrackToQuest,
} from '@/src/hooks/useJournal';
import type { LearningEvent } from '@/src/hooks/useJournal';
import api from '@/src/services/api';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useAuthStore } from '@/src/stores/authStore';

const DESKTOP_BREAKPOINT = 768;

type ViewType = 'unassigned' | 'topic' | 'track' | 'quest';
type MobileTab = 'topics' | 'detail';

/**
 * The Learning Journal. Rendered both as the student's own tab (no props) and
 * as the parent's view of a child's journal (pass `studentId`). In parent mode
 * the same UI is reused, but data + mutations route through the parent-scoped
 * endpoints, edits are limited to moments the parent captured, and the
 * student-only actions that have no parent backend (capture, create/rename/
 * delete/evolve topic, AI task generation) are hidden.
 */
export default function JournalScreen({ studentId, headerTitle }: { studentId?: string; headerTitle?: string } = {}) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isParent = !!studentId;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ViewType>('unassigned');
  const [mobileTab, setMobileTab] = useState<MobileTab>('topics');
  const [captureVisible, setCaptureVisible] = useState(false);
  const [newTopicVisible, setNewTopicVisible] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LearningEvent | null>(null);

  const TOPIC_COLORS = ['#6D469B', '#EF597B', '#3DA24A', '#FF9028', '#2D8CFF', '#E84393'];
  const TOPIC_ICONS: { key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'folder', icon: 'folder-outline' },
    { key: 'star', icon: 'star-outline' },
    { key: 'book', icon: 'book-outline' },
    { key: 'code', icon: 'code-slash-outline' },
    { key: 'paint', icon: 'color-palette-outline' },
    { key: 'music', icon: 'musical-notes-outline' },
    { key: 'science', icon: 'flask-outline' },
    { key: 'heart', icon: 'heart-outline' },
    { key: 'globe', icon: 'globe-outline' },
  ];
  const [selectedColor, setSelectedColor] = useState(TOPIC_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState('folder');

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;
    setCreatingTopic(true);
    try {
      await api.post('/api/interest-tracks', {
        name: newTopicName.trim(),
        color: selectedColor,
        icon: selectedIcon,
      });
      setNewTopicName('');
      setSelectedColor(TOPIC_COLORS[0]);
      setSelectedIcon('folder');
      setNewTopicVisible(false);
      refetchTopics();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create topic');
    } finally {
      setCreatingTopic(false);
    }
  };

  // Activity feed shown below the topics grid: this journal-owner's recent
  // activity (the child's in parent mode, the user's own otherwise). The Feed
  // tab remains the aggregate across all connected students.
  // Always scope the journal's activity feed to the journal owner. Without an
  // explicit id a superadmin gets the GLOBAL feed (every user's activity) — the
  // "this should only show their activity, not everyone they're connected to"
  // report. Falling back to the current user's id scopes it to self.
  const { items: feedItems, loading: feedLoading, removeByLearningEventId } = useFeed({ studentId: studentId ?? currentUserId });
  const { topics, loading: topicsLoading, refetch: refetchTopics } = useUnifiedTopics(studentId);
  const { moments: unassigned, loading: unassignedLoading, refetch: refetchUnassigned, removeMoment: removeUnassigned } = useUnassignedMoments(studentId);
  const { track, moments: trackMoments, loading: trackLoading, refetch: refetchTrack, removeMoment: removeTrackMoment } = useTrackMoments(
    selectedType === 'topic' || selectedType === 'track' ? selectedId : null,
    studentId
  );
  const { moments: questMoments, loading: questLoading, refetch: refetchQuest, removeMoment: removeQuestMoment } = useQuestMoments(
    selectedType === 'quest' ? selectedId : null
  );

  // Delete = optimistic removal from whichever list holds the moment, so the
  // card disappears instantly instead of triggering a full journal reload.
  const removeMomentEverywhere = (id: string) => {
    removeUnassigned(id);
    removeTrackMoment(id);
    removeQuestMoment(id);
    removeByLearningEventId(id); // also drop it from the "Recent activity" feed
  };
  const {
    tasks: questTasks, questTitle: questTasksTitle, loading: questTasksLoading,
    refetch: refetchQuestTasks, generateTasks, acceptTask,
  } = useQuestTasks(selectedType === 'quest' ? selectedId : null);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);

  const refetchCurrentView = async () => {
    await Promise.all([
      selectedType === 'unassigned' ? refetchUnassigned() :
      selectedType === 'topic' || selectedType === 'track' ? refetchTrack() :
      selectedType === 'quest' ? Promise.all([refetchQuest(), refetchQuestTasks()]) : Promise.resolve(),
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
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentScrollRef = useRef<ScrollView>(null);
  useScrollToTop(contentScrollRef);

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
    <ScrollView
      ref={contentScrollRef}
      className="flex-1"
      showsVerticalScrollIndicator={false}
      onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 600)}
      scrollEventThrottle={64}
    >
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
            <Pressable onPress={refetchCurrentView} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
              <Ionicons name="refresh-outline" size={16} color="#6B7280" />
            </Pressable>
          </HStack>

          {/* Track color bar */}
          {(selectedType === 'topic' || selectedType === 'track') && track?.color && (
            <View
              className="h-1 rounded-full mt-3"
              style={{ backgroundColor: track.color }}
            />
          )}

          {/* Topic actions (edit / delete) — parent view is read-only for topics */}
          {!isParent && (selectedType === 'topic' || selectedType === 'track') && track && (
            <HStack className="gap-2 mt-2">
              <Pressable
                onPress={handleStartEditTopic}
                hitSlop={8}
                style={{ minHeight: 36 }}
                className="flex-row items-center gap-1.5 px-3 py-2 bg-surface-100 rounded-lg active:bg-surface-200"
              >
                <Ionicons name="create-outline" size={16} color="#6D469B" />
                <UIText size="xs" className="text-optio-purple font-poppins-medium">Rename</UIText>
              </Pressable>
              <Pressable
                onPress={handleDeleteTopic}
                hitSlop={8}
                style={{ minHeight: 36 }}
                className="flex-row items-center gap-1.5 px-3 py-2 bg-red-50 rounded-lg active:bg-red-100"
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
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

          {/* Evolve prompt for tracks with 5+ moments (student-only) */}
          {!isParent && (selectedType === 'topic' || selectedType === 'track') && track && trackMoments.length >= 5 && !track.evolved_to_quest_id && (
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

        {/* Quest tasks (above moments when viewing a quest) */}
        {selectedType === 'quest' && selectedId && (
          <QuestTasksSection
            tasks={questTasks}
            loading={questTasksLoading}
            onGenerateTasks={() => setGenerateModalVisible(true)}
            questId={selectedId}
          />
        )}

        {/* Divider between tasks and moments */}
        {selectedType === 'quest' && questTasks.length > 0 && activeMoments.length > 0 && (
          <VStack className="mt-2">
            <HStack className="items-center gap-2 mb-1">
              <Ionicons name="journal-outline" size={14} color="#6B6280" />
              <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
                Moments
              </UIText>
            </HStack>
          </VStack>
        )}

        {/* Moments grid */}
        {!activeLoading && activeMoments.length > 0 && (
          <View className="flex flex-col md:flex-row md:flex-wrap gap-3">
            {activeMoments.map((event: any) => {
              // In parent mode a moment is editable only if the parent captured
              // it; the child's own moments are shown read-only.
              const editable = !isParent || (!!currentUserId && event.captured_by_user_id === currentUserId);
              return (
                <View key={event.id} className="md:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)] xl:w-[calc(25%-9px)]">
                  <LearningEventCard
                    event={event}
                    childId={isParent && editable ? studentId : undefined}
                    readOnly={isParent && !editable}
                    onDeleted={() => removeMomentEverywhere(event.id)}
                    onEdit={editable ? (e) => setEditingEvent(e) : undefined}
                    topics={topics}
                    onAssigned={refetchCurrentView}
                  />
                </View>
              );
            })}
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
              {selectedType === 'unassigned' ? 'Nothing to organize' : 'Capture your first moment'}
            </Heading>
            <UIText size="sm" className="text-typo-400 mt-1 text-center px-4">
              {selectedType === 'unassigned'
                ? 'Every moment is tied to a topic or quest. Capture something new with the + button.'
                : 'Tap the + button to save what you just learned — even a few words count.'}
            </UIText>
          </Card>
        )}
      </VStack>
    </ScrollView>
  );

  // ── Desktop layout ──
  if (isDesktop) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
        <View className="flex-1 flex-row">
          {/* Sidebar */}
          <View className="w-72 bg-white dark:bg-dark-surface-100 border-r border-surface-200 dark:border-dark-surface-300 px-3 pt-4">
            <HStack className="items-center justify-between px-3 mb-3">
              <Heading size="md">{headerTitle || 'Journal'}</Heading>
              <HStack className="items-center gap-2">
                <Pressable
                  onPress={refetchCurrentView}
                  className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center"
                >
                  <Ionicons name="refresh-outline" size={16} color="#6B7280" />
                </Pressable>
                {!isParent && (
                  <Pressable
                    onPress={() => setCaptureVisible(true)}
                    className="w-8 h-8 rounded-full bg-optio-purple items-center justify-center"
                  >
                    <Ionicons name="add" size={18} color="white" />
                  </Pressable>
                )}
              </HStack>
            </HStack>
            {/* Quest entry points removed from the Journal — Discover lives on
                Home (Browse All) and New Quest lives inside the Discover sheet. */}
            <TopicsSidebar
              topics={topics}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectUnassigned={handleSelectUnassigned}
              onSelectTopic={handleSelectTopic}
              unassignedCount={unassigned.length}
              unassignedLoading={unassignedLoading}
              onNewTopic={isParent ? undefined : () => setNewTopicVisible(true)}
              loading={topicsLoading}
            />
          </View>

          {/* Main content */}
          <View className="flex-1">
            {ContentPanel()}
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
          childId={studentId}
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
                {/* Icon picker */}
                <VStack space="xs">
                  <UIText size="xs" className="text-typo-400 font-poppins-medium">Icon</UIText>
                  <HStack className="flex-wrap gap-2">
                    {TOPIC_ICONS.map((item) => (
                      <Pressable
                        key={item.key}
                        onPress={() => setSelectedIcon(item.key)}
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: selectedIcon === item.key ? selectedColor + '20' : '#F3F4F6',
                          borderWidth: selectedIcon === item.key ? 2 : 0,
                          borderColor: selectedColor,
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={item.icon} size={18} color={selectedIcon === item.key ? selectedColor : '#6B7280'} />
                      </Pressable>
                    ))}
                  </HStack>
                </VStack>
                {/* Color picker */}
                <VStack space="xs">
                  <UIText size="xs" className="text-typo-400 font-poppins-medium">Color</UIText>
                  <HStack className="gap-2">
                    {TOPIC_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => setSelectedColor(color)}
                        style={{
                          width: 32, height: 32, borderRadius: 16,
                          backgroundColor: color,
                          borderWidth: selectedColor === color ? 3 : 0,
                          borderColor: '#1F2937',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {selectedColor === color && <Ionicons name="checkmark" size={16} color="white" />}
                      </Pressable>
                    ))}
                  </HStack>
                </VStack>
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

        {/* AI Task Generation Modal (desktop) */}
        <GenerateTasksModal
          visible={generateModalVisible}
          questTitle={questTasksTitle}
          onClose={() => setGenerateModalVisible(false)}
          onGenerate={generateTasks}
          onAcceptTask={acceptTask}
        />

        <ScrollToTopFab
          visible={showScrollTop}
          onPress={() => contentScrollRef.current?.scrollTo({ y: 0, animated: true })}
          bottomOffset={24}
        />
      </SafeAreaView>
    );
  }

  // ── Mobile layout ──
  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      {mobileTab === 'topics' ? (
        <VStack className="flex-1">
          {isParent ? (
            <HStack className="items-center gap-2 px-4 py-3">
              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                accessibilityLabel="Go back"
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={24} color="#1F1B29" />
              </Pressable>
              <Heading size="lg" numberOfLines={1} className="flex-1">{headerTitle || 'Journal'}</Heading>
            </HStack>
          ) : (
            <PageHeader title="Journal" />
          )}

          {/* Unassigned now lives as the first tile inside the Topics grid
              (see TopicsSidebar.UnassignedTile) — no separate banner needed. */}

          <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            {/* Topics grid (no inner scroll — it shares this ScrollView with the
                activity feed below). */}
            <TopicsSidebar
              topics={topics}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelectUnassigned={handleSelectUnassigned}
              onSelectTopic={handleSelectTopic}
              unassignedCount={unassigned.length}
              unassignedLoading={unassignedLoading}
              onNewTopic={isParent ? undefined : () => setNewTopicVisible(true)}
              loading={topicsLoading}
              scrollable={false}
            />

            {/* Activity feed below the topics — this journal owner's recent
                activity. The Feed tab remains the all-students aggregate. */}
            <VStack space="sm" className="mt-4">
              <Heading size="md">Recent Activity</Heading>
              {feedLoading && feedItems.length === 0 ? (
                <VStack space="sm">
                  <Skeleton className="h-28 rounded-xl" />
                  <Skeleton className="h-28 rounded-xl" />
                </VStack>
              ) : feedItems.length > 0 ? (
                <VStack space="sm">
                  {feedItems.map((item: any) => (
                    <FeedCard key={item.id} item={item} showStudent={false} viewerCanModerate={isParent} />
                  ))}
                </VStack>
              ) : (
                <Card variant="filled" size="md" className="items-center py-8">
                  <Ionicons name="newspaper-outline" size={32} color="#9CA3AF" />
                  <UIText size="sm" className="text-typo-400 mt-2">No recent activity yet</UIText>
                </Card>
              )}
            </VStack>
          </ScrollView>
        </VStack>
      ) : (
        ContentPanel()
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
        childId={studentId}
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
              {/* Icon picker */}
              <VStack space="xs">
                <UIText size="xs" className="text-typo-400 font-poppins-medium">Icon</UIText>
                <HStack className="flex-wrap gap-2">
                  {TOPIC_ICONS.map((item) => (
                    <Pressable
                      key={item.key}
                      onPress={() => setSelectedIcon(item.key)}
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: selectedIcon === item.key ? selectedColor + '20' : '#F3F4F6',
                        borderWidth: selectedIcon === item.key ? 2 : 0,
                        borderColor: selectedColor,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={item.icon} size={18} color={selectedIcon === item.key ? selectedColor : '#6B7280'} />
                    </Pressable>
                  ))}
                </HStack>
              </VStack>
              {/* Color picker */}
              <VStack space="xs">
                <UIText size="xs" className="text-typo-400 font-poppins-medium">Color</UIText>
                <HStack className="gap-2">
                  {TOPIC_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setSelectedColor(color)}
                      style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: color,
                        borderWidth: selectedColor === color ? 3 : 0,
                        borderColor: '#1F2937',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {selectedColor === color && <Ionicons name="checkmark" size={16} color="white" />}
                    </Pressable>
                  ))}
                </HStack>
              </VStack>
              <Button size="lg" onPress={handleCreateTopic} loading={creatingTopic} disabled={!newTopicName.trim() || creatingTopic} className="w-full">
                <ButtonText>Create Topic</ButtonText>
              </Button>
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* AI Task Generation Modal */}
      <GenerateTasksModal
        visible={generateModalVisible}
        questTitle={questTasksTitle}
        onClose={() => setGenerateModalVisible(false)}
        onGenerate={generateTasks}
        onAcceptTask={acceptTask}
      />

    </SafeAreaView>
  );
}
