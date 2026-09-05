/**
 * School hub — everything a member gets from their school, in one place,
 * titled with the school's name. The mobile counterpart of the web /school
 * page.
 *
 * Feed-first (2026-08-23 redesign): a parent opens this page for what the
 * school said, so the unified feed — board announcements + sent messages,
 * with shout-outs and lost & found folded in — IS the page, under a row of
 * action chips (Absence / Carpool / Lost & found / Documents). Everything
 * else earns
 * its place further down: the "Coming up" strip, then each child's class
 * schedule, closed on arrival. Carpool and Documents moved to their own
 * screens; as inline dropdowns they buried the feed and their one-off
 * DoorCard styling never matched the sections around it (the "Documents
 * covers Messages" report was that mismatch: flex-1 door boxes under
 * elevated cards).
 *
 * Copy note (iCreate, 2026-08-06): the word "school" is unwelcome — "iCreate
 * is an education center". Where a sentence needs a subject, use the org's own
 * name.
 */

import React, { useState } from 'react';
import { View, Image, Pressable, ScrollView, RefreshControl, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, HStack, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useSchool, useSchoolHub, hasSchoolContent } from '@/src/hooks/useSchool';
import { useSchoolResources } from '@/src/hooks/useSchoolResources';
import SchoolFeed, { ComingUp, LostFoundItem } from '@/src/components/school/SchoolFeed';
import ClassSchedule from '@/src/components/school/ClassSchedule';

/** One of the three actions — same visual system as the section cards
 *  (bordered tile, brand icon tile), sized as a chip in a row. */
function ActionChip({ icon, label, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center gap-1.5 bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl py-3 px-2 active:opacity-70"
    >
      <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
        <Ionicons name={icon} size={18} color={c.brand} />
      </View>
      <UIText size="xs" className="font-poppins-semibold text-center" numberOfLines={1}>{label}</UIText>
    </Pressable>
  );
}

export default function SchoolScreen() {
  const c = useThemeColors();
  const school = useSchool();
  const { org, feed, messages, loading, refreshing, refresh, schoolName, isGuardian } = useSchoolHub({ markRead: true });
  const { resources } = useSchoolResources(org?.organization_id);
  const [showLostFound, setShowLostFound] = useState(false);

  // The org's own name is the word — never "school" (iCreate: "we are an
  // education center"). It is known almost immediately (members carry it on
  // /me; the superadmin preview resolves it via useSchool), so the fallback
  // is a neutral placeholder, not a label.
  const name = schoolName || school?.name || 'Community';

  // The org rides along for the superadmin preview — the deeper screens
  // resolve the org from membership, which a superadmin lacks.
  const orgParams = org ? { org: org.organization_id } : undefined;
  const push = (pathname: string) =>
    router.push({ pathname, ...(orgParams ? { params: orgParams } : {}) } as any);

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top']}>
      {/* Header: back + the school's own name */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }} testID="school-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="xl" style={{ flex: 1 }} numberOfLines={1}>{name}</Heading>
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

          {/* The action chips. Absences act on a FAMILY — a student is a
              member without being a guardian, so no chip for them (the
              backend enforces the same by family relationship). Carpool and
              Lost & found wait for a board (feed === null means no board for
              this user) — Lost & found deliberately NOT gated on item count,
              or with zero items nothing on the page says the feature exists
              (iCreate report); Documents waits for the school to have any. */}
          {(isGuardian || feed !== null || resources.length > 0) && (
            <View className="flex-row gap-2 mb-4">
              {isGuardian && (
                <ActionChip
                  icon="calendar-outline"
                  label="Absence"
                  onPress={() => push('/(app)/school/absences')}
                  testID="school-chip-absences"
                />
              )}
              {feed !== null && (
                <ActionChip
                  icon="calendar-number-outline"
                  label="Calendar"
                  onPress={() => push('/(app)/school/calendar')}
                  testID="school-chip-calendar"
                />
              )}
              {feed !== null && (
                <ActionChip
                  icon="car-outline"
                  label="Carpool"
                  onPress={() => push('/(app)/school/carpool')}
                  testID="school-chip-carpool"
                />
              )}
              {feed !== null && (
                <ActionChip
                  icon="archive-outline"
                  label="Lost & found"
                  onPress={() => setShowLostFound(true)}
                  testID="school-chip-lostfound"
                />
              )}
              {resources.length > 0 && (
                <ActionChip
                  icon="folder-open-outline"
                  label="Documents"
                  onPress={() => push('/(app)/school/documents')}
                  testID="school-chip-documents"
                />
              )}
            </View>
          )}

          {/* The feed is the page. */}
          <SchoolFeed
            schoolName={name}
            feed={feed}
            messages={messages}
            onSeeAll={() => push('/(app)/school/archive')}
          />

          {/* The strip is the glance; the calendar behind it is the month
              (e223b6db, 2026-09-04: "can we get the calendar to show up on the
              app?"). */}
          <ComingUp events={feed?.events || []}
            onSeeAll={() => push('/(app)/school/calendar')} />

          <ClassSchedule organizationId={org?.organization_id} />

          {!hasSchoolContent(feed, messages) && (
            <View className="items-center pt-12 gap-3">
              <Ionicons name="home-outline" size={44} color={c.iconMuted} />
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
                Nothing from {name} yet. Announcements, messages and events
                will appear here.
              </UIText>
            </View>
          )}
        </ScrollView>
      )}

      {/* Lost & found. There is no dedicated screen — the items only exist as
          feed entries — so the chip lists them here, and with none it still
          says the feature exists (the whole point of the chip). */}
      <Modal visible={showLostFound} transparent animationType="fade" onRequestClose={() => setShowLostFound(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowLostFound(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ backgroundColor: c.card, borderRadius: 20, width: 480, maxWidth: '92%', maxHeight: '80%', padding: 24 }}
          >
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">Lost &amp; found</Heading>
                <Pressable onPress={() => setShowLostFound(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                  <Ionicons name="close" size={24} color={c.icon} />
                </Pressable>
              </HStack>
              {(feed?.lost_found || []).length > 0 ? (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <VStack space="sm">
                    {(feed?.lost_found || []).map((l) => (
                      <LostFoundItem
                        key={l.id}
                        item={{ key: `lostfound-${l.id}`, kind: 'lostfound', date: l.created_at, pinned: false, data: l }}
                      />
                    ))}
                  </VStack>
                </ScrollView>
              ) : (
                <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">
                  Nothing in lost &amp; found right now — found items are collected at the office.
                </UIText>
              )}
            </VStack>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
