/**
 * The Carpool tab: the board. Families post offers/needs and arrange over
 * in-app messaging; students read but cannot post. Its own screen until the
 * hub grew tabs (2026-09-18); the body is unchanged.
 */

import React from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { useSchoolHub } from '@/src/hooks/useSchool';
import CarpoolBoard from './CarpoolBoard';

export function CarpoolTab({ carpool, refreshing, refresh }: {
  carpool: ReturnType<typeof useSchoolHub>['carpool'];
  refreshing: boolean;
  refresh: () => void;
}) {
  const c = useThemeColors();
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-12 max-w-3xl w-full md:mx-auto"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.brand} />}
      testID="school-tab-carpool"
    >
      <CarpoolBoard
        posts={carpool.posts}
        canPost={carpool.canPost}
        canModerate={carpool.canModerate}
        onPost={carpool.post}
        onRemove={carpool.remove}
        defaultOpen
      />
      {/* A student on an empty board (CarpoolBoard renders nothing for
          them — they cannot start it) still deserves an answer. */}
      {carpool.posts.length === 0 && !carpool.canPost && (
        <View className="items-center pt-12 gap-3">
          <Ionicons name="car-outline" size={44} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
            No carpool posts yet.
          </UIText>
        </View>
      )}
    </ScrollView>
  );
}

export default CarpoolTab;
