/**
 * Quest Discovery - Browse, search, and create quests.
 * Single canonical destination: Home's "Browse All" routes here.
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, Image, Pressable, ScrollView, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { useQuestDiscovery } from '@/src/hooks/useQuests';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useStartSomethingStore } from '@/src/stores/startSomethingStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { CreateQuestSheet } from '@/src/components/journal/CreateQuestSheet';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Skeleton, Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';

const pillarColors: Record<string, string> = {
  stem: 'bg-pillar-stem', art: 'bg-pillar-art', communication: 'bg-pillar-communication',
  civics: 'bg-pillar-civics', wellness: 'bg-pillar-wellness',
};

function QuestCard({ quest, forChildName, onAdd, adding }: {
  quest: any;
  /** When set, the card is in parent-for-child mode: the action adds the quest
   *  to the child's account instead of opening the student quest page. */
  forChildName?: string | null;
  onAdd?: (questId: string) => void;
  adding?: boolean;
}) {
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
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>
            {quest.description}
          </UIText>
        ) : null}
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-2">
            {quest.pillar && (
              <View className={`px-2 py-0.5 rounded-full ${pillarColors[quest.pillar] || 'bg-surface-200 dark:bg-dark-surface-300'}/15`}>
                <UIText size="xs" className="font-poppins-medium text-typo-500 dark:text-dark-typo-500 capitalize">
                  {quest.pillar === 'stem' ? 'STEM' : quest.pillar}
                </UIText>
              </View>
            )}
            {quest.enrollmentCount > 0 && (
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                {quest.enrollmentCount} enrolled
              </UIText>
            )}
          </HStack>
          {forChildName ? (
            <Button size="xs" onPress={() => onAdd?.(quest.id)} loading={!!adding} disabled={!!adding}>
              <ButtonText>Add</ButtonText>
            </Button>
          ) : (
            <Button size="xs" onPress={() => router.push(`/(app)/quests/${quest.id}`)}>
              <ButtonText>View</ButtonText>
            </Button>
          )}
        </HStack>
      </VStack>
    </Card>
  );
}

/**
 * Filter chip container. Scrolls horizontally on phones; wraps into rows on
 * large screens where a hidden horizontal scrollbar would read as mobile-only.
 */
function FilterRail({ wrap, children }: { wrap: boolean; children: React.ReactNode }) {
  if (wrap) {
    return <View className="flex-row flex-wrap gap-2 items-center">{children}</View>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <HStack space="sm" className="items-center">{children}</HStack>
    </ScrollView>
  );
}

export default function QuestsScreen() {
  const { quests, topics, loading, loadingMore, hasMore, search, setSearch, selectedTopic, setSelectedTopic, selectedSubtopic, setSelectedSubtopic, subtopics, loadMore, refetch } = useQuestDiscovery();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  // On desktop/tablet the filter chips wrap into rows instead of scrolling
  // horizontally — there's room, and a hidden horizontal scrollbar reads as
  // mobile-only chrome.
  const { isLargeScreen } = useBreakpoint();
  const openCreateQuest = useStartSomethingStore((s) => s.openCreateQuest);
  const c = useThemeColors();

  // Parent-for-child mode: when navigated here from the Family dashboard with a
  // child target, creating or adding a quest lands on the CHILD's account.
  const params = useLocalSearchParams<{ forChildId?: string; forChildName?: string }>();
  const forChildId = typeof params.forChildId === 'string' ? params.forChildId : null;
  const forChildName = typeof params.forChildName === 'string' ? params.forChildName : 'your child';
  const forChild = forChildId ? { id: forChildId, name: forChildName } : null;
  const [createForChildOpen, setCreateForChildOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const addQuestForChild = useCallback(async (questId: string) => {
    if (!forChildId) return;
    setAddingId(questId);
    try {
      await api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: [forChildId] });
      router.push(`/parent/quest/${forChildId}/${questId}` as any);
    } catch (e: any) {
      Alert.alert('Could not add quest', e?.response?.data?.error || 'Failed to add this quest. Try again.');
    } finally {
      setAddingId(null);
    }
  }, [forChildId]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distanceFromBottom < 200) {
      loadMore();
    }
  }, [loadMore]);

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <PageHeader title="Quests" />
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="pt-2 md:pt-6 pb-4" showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={64}>
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          <VStack space="lg" className="px-5 md:px-8">

          {forChild && (
            <Card variant="filled" size="md" className="bg-optio-purple/10">
              <HStack className="items-center gap-3">
                <View className="w-9 h-9 rounded-full bg-optio-purple/15 items-center justify-center">
                  <Ionicons name="people-outline" size={18} color="#6D469B" />
                </View>
                <VStack className="flex-1 min-w-0">
                  <UIText size="sm" className="font-poppins-semibold text-optio-purple" numberOfLines={1}>
                    Adding for {forChildName}
                  </UIText>
                  <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>
                    Anything you create or add goes to their account.
                  </UIText>
                </VStack>
                <Pressable onPress={() => router.back()} hitSlop={8}>
                  <UIText size="sm" className="text-optio-purple font-poppins-semibold">Done</UIText>
                </Pressable>
              </HStack>
            </Card>
          )}

          <Button
            size="lg"
            onPress={forChild ? () => setCreateForChildOpen(true) : openCreateQuest}
            testID="quests-create-your-own"
          >
            <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
            <ButtonText>{forChild ? `Create a quest for ${forChildName}` : 'Create your own quest'}</ButtonText>
          </Button>

          <Input variant="rounded" size="lg">
            <InputSlot className="ml-3">
              <InputIcon as="search-outline" />
            </InputSlot>
            <InputField placeholder="Search quests..." value={search} onChangeText={setSearch} />
          </Input>

          {topics.length > 0 && (
            <VStack space="sm">
              <FilterRail wrap={isLargeScreen}>
                  <Pressable onPress={() => setSelectedTopic(null)}>
                    <View className={`px-4 py-2 rounded-full ${!selectedTopic ? 'bg-optio-purple' : 'bg-surface-200 dark:bg-dark-surface-300'}`}>
                      <UIText size="sm" className={`font-poppins-medium ${!selectedTopic ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>All</UIText>
                    </View>
                  </Pressable>
                  {topics.map((t) => (
                    <Pressable key={t.name} onPress={() => setSelectedTopic(t.name)}>
                      <View className={`px-4 py-2 rounded-full ${selectedTopic === t.name ? 'bg-optio-purple' : 'bg-surface-200 dark:bg-dark-surface-300'}`}>
                        <UIText size="sm" className={`font-poppins-medium ${selectedTopic === t.name ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                          {t.name} ({t.count})
                        </UIText>
                      </View>
                    </Pressable>
                  ))}
              </FilterRail>

              {selectedTopic && subtopics.length > 0 && (
                <FilterRail wrap={isLargeScreen}>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mr-1">Filter by:</UIText>
                    {subtopics.map((st) => (
                      <Pressable key={st} onPress={() => setSelectedSubtopic(selectedSubtopic === st ? null : st)}>
                        <View className={`px-3 py-1.5 rounded-full border ${selectedSubtopic === st ? 'bg-optio-purple border-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200 border-surface-300 dark:border-dark-surface-300'}`}>
                          <UIText size="xs" className={`font-poppins-medium ${selectedSubtopic === st ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                            {st}
                          </UIText>
                        </View>
                      </Pressable>
                    ))}
                </FilterRail>
              )}
            </VStack>
          )}

          {loading ? (
            <View className="flex flex-row flex-wrap gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} className="w-full md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)] xl:w-[calc(25%-12px)]">
                  <Skeleton className="h-64 rounded-xl" />
                </View>
              ))}
            </View>
          ) : quests.length > 0 ? (
            <>
              <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
                {quests.map((q) => (
                  <View key={q.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)] xl:w-[calc(25%-12px)]">
                    <QuestCard
                      quest={q}
                      forChildName={forChild ? forChildName : null}
                      onAdd={addQuestForChild}
                      adding={addingId === q.id}
                    />
                  </View>
                ))}
              </View>
              {loadingMore && (
                <View className="items-center py-6">
                  <ActivityIndicator size="small" color="#6D469B" />
                </View>
              )}
              {!hasMore && quests.length > 0 && (
                <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center py-4">All quests loaded</UIText>
              )}
            </>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="search-outline" size={40} color={c.iconMuted} />
              <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">No quests found</Heading>
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1">Try a different search or topic</UIText>
            </Card>
          )}
          </VStack>

        </VStack>
      </ScrollView>

      {/* Create-for-child sheet — reuses the student CreateQuestSheet. */}
      {forChild && (
        <CreateQuestSheet
          visible={createForChildOpen}
          onClose={() => setCreateForChildOpen(false)}
          forChild={forChild}
          onCreated={() => setCreateForChildOpen(false)}
        />
      )}

    </SafeAreaView>
  );
}
