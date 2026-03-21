/**
 * Unified Feed - Shows activity from the student or linked students.
 *
 * Students see their own completions + learning moments.
 * Parents/advisors/observers see linked students' activity.
 * Infinite scroll with cursor-based pagination.
 */

import React from 'react';
import { View, FlatList, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useFeed } from '@/src/hooks/useFeed';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { VStack, Heading, UIText, Card } from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';

const DESKTOP_BREAKPOINT = 768;

export default function FeedScreen() {
  const { user } = useAuthStore();
  const { items, loading, loadingMore, hasMore, error, loadMore, refetch } = useFeed();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const canSeeStudents = user?.role === 'parent' || user?.role === 'advisor' ||
    user?.role === 'observer' || user?.role === 'superadmin' ||
    user?.org_role === 'parent' || user?.org_role === 'advisor' ||
    user?.org_role === 'observer' || user?.org_role === 'org_admin' ||
    (user as any)?.has_dependents || (user as any)?.has_linked_students ||
    (user as any)?.has_advisor_assignments;

  // Show student avatar/name when viewing multiple students' activity
  const showStudent = canSeeStudents;

  const renderItem = ({ item }: { item: any }) => (
    <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
      <FeedCard item={item} showStudent={showStudent} />
    </View>
  );

  const feedTitle = canSeeStudents ? 'Activity' : 'Feed';

  const renderHeader = () => (
    <>
      <PageHeader title={feedTitle} />
      <View className={`px-5 md:px-0 pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        {isDesktop && (
          <Heading size="xl">{feedTitle}</Heading>
        )}
        <UIText size="sm" className="text-typo-500 mt-1">
          {canSeeStudents
            ? 'Recent activity from your linked students'
            : 'Your recent completions and learning moments'}
        </UIText>
      </View>
    </>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="newspaper-outline" size={40} color="#9CA3AF" />
          <Heading size="sm" className="text-typo-500 mt-3">No activity yet</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 text-center px-4">
            {canSeeStudents
              ? 'Activity from your linked students will appear here.'
              : 'Complete tasks and capture learning moments to build your feed.'}
          </UIText>
        </Card>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#6D469B" />
        </View>
      );
    }
    if (!hasMore && items.length > 0) {
      return (
        <View className="items-center py-6">
          <UIText size="xs" className="text-typo-300">You've reached the end</UIText>
        </View>
      );
    }
    return null;
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6D469B" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshing={false}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
