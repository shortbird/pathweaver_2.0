/**
 * School hub — everything a member gets from their school, in one place,
 * titled with the school's name. The mobile counterpart of the web /school
 * page.
 *
 * One page, a strip of tabs (2026-09-18): Feed · Schedule · Calendar ·
 * Carpool · Documents, each shown only when the school runs the thing and
 * this member may use it (schoolTabsFor). Until then the hub was the feed
 * under a row of six chips, four of which pushed a screen and two of which
 * opened a browser, with the class schedules stacked, collapsed, at the
 * bottom of the feed where nobody scrolled. Schedule and Absence became one
 * tab (a child's time at the school, and when they will miss it); Lost &
 * found became a filter on the feed; Billing and Forms, browser links both,
 * left.
 *
 * Feed-first, still (2026-08-23 redesign): a parent opens this page for what
 * the school said, so the feed is the first tab and the one a bare /school
 * lands on. ?tab= picks another; ?student= carries a child into Schedule.
 *
 * Copy note (iCreate, 2026-08-06): the word "school" is unwelcome — "iCreate
 * is an education center". Where a sentence needs a subject, use the org's own
 * name.
 */

import React, { useState } from 'react';
import { View, Image, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useSchool, useSchoolHub, hasSchoolContent, familyDoorsFor, schoolTabsFor, type SchoolTabKey,
} from '@/src/hooks/useSchool';
import { useSchoolResources } from '@/src/hooks/useSchoolResources';
import SchoolFeed, {
  ComingUp, FeedFilterRow, feedFiltersFor, mergeSchoolFeed, type FeedFilter,
} from '@/src/components/school/SchoolFeed';
import { ScheduleTab } from '@/src/components/school/ScheduleTab';
import { CalendarTab } from '@/src/components/school/CalendarTab';
import { CarpoolTab } from '@/src/components/school/CarpoolTab';
import { DocumentsTab } from '@/src/components/school/DocumentsTab';

/** A door that still opens on the web (Goal Setting, Prior Learning) — a
 *  chip on the Feed tab, not a tab, since a tab that launches a browser is a
 *  lie about where you are. */
function WebDoorChip({ icon, label, onPress, testID }: {
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

const TAB_KEYS: SchoolTabKey[] = ['feed', 'schedule', 'calendar', 'carpool', 'documents'];
const isTabKey = (v: unknown): v is SchoolTabKey => TAB_KEYS.includes(v as SchoolTabKey);

export default function SchoolScreen() {
  const c = useThemeColors();
  const school = useSchool();
  const { org, feed, messages, carpool, loading, refreshing, refresh, schoolName } =
    useSchoolHub({ markRead: true });
  const { resources } = useSchoolResources(org?.organization_id);
  const params = useLocalSearchParams<{ tab?: string; student?: string }>();

  // The tab: the one asked for while it exists, else Feed. Derived, so a tab
  // that disappears (a board that goes away) can never leave a blank page.
  // ?tab= is honoured whenever it CHANGES, not only on mount: a link opened
  // while this page is already up (a notification, the child page) updates
  // the params in place rather than remounting, and must still land.
  const [tabState, setTabState] = useState<{ param?: string; picked: SchoolTabKey | null }>({
    param: params.tab,
    picked: isTabKey(params.tab) ? params.tab : null,
  });
  if (params.tab !== tabState.param) {
    setTabState({ param: params.tab, picked: isTabKey(params.tab) ? params.tab : tabState.picked });
  }
  const pickedTab = tabState.picked;
  const setPickedTab = (key: SchoolTabKey) => setTabState((s) => ({ ...s, picked: key }));
  const tabs = schoolTabsFor(org, { board: feed !== null, documents: resources.length > 0 });
  const activeTab: SchoolTabKey = pickedTab && tabs.some((t) => t.key === pickedTab)
    ? pickedTab
    : 'feed';

  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const filters = feedFiltersFor(mergeSchoolFeed(feed, messages), feed !== null);

  // The org's own name is the word — never "school" (iCreate: "we are an
  // education center"). It is known almost immediately (members carry it on
  // /me; the superadmin preview resolves it via useSchool), so the fallback
  // is a neutral placeholder, not a label.
  const name = schoolName || school?.name || 'Community';

  // The org rides along for the superadmin preview — the archive resolves the
  // org from membership, which a superadmin lacks.
  const orgParams = org ? { org: org.organization_id } : undefined;
  const webDoors = familyDoorsFor(org);
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
        <>
          {/* The tab strip. Scrolls sideways when the labels outgrow the
              screen; the active tab carries the brand underline. */}
          {tabs.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12 }}
              className="flex-grow-0 border-b border-surface-200 dark:border-dark-surface-300 mb-3"
              testID="school-tabs"
            >
              {tabs.map((t) => {
                const on = t.key === activeTab;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setPickedTab(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    testID={`school-tab-${t.key}-button`}
                    className={`px-4 py-2.5 border-b-2 ${on ? 'border-optio-purple' : 'border-transparent'}`}
                  >
                    <UIText
                      size="sm"
                      className={on
                        ? 'text-optio-purple font-poppins-semibold'
                        : 'text-typo-500 dark:text-dark-typo-500 font-poppins-medium'}
                    >
                      {t.label}
                    </UIText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {activeTab === 'feed' && (
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-5 pb-12 max-w-3xl w-full md:mx-auto"
              showsVerticalScrollIndicator={false}
              testID="school-tab-feed"
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

              {/* Doors that still open on the web inside the hub (Goal
                  Setting for a goals-flow school, Prior Learning). Rare, and
                  never for iCreate. */}
              {webDoors.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {webDoors.map((door) => (
                    <WebDoorChip
                      key={door.key}
                      icon={door.icon as keyof typeof Ionicons.glyphMap}
                      label={door.label}
                      onPress={() => router.push({ pathname: '/(app)/view-on-web', params: { path: door.web, label: door.label } } as any)}
                      testID={`school-chip-${door.key}`}
                    />
                  ))}
                </View>
              )}

              <FeedFilterRow filters={filters} value={feedFilter} onChange={setFeedFilter} />

              {/* The feed is the page. */}
              <SchoolFeed
                schoolName={name}
                feed={feed}
                messages={messages}
                filter={feedFilter}
                onSeeAll={() => push('/(app)/school/archive')}
              />

              {/* The strip is the glance; the Calendar tab is the month. */}
              {feedFilter === 'all' && (
                <ComingUp events={feed?.events || []}
                  onSeeAll={() => setPickedTab('calendar')} />
              )}

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

          {activeTab === 'schedule' && (
            <ScheduleTab
              organizationId={org?.organization_id}
              initialStudentId={typeof params.student === 'string' ? params.student : null}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarTab organizationId={org?.organization_id} />
          )}

          {activeTab === 'carpool' && (
            <CarpoolTab carpool={carpool} refreshing={refreshing} refresh={refresh} />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab resources={resources} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}
