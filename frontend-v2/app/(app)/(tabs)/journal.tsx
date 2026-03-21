/**
 * Learning Journal - Capture and organize learning moments.
 *
 * Desktop: sidebar with topics + main content area showing moments.
 * Mobile: toggle between topics list and moment detail view.
 */

import React, { useState } from 'react';
import { View, ScrollView, useWindowDimensions, Platform, Pressable, ActivityIndicator } from 'react-native';
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
import {
  useUnifiedTopics, useUnassignedMoments, useTrackMoments, useQuestMoments,
} from '@/src/hooks/useJournal';

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

  const { topics, loading: topicsLoading, refetch: refetchTopics } = useUnifiedTopics();
  const { moments: unassigned, loading: unassignedLoading, refetch: refetchUnassigned } = useUnassignedMoments();
  const { track, moments: trackMoments, loading: trackLoading } = useTrackMoments(
    selectedType === 'topic' || selectedType === 'track' ? selectedId : null
  );
  const { moments: questMoments, loading: questLoading } = useQuestMoments(
    selectedType === 'quest' ? selectedId : null
  );

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
              {activeSubtitle && (
                <UIText size="sm" className="text-typo-500">{activeSubtitle}</UIText>
              )}
            </VStack>
          </HStack>

          {/* Track color bar */}
          {(selectedType === 'topic' || selectedType === 'track') && track?.color && (
            <View
              className="h-1 rounded-full mt-3"
              style={{ backgroundColor: track.color }}
            />
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
                <Button size="xs">
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
                <LearningEventCard event={event} />
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
              <Pressable
                onPress={() => setCaptureVisible(true)}
                className="w-8 h-8 rounded-full bg-optio-purple items-center justify-center"
              >
                <Ionicons name="add" size={18} color="white" />
              </Pressable>
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
    </SafeAreaView>
  );
}
