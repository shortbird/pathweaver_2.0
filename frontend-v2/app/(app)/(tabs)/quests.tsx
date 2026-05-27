/**
 * Quest Discovery - Browse, search, and create quests.
 * Single canonical destination: Home's "Browse All" routes here.
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, Image, Platform, Pressable, ScrollView, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuestDiscovery } from '@/src/hooks/useQuests';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { BountiesView } from '@/src/components/bounties/BountiesView';
import { ScrollToTopFab } from '@/src/components/ui/ScrollToTopFab';
import { CreateQuestSheet } from '@/src/components/journal/CreateQuestSheet';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Skeleton, Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';

const pillarColors: Record<string, string> = {
  stem: 'bg-pillar-stem', art: 'bg-pillar-art', communication: 'bg-pillar-communication',
  civics: 'bg-pillar-civics', wellness: 'bg-pillar-wellness',
};

function QuestCard({ quest }: { quest: any }) {
  const imageUrl = quest.header_image_url || quest.image_url;

  // No h-full / flex-1 here — on mobile (single column, no parent height) those
  // caused each card to stretch to viewport height, so only one card was
  // visible and pagination never fired. Cards size to content instead.
  return (
    <Card variant="elevated" size="sm" className="overflow-hidden">
      {imageUrl ? (
        <View className="-mx-3 -mt-3 mb-3">
          <Image source={{ uri: imageUrl }} className="w-full h-36 rounded-t-xl" resizeMode="cover" />
        </View>
      ) : (
        <View className="-mx-3 -mt-3 mb-3 h-36 bg-optio-purple/10 items-center justify-center rounded-t-xl">
          <Ionicons name="rocket-outline" size={40} color="#6D469B" />
        </View>
      )}
      <VStack space="sm">
        <Heading size="sm" numberOfLines={2}>{quest.title}</Heading>
        {quest.description ? (
          <UIText size="xs" className="text-typo-500" numberOfLines={2}>
            {quest.description}
          </UIText>
        ) : null}
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-2">
            {quest.pillar && (
              <View className={`px-2 py-0.5 rounded-full ${pillarColors[quest.pillar] || 'bg-surface-200'}/15`}>
                <UIText size="xs" className="font-poppins-medium text-typo-500 capitalize">
                  {quest.pillar === 'stem' ? 'STEM' : quest.pillar}
                </UIText>
              </View>
            )}
            {quest.enrollmentCount > 0 && (
              <UIText size="xs" className="text-typo-400">
                {quest.enrollmentCount} enrolled
              </UIText>
            )}
          </HStack>
          <Button size="xs" onPress={() => router.push(`/(app)/quests/${quest.id}`)}>
            <ButtonText>View</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Card>
  );
}

type TopSegment = 'quests' | 'bounties';

const TOP_SEGMENTS: { key: TopSegment; label: string }[] = [
  { key: 'quests', label: 'Quests' },
  { key: 'bounties', label: 'Bounties' },
];

export default function QuestsScreen() {
  const { quests, topics, loading, loadingMore, hasMore, search, setSearch, selectedTopic, setSelectedTopic, selectedSubtopic, setSelectedSubtopic, subtopics, loadMore, refetch } = useQuestDiscovery();
  const [topSegment, setTopSegment] = useState<TopSegment>('quests');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    // Show the scroll-to-top FAB once the user is past ~600px in.
    setShowScrollTop(contentOffset.y > 600);
    // Only paginate quest list scrolls; bounties view manages its own data.
    if (topSegment !== 'quests') return;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distanceFromBottom < 200) {
      loadMore();
    }
  }, [loadMore, topSegment]);

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <PageHeader title="Quests" />
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="pt-2 md:pt-6 pb-12" showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={64}>
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          {/* Top-level segment toggle: Quests / Bounties */}
          <View style={{ paddingHorizontal: 20 }}>
            <HStack space="xs">
              {TOP_SEGMENTS.map((seg) => (
                <Pressable
                  key={seg.key}
                  onPress={() => setTopSegment(seg.key)}
                  className={`flex-1 py-2.5 rounded-lg items-center ${topSegment === seg.key ? 'bg-white' : ''}`}
                >
                  <UIText size="sm" className={topSegment === seg.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>
                    {seg.label}
                  </UIText>
                </Pressable>
              ))}
            </HStack>
          </View>

          {topSegment === 'bounties' && <BountiesView />}

          {topSegment === 'quests' && (
            <VStack space="lg" className="px-5 md:px-8">

          {/* Hero banner — Tailwind's bg-gradient-* classes don't render in
              NativeWind, so we use a solid purple background everywhere and
              paint a gradient via raw CSS on web only (matches BrandHeader). */}
          <View
            className="rounded-2xl px-6 py-8 md:py-10"
            style={{
              backgroundColor: '#6D469B',
              ...(Platform.OS === 'web'
                ? { backgroundImage: 'linear-gradient(90deg, #6D469B 0%, #EF597B 100%)' }
                : {}),
            }}
          >
            <HStack className="items-center justify-between gap-3">
              <VStack space="sm" className="flex-1 min-w-0">
                <Heading size="2xl" style={{ color: '#FFFFFF' }}>Discover Quests</Heading>
                <UIText style={{ color: 'rgba(255,255,255,0.85)' }}>Browse the library or build your own</UIText>
              </VStack>
              <Pressable
                onPress={() => setCreateVisible(true)}
                accessibilityLabel="Create a new quest"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <UIText size="sm" style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' }}>
                  New quest
                </UIText>
              </Pressable>
            </HStack>
          </View>

          <Input variant="rounded" size="lg">
            <InputSlot className="ml-3">
              <InputIcon as="search-outline" />
            </InputSlot>
            <InputField placeholder="Search quests..." value={search} onChangeText={setSearch} />
          </Input>

          {topics.length > 0 && (
            <VStack space="sm">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <HStack space="sm">
                  <Pressable onPress={() => setSelectedTopic(null)}>
                    <View className={`px-4 py-2 rounded-full ${!selectedTopic ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                      <UIText size="sm" className={`font-poppins-medium ${!selectedTopic ? 'text-white' : 'text-typo-500'}`}>All</UIText>
                    </View>
                  </Pressable>
                  {topics.map((t) => (
                    <Pressable key={t.name} onPress={() => setSelectedTopic(t.name)}>
                      <View className={`px-4 py-2 rounded-full ${selectedTopic === t.name ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                        <UIText size="sm" className={`font-poppins-medium ${selectedTopic === t.name ? 'text-white' : 'text-typo-500'}`}>
                          {t.name} ({t.count})
                        </UIText>
                      </View>
                    </Pressable>
                  ))}
                </HStack>
              </ScrollView>

              {selectedTopic && subtopics.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <HStack space="xs" className="items-center">
                    <UIText size="xs" className="text-typo-400 mr-1">Filter by:</UIText>
                    {subtopics.map((st) => (
                      <Pressable key={st} onPress={() => setSelectedSubtopic(selectedSubtopic === st ? null : st)}>
                        <View className={`px-3 py-1.5 rounded-full border ${selectedSubtopic === st ? 'bg-optio-purple border-optio-purple' : 'bg-surface-100 border-surface-300'}`}>
                          <UIText size="xs" className={`font-poppins-medium ${selectedSubtopic === st ? 'text-white' : 'text-typo-500'}`}>
                            {st}
                          </UIText>
                        </View>
                      </Pressable>
                    ))}
                  </HStack>
                </ScrollView>
              )}
            </VStack>
          )}

          {loading ? (
            <View className="flex flex-row flex-wrap gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} className="w-full md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                  <Skeleton className="h-64 rounded-xl" />
                </View>
              ))}
            </View>
          ) : quests.length > 0 ? (
            <>
              <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
                {quests.map((q) => (
                  <View key={q.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                    <QuestCard quest={q} />
                  </View>
                ))}
              </View>
              {loadingMore && (
                <View className="items-center py-6">
                  <ActivityIndicator size="small" color="#6D469B" />
                </View>
              )}
              {!hasMore && quests.length > 0 && (
                <UIText size="sm" className="text-typo-400 text-center py-4">All quests loaded</UIText>
              )}
            </>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="search-outline" size={40} color="#9CA3AF" />
              <Heading size="sm" className="text-typo-500 mt-3">No quests found</Heading>
              <UIText size="sm" className="text-typo-400 mt-1">Try a different search or topic</UIText>
            </Card>
          )}
            </VStack>
          )}

        </VStack>
      </ScrollView>

      <CreateQuestSheet
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={() => { setCreateVisible(false); refetch(); }}
      />

      <ScrollToTopFab
        visible={showScrollTop}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      />
    </SafeAreaView>
  );
}
