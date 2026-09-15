/**
 * Friends -- the student's list, their requests, and the way to add one.
 *
 * Reached from the people icon in the Feed header and from Profile; not a
 * tab, because the bar is full and friends' WORK already lives in Feed.
 * This screen manages the friendships; the feed shows what they made.
 *
 * Two states are not the list:
 *   - Friends is off for this student. Not a dead end: the reason names the
 *     adult who can turn it on, which is the one thing the student can act
 *     on. There is no code field to retry against.
 *   - A platform student with nobody to answer for them and no age on file
 *     meets a neutral birthday question. The 13+ rule is explained AFTER
 *     the answer, never above the input (that just tells a ten-year-old
 *     which year to type). The answer is one-shot; the server locks it.
 */

import React, { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFriends, askParent, type ConnectionItem } from '@/src/hooks/useFriends';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText, Card, Button, ButtonText, Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { confirmAlert, showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

const DESKTOP_BREAKPOINT = 768;

function PeerRow({ item, subtitle, children, onPress }: {
  item: ConnectionItem; subtitle?: string; children?: React.ReactNode; onPress?: () => void;
}) {
  const initial = (item.peer.display_name?.[0] || '?').toUpperCase();
  const body = (
    <Card variant="outline" size="sm">
      <HStack className="items-center gap-3">
        <Avatar size="md">
          {item.peer.avatar_url ? <AvatarImage source={{ uri: item.peer.avatar_url }} /> : <AvatarFallbackText>{initial}</AvatarFallbackText>}
        </Avatar>
        <VStack className="flex-1 min-w-0">
          <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>{item.peer.display_name}</UIText>
          {subtitle ? <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{subtitle}</UIText> : null}
        </VStack>
        <HStack className="items-center gap-2">{children}</HStack>
      </HStack>
    </Card>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <VStack space="sm">
      <HStack className="items-center gap-2">
        <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">{title}</UIText>
        {count ? (
          <UIText size="xs" className="rounded-full bg-optio-pink px-1.5 text-white font-poppins-bold" style={{ fontSize: 10, lineHeight: 16 }}>{count}</UIText>
        ) : null}
      </HStack>
      {children}
    </VStack>
  );
}

export default function FriendsScreen() {
  const c = useThemeColors();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { eligibility, connections, loading, busy, error, refetch, respond, revoke, submitDob } = useFriends();

  // Friends is off and a parent can turn it on: the kid reaches the switch.
  const [asked, setAsked] = useState(false);
  const [asking, setAsking] = useState(false);
  const ask = useCallback(async () => {
    setAsking(true);
    try {
      await askParent();
      setAsked(true);
    } catch (err) {
      showAlert('Could not send that', extractApiError(err).message);
    } finally {
      setAsking(false);
    }
  }, []);
  const [dob, setDob] = useState('');

  const answer = useCallback(async (item: ConnectionItem, accept: boolean) => {
    try {
      await respond(item.id, accept);
    } catch (err) {
      showAlert('Could not send your answer', extractApiError(err).message);
    }
  }, [respond]);

  const remove = useCallback(async (item: ConnectionItem) => {
    const ok = await confirmAlert({
      title: `Remove ${item.peer.display_name}?`,
      message: "You will no longer see each other's work. They will not be told.",
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await revoke(item.id);
    } catch (err) {
      showAlert('Could not remove that friend', extractApiError(err).message);
    }
  }, [revoke]);

  const sendDob = useCallback(async () => {
    if (!dob.trim()) return;
    try {
      await submitDob(dob.trim());
    } catch (err) {
      showAlert('Could not save your date of birth', extractApiError(err).message);
    }
  }, [dob, submitDob]);

  const state = eligibility?.state;
  const { active, incoming, outgoing, awaiting_approval: awaiting } = connections;
  const empty = active.length + incoming.length + outgoing.length + awaiting.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <HStack className="items-center px-4 py-3" space="sm">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.icon} />
        </Pressable>
        <VStack className="flex-1 min-w-0">
          <Heading size="md">Friends</Heading>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">See and cheer on each other's work</UIText>
        </VStack>
        {state === 'eligible' && (
          <Pressable
            onPress={() => router.push('/(app)/friends/add' as any)}
            accessibilityRole="button"
            accessibilityLabel="Add a friend"
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-full bg-optio-purple active:opacity-80"
          >
            <Ionicons name="person-add-outline" size={16} color="#fff" />
            <UIText size="sm" className="text-white font-poppins-semibold">Add</UIText>
          </Pressable>
        )}
      </HStack>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={c.brand} /></View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">{error}</UIText>
          <Button variant="outline" onPress={refetch} className="mt-3"><ButtonText>Try again</ButtonText></Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
            {state === 'friends_off' && (
              <Card variant="filled" size="lg">
                <VStack space="sm">
                  <Ionicons name="people-outline" size={36} color={c.iconMuted} />
                  <UIText size="md" className="font-poppins-semibold">{eligibility?.reason || 'Friends is not turned on for you yet.'}</UIText>
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                    In the meantime, your parent, guardian, and teachers can already see everything you make.
                  </UIText>
                  {eligibility?.who_can_enable === 'parent' && (
                    asked ? (
                      <UIText size="sm" className="font-poppins-medium" testID="ask-parent-sent">Asked. Your parent will get a message and an email.</UIText>
                    ) : (
                      <Button onPress={ask} disabled={asking} className="self-start mt-1" testID="ask-parent-button">
                        <ButtonText>Ask my parent</ButtonText>
                      </Button>
                    )
                  )}
                </VStack>
              </Card>
            )}

            {state === 'module_off' && (
              <Card variant="filled" size="lg">
                <UIText size="md" className="font-poppins-semibold">{eligibility?.reason || 'Friends is not turned on at your school.'}</UIText>
              </Card>
            )}

            {state === 'needs_dob' && (
              <Card variant="outline" size="lg">
                <VStack space="sm">
                  <UIText size="md" className="font-poppins-semibold">What's your date of birth?</UIText>
                  <TextInput
                    value={dob}
                    onChangeText={setDob}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={c.iconMuted}
                    autoCapitalize="none"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                    accessibilityLabel="What's your date of birth?"
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, color: c.text, fontFamily: 'Poppins_400Regular' }}
                  />
                  <Button onPress={sendDob} disabled={busy || !dob.trim()}><ButtonText>Continue</ButtonText></Button>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    You can only answer this once, so check it before you continue. Ask a parent, guardian, or your school if you need it changed later.
                  </UIText>
                </VStack>
              </Card>
            )}

            {state === 'eligible' && (
              <VStack space="lg">
                {incoming.length > 0 && (
                  <Section title="Wants to be friends" count={incoming.length}>
                    {incoming.map((item) => (
                      <PeerRow key={item.id} item={item} subtitle={item.source === 'parent' ? "Sent by their parent" : undefined}>
                        <Button size="sm" onPress={() => answer(item, true)} disabled={busy}><ButtonText>Accept</ButtonText></Button>
                        <Button size="sm" variant="outline" action="secondary" onPress={() => answer(item, false)} disabled={busy}><ButtonText>No thanks</ButtonText></Button>
                      </PeerRow>
                    ))}
                  </Section>
                )}

                {awaiting.length > 0 && (
                  <Section title="Waiting on a grown-up">
                    {awaiting.map((item) => (
                      <PeerRow key={item.id} item={item} subtitle="A parent still has to say yes" />
                    ))}
                  </Section>
                )}

                {outgoing.length > 0 && (
                  <Section title="Sent">
                    {outgoing.map((item) => (
                      <PeerRow key={item.id} item={item} subtitle="Waiting for them to accept" />
                    ))}
                  </Section>
                )}

                <Section title="Friends" count={active.length || undefined}>
                  {active.length === 0 ? (
                    <Card variant="filled" size="lg" className="items-center py-8">
                      <Ionicons name="people-outline" size={36} color={c.iconMuted} />
                      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 text-center">
                        {empty ? 'No friends yet. Add a classmate, or share your code.' : 'No friends yet.'}
                      </UIText>
                      <Button onPress={() => router.push('/(app)/friends/add' as any)} className="mt-4">
                        <ButtonText>Add a friend</ButtonText>
                      </Button>
                    </Card>
                  ) : active.map((item) => (
                    <PeerRow key={item.id} item={item} onPress={() => router.push(`/(app)/friends/${item.peer.id}` as any)}>
                      <Pressable onPress={() => remove(item)} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.peer.display_name}`}>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Remove</UIText>
                      </Pressable>
                      <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
                    </PeerRow>
                  ))}
                </Section>

                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  Both of you have to say yes. Your families set the rules: some parents want to approve each friend first, and yours are told whenever you add one. Either of you, or either grown-up, can undo it at any time.
                </UIText>
              </VStack>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
