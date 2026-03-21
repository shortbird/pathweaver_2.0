/**
 * Quest Discovery - Browse and search available quests. Web only.
 */

import React from 'react';
import { View, Image, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuestDiscovery } from '@/src/hooks/useQuests';
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
    <Card variant="elevated" size="sm" className="overflow-hidden">
      {imageUrl && (
        <View className="-mx-3 -mt-3 mb-3">
          <Image source={{ uri: imageUrl }} className="w-full h-36 rounded-t-xl" resizeMode="cover" />
        </View>
      )}
      <VStack space="sm">
        <Heading size="sm" numberOfLines={2}>{quest.title}</Heading>
        <UIText size="xs" className="text-typo-500" numberOfLines={3}>
          {quest.description || quest.big_idea}
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
          <Button size="xs">
            <ButtonText>View</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Card>
  );
}

export default function QuestsScreen() {
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <Ionicons name="desktop-outline" size={40} color="#9CA3AF" />
        <Heading size="sm" className="text-typo-500 mt-3">Desktop Only</Heading>
        <UIText size="sm" className="text-typo-400 mt-1">Quest management is available on desktop.</UIText>
      </SafeAreaView>
    );
  }

  const { quests, topics, loading, search, setSearch, selectedTopic, setSelectedTopic } = useQuestDiscovery();

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          <VStack space="sm">
            <Heading size="2xl">Discover Quests</Heading>
            <UIText className="text-typo-500">Find your next learning adventure</UIText>
          </VStack>

          <Input variant="rounded" size="lg">
            <InputSlot className="ml-3">
              <InputIcon as="search-outline" />
            </InputSlot>
            <InputField placeholder="Search quests..." value={search} onChangeText={setSearch} />
          </Input>

          {topics.length > 0 && (
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
            <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
              {quests.map((q) => (
                <View key={q.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                  <QuestCard quest={q} />
                </View>
              ))}
            </View>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="search-outline" size={40} color="#9CA3AF" />
              <Heading size="sm" className="text-typo-500 mt-3">No quests found</Heading>
              <UIText size="sm" className="text-typo-400 mt-1">Try a different search or topic</UIText>
            </Card>
          )}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
