/**
 * Family - the ONE parent home on the phone (2026-09-15, with the web's
 * /family).
 *
 * The question it answers: "how are my kids, and how do I get into each
 * child's account." Family photo, then what needs the parent (portfolio
 * visibility requests), then every child as a card
 * (components/family/ChildCard: picture, the numbers that move, the quests
 * they are on with their rhythm, the weekly goal, the peer-connection
 * requests waiting on the parent), then the family's quests
 * (components/family/FamilyQuestsSection). Settings are one sheet
 * (components/family/FamilySettingsSheet), reached from the gear beside the
 * greeting; adding a child lives there too, so the cards carry only Open.
 *
 * "Open" puts the child in family scope (stores/familyStore) and lands on
 * their dashboard; the child's quests, journal and profile then render
 * pointed at that child, with the parent still signed in as themselves.
 *
 * Until now the tab showed ONE child at a time behind a switcher -- a hero
 * with three numbers, a calendar, the quest list, and five doors -- and the
 * child's settings sat behind a three-dot menu on the hero. Every child is
 * on the page now, and the header's compact ChildSwitcher still says who
 * the other tabs are pointed at.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { useMyChildren } from '@/src/hooks/useParent';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useAuthStore } from '@/src/stores/authStore';
import { useAddKidStore, useFamilyStore } from '@/src/stores/familyStore';
import { userInSisOrg } from '@/src/utils/orgModules';
import { useFerpaApprovals } from '@/src/hooks/useFerpaApprovals';
import { forChild, useConnectionApprovals } from '@/src/hooks/useConnectionApprovals';
import { onUploadComplete } from '@/src/services/uploadQueue';
import type { Child } from '@/src/types/family';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { ChildCard } from '@/src/components/family/ChildCard';
import { FamilyCover } from '@/src/components/family/FamilyCover';
import { FamilyQuestsSection } from '@/src/components/family/FamilyQuestsSection';
import { FamilySettingsSheet } from '@/src/components/family/FamilySettingsSheet';

// ── Hearthwood Academy entry (only for OEA-program parents) ──
// Persistent way into the Hearthwood Academy diploma flow (choose pathways / track
// credits). The post-signup redirect only fires once and is skipped when email
// verification is on, so this is the reliable entry point for OEA parents.

function OpenEdAcademyEntry() {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={() => router.push('/(app)/oea/welcome' as any)}
      accessibilityLabel="Hearthwood Academy"
    >
      <Card variant="outline" size="md">
        <HStack className="items-center gap-3">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school-outline" size={18} color={c.brand} />
          </View>
          <VStack className="flex-1 min-w-0">
            <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>Hearthwood Academy</UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>Choose diploma pathways and track credits</UIText>
          </VStack>
          <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
        </HStack>
      </Card>
    </Pressable>
  );
}

// ── Main Page ──

export default function ParentDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isOEAParent = user?.program_key === 'opened-academy';
  const { isLargeScreen, isWide } = useBreakpoint();
  const scrollRef = useRef<ScrollView>(null);
  // Tap the active Family tab to scroll back to the top.
  useScrollToTop(scrollRef);
  const tc = useThemeColors();

  const { children, loading: childrenLoading } = useMyChildren();
  const setSelected = useFamilyStore((s) => s.setSelected);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped to make every card refetch its summary: pull-to-refresh, coming
  // back to the tab (a quest added from Browse quests shows up without a
  // pull), and a backgrounded video upload finishing after its sheet closed
  // (without this the moment only appeared on the next focus).
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    bump();
  }, [bump]));
  useEffect(() => onUploadComplete(bump), [bump]);

  const { count: ferpaCount } = useFerpaApprovals();
  const connections = useConnectionApprovals();

  const onRefresh = async () => {
    setRefreshing(true);
    bump();
    useAddKidStore.getState().refreshChildren();
    await Promise.all([connections.refetch()]);
    setRefreshing(false);
  };

  // "Open" and the quest rows enter family scope, then go to the child's
  // own screens; the name goes to their full profile.
  const openChild = (child: Child) => {
    setSelected(child.id);
    router.push('/(app)/(tabs)/dashboard' as any);
  };
  const openChildQuest = (child: Child, questId: string) => {
    setSelected(child.id);
    router.push(`/parent/quest/${child.id}/${questId}` as any);
  };
  const openChildProfile = (child: Child) => {
    setSelected(child.id);
    router.push(`/parent/child/${child.id}` as any);
  };
  // The catalog (browse, create, add -- everything lands on the kid's
  // account). Hidden from the parent tab bar but still a registered route
  // (config/navigation.ts); the store carries the child.
  const browseQuests = (child: Child) => {
    setSelected(child.id);
    router.push('/(app)/(tabs)/quests' as any);
  };

  // Loading
  if (childrenLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={tc.brand} />
      </SafeAreaView>
    );
  }

  // No children. In an SIS school the office links students to their
  // family (registration, roster import); a child added from the app would
  // land outside the household, so that door is not offered there.
  if (children.length === 0) {
    const inSisSchool = userInSisOrg(user);
    const schoolName = user?.school?.name || 'your school';
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="people-outline" size={56} color={tc.iconMuted} />
          <Heading size="lg" className="text-typo-500 mt-4 text-center dark:text-dark-typo-500">No students linked</Heading>
          <UIText size="sm" className="text-typo-400 mt-2 text-center dark:text-dark-typo-400">
            {inSisSchool
              ? `Ask ${schoolName} to link your student to your account.`
              : 'Add a dependent or connect with a student to view their learning dashboard.'}
          </UIText>
          {!inSisSchool && (
            <Button size="lg" className="mt-6" onPress={() => useAddKidStore.getState().open()}>
              <ButtonText>Add a Child</ButtonText>
            </Button>
          )}
          {/* An exit. This screen is also what a parent sees when the list
              merely FAILED to load — a phone/paperwork hold 403s it and
              useMyChildren catches that as "no children" — and then the only
              button offers to add a child who already exists, which the
              backend rightly refuses. That left a parent with no way off this
              screen and no way to her son's dashboard (iCreate, 2026-09-10).
              Refetching is the fix for the common case; the hold path also
              refetches itself now (stores/holdStore.ts). */}
          <Pressable
            onPress={() => useAddKidStore.getState().refreshChildren()}
            className="mt-4 py-2 px-4"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh the family list"
          >
            <UIText size="sm" className="text-optio-purple font-poppins-semibold dark:text-optio-purple-light">
              Refresh
            </UIText>
          </Pressable>
          {isOEAParent && (
            <View className="mt-6 w-full max-w-sm">
              <OpenEdAcademyEntry />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const columns = isWide ? 3 : isLargeScreen ? 2 : 1;
  const firstName = user?.first_name || 'there';

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tc.brand} />}
      >
        <PageHeader title="Family" />
        <VStack className="max-w-6xl w-full md:mx-auto px-5 md:px-8" space="lg">

          {/* The family's own photo, above everything. */}
          <FamilyCover />

          <HStack className="items-start justify-between gap-3">
            <VStack className="flex-1 min-w-0">
              <Heading size="lg" numberOfLines={1}>Welcome back, {firstName}</Heading>
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Here is how your family is doing.</UIText>
            </VStack>
            <Pressable
              onPress={() => setSettingsOpen(true)}
              testID="family-settings"
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Family settings"
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tc.surfaceMuted }}
            >
              <Ionicons name="settings-outline" size={18} color={tc.icon} />
            </Pressable>
          </HStack>

          {/* Hearthwood Academy entry (OEA-program parents only) */}
          {isOEAParent && <OpenEdAcademyEntry />}

          {/* FERPA visibility approvals banner */}
          {ferpaCount > 0 && (
            <Pressable onPress={() => router.push('/(app)/approvals' as any)}>
              <Card variant="outline" size="md" className="bg-amber-50 border-amber-200">
                <HStack className="items-center gap-3">
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#B45309" />
                  </View>
                  <VStack className="flex-1 min-w-0">
                    <UIText size="sm" style={{ color: '#92400E', fontFamily: 'Poppins_600SemiBold' }} numberOfLines={1}>
                      {ferpaCount} portfolio visibility {ferpaCount === 1 ? 'request' : 'requests'}
                    </UIText>
                    <UIText size="xs" style={{ color: '#B45309' }} numberOfLines={1}>
                      Review and approve before your child's portfolio goes public.
                    </UIText>
                  </VStack>
                  <Ionicons name="chevron-forward" size={18} color="#B45309" />
                </HStack>
              </Card>
            </Pressable>
          )}

          {/* Every child, as a card; one, two or three across with the screen. */}
          <VStack space="sm">
            <HStack className="items-center gap-2">
              <Ionicons name="people-outline" size={16} color={tc.brand} />
              <Heading size="md">Your family</Heading>
            </HStack>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
              {children.map((child) => (
                <View key={child.id} style={{ width: `${100 / columns}%`, padding: 6 }}>
                  <ChildCard
                    child={child}
                    refreshKey={refreshKey}
                    connections={forChild(connections.data, child.id)}
                    connectionsBusy={connections.busy}
                    onDecideConnection={connections.decide}
                    onRevokeConnection={connections.revoke}
                    onOpen={openChild}
                    onOpenQuest={openChildQuest}
                    onOpenProfile={openChildProfile}
                    onBrowseQuests={browseQuests}
                  />
                </View>
              ))}
            </View>
          </VStack>

          {/* Quests the parent set up for the children, and any on the
              parent's own account (a school's family training quest lands
              there). */}
          <FamilyQuestsSection kids={children} />
        </VStack>
      </ScrollView>

      <FamilySettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} kids={children} />
    </SafeAreaView>
  );
}
