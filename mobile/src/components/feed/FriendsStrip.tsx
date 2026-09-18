/**
 * FriendsStrip - the student's friends, at the top of their feed.
 *
 * Until 2026-09-18 Friends was a pill on the right of the feed's subtitle,
 * which the subtitle pushed off the edge of a phone; and a pill that says
 * "Friends" says nothing about how to get one. The strip is the friends
 * themselves (tap one for their page) with Add first in the row, so the way
 * to more friends is the first thing the row shows. A student with none
 * yet gets the invitation and the two ways in (a classmate, a code); the
 * requests waiting on them ride on the See all door as a count.
 *
 * Friends off with a parent to ask is the ask itself: one tap sends the
 * parent a push (and an email) that opens the child's Friends settings on
 * their phone, where the switch is (ask_parent on the server; the
 * notification's link is /family?friends=<child>, which deepLinkRouter
 * sends to parent/friends/<child>). Off with nobody to ask, or a birthday
 * still to answer, is one line that opens the Friends screen, where the
 * reason and the next step live. A school with the module off shows
 * nothing: there is nothing for the student to do.
 */

import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Card, Button, ButtonText, Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import { askParent, type Connections, type Eligibility } from '@/src/hooks/useFriends';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

const openFriends = () => router.push('/(app)/friends' as any);
const addFriend = () => router.push('/(app)/friends/add' as any);

/** The one line a student sees while Friends is not yet on for them. The
 *  school's sentence ("Ask your school to turn on Friends.") fits; the
 *  server's lines for an adult and for a student with nobody to ask run
 *  long, so those get the short form. */
function offLine(eligibility: Eligibility): string {
  if (eligibility.state === 'needs_dob' || eligibility.who_can_enable === 'self') return 'Turn on Friends';
  if (eligibility.who_can_enable === 'org_admin' && eligibility.reason) return eligibility.reason;
  return 'Friends is off for you';
}

/** Friends is off and a parent holds the switch: the ask, right here. */
function AskParentCard({ eligibility, wrap }: { eligibility: Eligibility; wrap: string }) {
  const c = useThemeColors();
  const [asked, setAsked] = useState(false);
  const [asking, setAsking] = useState(false);
  const ask = async () => {
    setAsking(true);
    try {
      await askParent();
      setAsked(true);
    } catch (err) {
      showAlert('Could not send that', extractApiError(err).message);
    } finally {
      setAsking(false);
    }
  };
  return (
    <View className={wrap}>
      <Card variant="outline" size="md" testID="friends-strip-ask">
        <HStack className="items-center gap-3">
          <View className="w-11 h-11 rounded-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="people-outline" size={22} color={c.brand} />
          </View>
          <VStack className="flex-1 min-w-0">
            <UIText size="sm" className="font-poppins-semibold">Friends is off for you</UIText>
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
              {asked
                ? 'Asked. Your parent will get a notification and an email.'
                : eligibility.reason || 'Ask your parent to turn on Friends for you.'}
            </UIText>
          </VStack>
        </HStack>
        {!asked && (
          <HStack className="items-center justify-between mt-3">
            <Button size="sm" onPress={ask} disabled={asking} testID="friends-strip-ask-button" accessibilityLabel="Ask my parent">
              <Ionicons name="paper-plane-outline" size={14} color="#fff" />
              <ButtonText>Ask my parent</ButtonText>
            </Button>
            <Pressable onPress={openFriends} hitSlop={6} accessibilityRole="button" accessibilityLabel="About Friends" className="flex-row items-center gap-1.5 active:opacity-70">
              <UIText size="xs" className="text-optio-purple font-poppins-medium">About Friends</UIText>
              <Ionicons name="chevron-forward" size={12} color={c.brand} />
            </Pressable>
          </HStack>
        )}
      </Card>
    </View>
  );
}

export function FriendsStrip({ eligibility, connections, loading, isDesktop }: {
  eligibility: Eligibility | null;
  connections: Connections;
  loading: boolean;
  isDesktop: boolean;
}) {
  const c = useThemeColors();
  if (loading || !eligibility || eligibility.state === 'module_off') return null;
  const wrap = `pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`;

  if (eligibility.state === 'friends_off' && eligibility.who_can_enable === 'parent') {
    return <AskParentCard eligibility={eligibility} wrap={wrap} />;
  }

  if (eligibility.state !== 'eligible') {
    return (
      <View className={wrap}>
        <Pressable
          onPress={openFriends}
          accessibilityRole="button"
          accessibilityLabel={offLine(eligibility)}
          testID="friends-strip-off"
          className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-100 dark:bg-dark-surface-200 active:opacity-70"
        >
          <Ionicons name="people-outline" size={16} color={c.iconMuted} />
          <UIText size="sm" className="flex-1 text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>{offLine(eligibility)}</UIText>
          <Ionicons name="chevron-forward" size={14} color={c.iconMuted} />
        </Pressable>
      </View>
    );
  }

  const { active, incoming } = connections;
  const waiting = incoming.length;
  const seeAll = (
    <Pressable
      onPress={openFriends}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={waiting
        ? `See all friends, ${waiting} request${waiting === 1 ? '' : 's'} waiting for you`
        : 'See all friends'}
      testID="feed-friends-button"
      className="flex-row items-center gap-1.5 active:opacity-70"
    >
      {waiting > 0 && (
        <View className="rounded-full bg-optio-pink px-1.5 min-w-[18px] items-center" testID="feed-friends-badge">
          <UIText size="xs" className="text-white font-poppins-bold">{waiting}</UIText>
        </View>
      )}
      <UIText size="xs" className="text-optio-purple font-poppins-medium">
        {waiting > 0 ? (waiting === 1 ? '1 request' : `${waiting} requests`) : 'See all'}
      </UIText>
      <Ionicons name="chevron-forward" size={12} color={c.brand} />
    </Pressable>
  );

  if (active.length === 0) {
    return (
      <View className={wrap}>
        <Card variant="outline" size="md" testID="friends-strip-empty">
          <HStack className="items-center gap-3">
            <View className="w-11 h-11 rounded-full bg-optio-purple/10 items-center justify-center">
              <Ionicons name="people-outline" size={22} color={c.brand} />
            </View>
            <VStack className="flex-1 min-w-0">
              <UIText size="sm" className="font-poppins-semibold">Add friends to see their work here</UIText>
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
                Add a classmate, or share your code with a friend.
              </UIText>
            </VStack>
          </HStack>
          <HStack className="items-center justify-between mt-3">
            <Button size="sm" onPress={addFriend} testID="friends-strip-add" accessibilityLabel="Add a friend">
              <Ionicons name="person-add-outline" size={14} color="#fff" />
              <ButtonText>Add a friend</ButtonText>
            </Button>
            {seeAll}
          </HStack>
        </Card>
      </View>
    );
  }

  return (
    <View className={wrap} testID="friends-strip">
      <HStack className="items-center justify-between mb-2">
        <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">
          Friends
        </UIText>
        {seeAll}
      </HStack>
      {/* Bleeds to the screen edges so the row scrolls under the margin.
          flex-grow-0: a horizontal ScrollView in a column otherwise takes
          its share of the height. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 -mx-5"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
      >
        <Pressable
          onPress={addFriend}
          accessibilityRole="button"
          accessibilityLabel="Add a friend"
          testID="friends-strip-add"
          className="items-center gap-1 w-14 active:opacity-70"
        >
          <View className="w-14 h-14 rounded-full border-2 border-dashed border-optio-purple/50 bg-optio-purple/5 items-center justify-center">
            <Ionicons name="person-add-outline" size={22} color={c.brand} />
          </View>
          <UIText size="xs" className="text-optio-purple font-poppins-medium" numberOfLines={1}>Add</UIText>
        </Pressable>
        {active.map((item) => {
          const name = item.peer.display_name || '?';
          return (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/(app)/friends/${item.peer.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={name}
              testID={`friends-strip-${item.peer.id}`}
              className="items-center gap-1 w-14 active:opacity-70"
            >
              <Avatar size="lg">
                {item.peer.avatar_url
                  ? <AvatarImage source={{ uri: item.peer.avatar_url }} />
                  : <AvatarFallbackText>{name[0].toUpperCase()}</AvatarFallbackText>}
              </Avatar>
              <UIText size="xs" numberOfLines={1}>{name.split(' ')[0]}</UIText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default FriendsStrip;
