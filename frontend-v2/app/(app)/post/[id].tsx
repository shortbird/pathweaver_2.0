/**
 * Post detail - a single feed post on its own page.
 *
 * Feed cards are tappable (bug report: "these posts feel like they should be
 * tappable to open the post in its own page"). The tapped FeedItem is handed in
 * via feedDetailStore; we render the same FeedCard here so likes/comments/share
 * all work, just full-screen with a back header.
 */

import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText } from '@/src/components/ui';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { useFeedDetailStore } from '@/src/stores/feedDetailStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export default function PostDetailScreen() {
  const item = useFeedDetailStore((s) => s.item);
  const c = useThemeColors();

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100">
        <Pressable onPress={() => router.back()} hitSlop={8} className="mr-2 p-1" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color="#6D469B" />
        </Pressable>
        <Heading size="md">Post</Heading>
      </View>

      {item ? (
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          <View className="max-w-2xl w-full mx-auto">
            <FeedCard item={item} showStudent />
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="document-outline" size={40} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3 text-center">
            This post is no longer available.
          </UIText>
        </View>
      )}
    </SafeAreaView>
  );
}
