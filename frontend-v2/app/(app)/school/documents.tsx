/**
 * Documents screen — the school's document library (guidebooks, agreements,
 * waivers). Moved off the hub (2026-08-23 redesign): the hub is the feed plus
 * action chips, and this is the Documents chip's destination.
 *
 * The hub passes the org along (?org=) so this screen never re-guesses it;
 * a direct deep link falls back to the member's own school context.
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api from '@/src/services/api';
import { useSchoolResources } from '@/src/hooks/useSchoolResources';
import { ResourceList } from '@/src/components/school/SchoolResources';

export default function SchoolDocumentsScreen() {
  const c = useThemeColors();
  const { org: orgParam } = useLocalSearchParams<{ org?: string }>();
  const [orgId, setOrgId] = useState<string | null>(
    typeof orgParam === 'string' && orgParam ? orgParam : null,
  );
  const [resolvingOrg, setResolvingOrg] = useState(!orgId);

  useEffect(() => {
    if (orgId) return undefined;
    let active = true;
    api.get('/api/sis/school/context')
      .then(({ data }) => {
        const first = (data?.orgs || [])[0];
        if (active && first) setOrgId(first.organization_id);
      })
      .catch(() => { /* no context — the empty state below covers it */ })
      .finally(() => { if (active) setResolvingOrg(false); });
    return () => { active = false; };
  }, [orgId]);

  const { resources, loading } = useSchoolResources(orgId);

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }} testID="documents-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="xl" style={{ flex: 1 }} numberOfLines={1}>Documents</Heading>
      </View>

      {loading || (!orgId && resolvingOrg) ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : resources.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <Ionicons name="folder-open-outline" size={44} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
            No documents posted yet.
          </UIText>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-2 pb-12 max-w-3xl w-full md:mx-auto"
          showsVerticalScrollIndicator={false}
        >
          <ResourceList resources={resources} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
