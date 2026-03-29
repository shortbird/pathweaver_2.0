/**
 * Quest Discovery - Browse and search available quests. Web only.
 */

import React, { useCallback, useState } from 'react';
import { View, Image, Platform, Pressable, ScrollView, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuestDiscovery } from '@/src/hooks/useQuests';
import { useAuthStore } from '@/src/stores/authStore';
import { CreateQuestModal } from '@/src/components/admin/CreateQuestModal';
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

  return (
    <Card variant="elevated" size="sm" className="overflow-hidden h-full">
      {imageUrl ? (
        <View className="-mx-3 -mt-3 mb-3">
          <Image source={{ uri: imageUrl }} className="w-full h-36 rounded-t-xl" resizeMode="cover" />
        </View>
      ) : (
        <View className="-mx-3 -mt-3 mb-3 h-36 bg-optio-purple/10 items-center justify-center rounded-t-xl">
          <Ionicons name="rocket-outline" size={40} color="#6D469B" />
        </View>
      )}
      <VStack space="sm" className="flex-1">
        <Heading size="sm" numberOfLines={2}>{quest.title}</Heading>
        <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={2}>
          {quest.description}
        </UIText>
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

export default function QuestsScreen() {
  const { quests, topics, loading, loadingMore, hasMore, search, setSearch, selectedTopic, setSelectedTopic, selectedSubtopic, setSelectedSubtopic, subtopics, loadMore, refetch } = useQuestDiscovery();
  const user = useAuthStore((s) => s.user);
  const canCreateQuest = (user && ['superadmin', 'advisor'].includes(user.role)) || (user?.role === 'org_managed' && ['advisor', 'org_admin'].includes(user?.org_role || ''));
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distanceFromBottom < 200) {
      loadMore();
    }
  }, [loadMore]);

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <Ionicons name="desktop-outline" size={40} color="#9CA3AF" />
        <Heading size="sm" className="text-typo-500 mt-3">Desktop Only</Heading>
        <UIText size="sm" className="text-typo-400 mt-1">Quest management is available on desktop.</UIText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={200}>
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          {/* Hero gradient banner */}
          <View className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-2xl px-6 py-8 md:py-10">
            <HStack className="items-center justify-between">
              <VStack space="sm">
                <Heading size="2xl" className="text-white">Discover Quests</Heading>
                <UIText className="text-white/80">Find your next learning adventure</UIText>
              </VStack>
            {canCreateQuest ? (
              <Pressable
                onPress={() => setShowCreateModal(true)}
                className="flex-row items-center gap-1.5 bg-white/20 px-4 py-2 rounded-lg"
              >
                <Ionicons name="add" size={16} color="white" />
                <UIText size="sm" className="text-white font-poppins-medium">Create Quest</UIText>
              </Pressable>
            ) : null}
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
      </ScrollView>

      <CreateQuestModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refetch}
      />
    </SafeAreaView>
  );
}
