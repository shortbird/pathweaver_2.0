/**
 * School hub — everything a member gets from their school, in one place,
 * titled with the school's name. The mobile counterpart of the web /school
 * page: community sections lead (short and timely), the carpool board follows,
 * and the two deeper surfaces (message archive, absence reporting) are doors
 * at the top rather than content inline — the archive paginates, and burying
 * the community sections under twenty messages was the web page's original
 * layout bug.
 *
 * Copy note (iCreate, 2026-08-06): the word "school" is unwelcome — "iCreate
 * is an education center". Where a sentence needs a subject, use the org's own
 * name.
 */

import React from 'react';
import { View, Image, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useSchool, useSchoolHub, hasCommunityContent } from '@/src/hooks/useSchool';
import SchoolCommunity from '@/src/components/school/SchoolCommunity';
import CarpoolBoard from '@/src/components/school/CarpoolBoard';
import ClassSchedule from '@/src/components/school/ClassSchedule';
import SchoolResources from '@/src/components/school/SchoolResources';

function DoorCard({ icon, title, description, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      className="flex-1 flex-row items-center gap-3 bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl px-3.5 py-3 active:opacity-70"
    >
      <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
        <Ionicons name={icon} size={18} color="#6D469B" />
      </View>
      <View className="flex-1">
        <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{title}</UIText>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{description}</UIText>
      </View>
    </Pressable>
  );
}

export default function SchoolScreen() {
  const c = useThemeColors();
  const school = useSchool();
  const { org, feed, carpool, loading, refreshing, refresh, schoolName, isGuardian } = useSchoolHub();

  // The org's own name is the word — never "school" (iCreate: "we are an
  // education center"). It is known almost immediately (members carry it on
  // /me; the superadmin preview resolves it via useSchool), so the fallback
  // is a neutral placeholder, not a label.
  const name = schoolName || school?.name || 'Community';

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top']}>
      {/* Header: back + the school's own name */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }} testID="school-back">
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="xl" style={{ flex: 1 }} numberOfLines={1}>{name}</Heading>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6D469B" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-2 pb-12 max-w-3xl w-full md:mx-auto"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6D469B" />
          }
        >
          {/* Letterhead: the org's own mark when it has one, never a broken image */}
          {org?.logo_url ? (
            <View className="items-center mb-1">
              <Image
                source={{ uri: org.logo_url }}
                style={{ height: 72, width: '100%', maxWidth: 240 }}
                resizeMode="contain"
                accessibilityLabel={name}
              />
            </View>
          ) : null}
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center mb-4">
            Everything from {name}, in one place.
          </UIText>

          {/* Doors to the deeper surfaces. Absences act on a FAMILY — a student
              is a member without being a guardian, so they get no door (the
              backend enforces the same by family relationship). */}
          <VStack space="sm" className="mb-4">
            <DoorCard
              icon="mail-outline"
              title={`Messages from ${name}`}
              description="Everything the office has sent, searchable."
              // The org rides along for the superadmin preview — the archive
              // endpoint can't resolve it from a superadmin's (non-)membership.
              onPress={() => router.push({
                pathname: '/(app)/school/archive',
                ...(org ? { params: { org: org.organization_id } } : {}),
              } as any)}
              testID="school-door-archive"
            />
            {isGuardian && (
              <DoorCard
                icon="calendar-outline"
                title="Report an absence"
                description="Let the office know your child will be out."
                onPress={() => router.push('/(app)/school/absences' as any)}
                testID="school-door-absences"
              />
            )}
          </VStack>

          <ClassSchedule organizationId={org?.organization_id} />

          <SchoolResources organizationId={org?.organization_id} />

          <SchoolCommunity feed={feed} />

          {/* The board renders even when empty (someone has to post first) —
              but never a bare board to students, who cannot post. */}
          {feed !== null && (
            <CarpoolBoard
              posts={carpool.posts}
              canPost={carpool.canPost}
              canModerate={carpool.canModerate}
              onPost={carpool.post}
              onRemove={carpool.remove}
              onMessage={carpool.message}
            />
          )}

          {!hasCommunityContent(feed) && (
            <VStack className="items-center pt-12 gap-3">
              <Ionicons name="home-outline" size={44} color={c.iconMuted} />
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
                Nothing on the board yet. Announcements, events and shout-outs
                from {name} will appear here.
              </UIText>
            </VStack>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
