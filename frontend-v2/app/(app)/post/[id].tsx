/**
 * Post detail - a single feed post on its own page.
 *
 * Feed cards are tappable (bug report: "these posts feel like they should be
 * tappable to open the post in its own page"). The tapped FeedItem is handed in
 * via feedDetailStore; we render the same FeedCard here so likes/comments/share
 * all work, just full-screen with a back header.
 */

import React from 'react';
import { View, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText } from '@/src/components/ui';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { PostComments } from '@/src/components/feed/PostComments';
import { useFeedDetailStore } from '@/src/stores/feedDetailStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { safeOpenURL } from '@/src/utils/linking';

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
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View className="max-w-2xl w-full mx-auto">
              <FeedCard item={item} showStudent />
              {/* View portfolio — opens the student's public web portfolio
                  (bug #11). Only shown when the feed payload includes a slug. */}
              {item.student?.portfolio_slug ? (
                <Pressable
                  onPress={() => safeOpenURL(`https://www.optioeducation.com/portfolio/${item.student.portfolio_slug}`)}
                  className="mt-4 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-optio-purple/10 active:bg-optio-purple/20"
                  style={{ minHeight: 44 }}
                >
                  <Ionicons name="person-circle-outline" size={18} color="#6D469B" />
                  <UIText size="sm" className="text-optio-purple font-poppins-semibold">
                    View {item.student.display_name || 'student'}'s portfolio
                  </UIText>
                </Pressable>
              ) : null}

              {/* All comments shown inline on the post page. */}
              <PostComments item={item} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
