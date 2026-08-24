/**
 * Carpool board screen — the board moved off the hub (2026-08-23 redesign):
 * the hub is the feed plus action chips, and this is the Carpool chip's
 * destination. Same board, same rules: families post offers/needs and arrange
 * over in-app messaging; students read but cannot post.
 */

import React from 'react';
import { View, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useSchoolHub } from '@/src/hooks/useSchool';
import CarpoolBoard from '@/src/components/school/CarpoolBoard';

export default function SchoolCarpoolScreen() {
  const c = useThemeColors();
  const { feed, carpool, loading, refreshing, refresh } = useSchoolHub();

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }} testID="carpool-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="xl" style={{ flex: 1 }} numberOfLines={1}>Carpool board</Heading>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-2 pb-12 max-w-3xl w-full md:mx-auto"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.brand} />
          }
        >
          {feed !== null && (
            <CarpoolBoard
              posts={carpool.posts}
              canPost={carpool.canPost}
              canModerate={carpool.canModerate}
              onPost={carpool.post}
              onRemove={carpool.remove}
              onMessage={carpool.message}
              defaultOpen
            />
          )}
          {/* A student on an empty board (CarpoolBoard renders nothing for
              them — they cannot start it) still deserves an answer. */}
          {feed !== null && carpool.posts.length === 0 && !carpool.canPost && (
            <View className="items-center pt-12 gap-3">
              <Ionicons name="car-outline" size={44} color={c.iconMuted} />
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
                No carpool posts yet.
              </UIText>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
