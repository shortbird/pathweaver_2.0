/**
 * A child's friends, the parent's screen.
 *
 * Everything a parent holds over one child's friendships, in one place:
 *   - the policy (the consent, and the boundaries): Friends on/off, ask me
 *     first, who may ask, whether friends may comment or message;
 *   - the list, with the way to remove any friend;
 *   - the requests a parent answers on a dependent's behalf (a child with no
 *     login has no other way to say yes);
 *   - connecting the child with a friend by that friend's code, and the
 *     child's own code to hand to another family;
 *   - what happened lately: comments and reactions given and received,
 *     anything the safety check held, and the way to hide a comment.
 *
 * The student-shaped reads and writes go through student scope
 * (`student_id`), so a parent works a dependent's friends through the same
 * routes the child would use. The policy and the activity view are
 * parent-shaped routes gated by the relationship.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput, Switch, Share, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import api from '@/src/services/api';
import { useFriends, issueCode, requestFriend, inviteLinkFor, hidePeerComment, type ConnectionItem } from '@/src/hooks/useFriends';
import { useFriendPolicy, REQUEST_SOURCES } from '@/src/hooks/useFriendPolicy';
import { useMyChildren } from '@/src/hooks/useParent';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText, Card, Button, ButtonText, Avatar, AvatarFallbackText, AvatarImage, Divider } from '@/src/components/ui';
import { confirmAlert, showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import { nameFor } from '@/src/components/family/ChildSwitcher';
import { formatRelativeTime } from '@/src/utils/timeAgo';

const DESKTOP_BREAKPOINT = 768;

interface ActivityEntry {
  id: string;
  direction: 'given' | 'received';
  peer: { id: string; display_name: string; avatar_url: string | null };
  text?: string;
  label?: string;
  created_at: string;
  hidden_at?: string | null;
  /** parent | report | screen: who took it down. */
  hidden_reason?: string | null;
}

/** Something the child wrote that the safety check held (phase 3). Only the
 *  author's parent sees a hold; it never reached the other child. */
interface HoldEntry {
  id: string;
  surface: 'peer_comment' | 'message';
  stage: 'refused' | 'hidden_later';
  peer: { id: string; display_name: string; avatar_url: string | null };
  text: string;
  reasons: string[];
  created_at: string;
}

const HIDDEN_BY: Record<string, string> = {
  parent: 'Hidden by you',
  report: 'Taken down after a report',
  screen: 'Hidden by the safety check',
};

function Row({ item, subtitle, children, onPress }: {
  item: ConnectionItem; subtitle?: string; children?: React.ReactNode; onPress?: () => void;
}) {
  const initial = (item.peer.display_name?.[0] || '?').toUpperCase();
  const body = (
    <HStack className="items-center gap-3 py-2">
      <Avatar size="sm">
        {item.peer.avatar_url ? <AvatarImage source={{ uri: item.peer.avatar_url }} /> : <AvatarFallbackText>{initial}</AvatarFallbackText>}
      </Avatar>
      <VStack className="flex-1 min-w-0">
        <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{item.peer.display_name}</UIText>
        {subtitle ? <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{subtitle}</UIText> : null}
      </VStack>
      <HStack className="items-center gap-2">{children}</HStack>
    </HStack>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

function Toggle({ label, help, value, onChange, disabled }: {
  label: string; help?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <HStack className="items-center gap-3 py-2">
      <VStack className="flex-1 min-w-0">
        <UIText size="sm" className="font-poppins-medium">{label}</UIText>
        {help ? <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{help}</UIText> : null}
      </VStack>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </HStack>
  );
}

export default function ParentChildFriendsScreen() {
  const c = useThemeColors();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { children } = useMyChildren();
  const child = children.find((k) => k.id === studentId);
  const first = child ? (child.first_name || nameFor(child).split(' ')[0]) : 'Your child';

  const { policy, canSet, loading: policyLoading, saving, save, friendsCount } = useFriendPolicy(studentId);
  const { connections, loading, busy, refetch, respond, revoke } = useFriends(studentId);
  const [code, setCode] = useState('');
  const [childCode, setChildCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [activity, setActivity] = useState<{ comments: ActivityEntry[]; reactions: ActivityEntry[]; holds: HoldEntry[] } | null>(null);

  const loadActivity = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await api.get(`/api/connections/children/${studentId}/activity`, { params: { days: 30 } });
      const d = res.data?.data || res.data || {};
      setActivity({ comments: d.comments || [], reactions: d.reactions || [], holds: d.holds || [] });
    } catch {
      setActivity({ comments: [], reactions: [], holds: [] });
    }
  }, [studentId]);
  useEffect(() => { loadActivity(); }, [loadActivity]);

  const hideComment = useCallback(async (entry: ActivityEntry) => {
    const ok = await confirmAlert({
      title: 'Hide this comment?',
      message: `${entry.peer.display_name}'s comment comes off ${first}'s work. It stays here so you can see what was said.`,
      confirmText: 'Hide',
      destructive: true,
    });
    if (!ok) return;
    try {
      await hidePeerComment(entry.id);
      setActivity((prev) => prev ? {
        ...prev,
        comments: prev.comments.map((x) => x.id === entry.id ? { ...x, hidden_at: new Date().toISOString(), hidden_reason: 'parent' } : x),
      } : prev);
    } catch (err) {
      showAlert('Could not hide that comment', extractApiError(err).message);
    }
  }, [first]);

  const enabled = !!policy?.enabled;

  const turnOn = useCallback(async () => {
    try {
      await save({ enabled: true });
      await refetch();
    } catch (err) {
      showAlert('Could not turn Friends on', extractApiError(err).message);
    }
  }, [save, refetch]);

  const turnOff = useCallback(async () => {
    const n = await friendsCount();
    const ok = await confirmAlert({
      title: `Turn Friends off for ${first}?`,
      message: n > 0
        ? `This removes ${n} friend${n === 1 ? '' : 's'}. They will need to be added again.`
        : `${first} has no friends yet. This stops new requests.`,
      confirmText: 'Turn off',
      destructive: true,
    });
    if (!ok) return;
    try {
      const revoked = await save({ enabled: false });
      if (revoked > 0) showAlert('Friends is off', `${revoked} friend${revoked === 1 ? '' : 's'} removed.`);
      await refetch();
    } catch (err) {
      showAlert('Could not turn Friends off', extractApiError(err).message);
    }
  }, [first, friendsCount, save, refetch]);

  const patch = useCallback(async (p: Parameters<typeof save>[0]) => {
    try {
      await save(p);
    } catch (err) {
      showAlert('Could not save', extractApiError(err).message);
    }
  }, [save]);

  const answer = useCallback(async (item: ConnectionItem, accept: boolean) => {
    try {
      await respond(item.id, accept);
      await loadActivity();
    } catch (err) {
      showAlert('Could not send that answer', extractApiError(err).message);
    }
  }, [respond, loadActivity]);

  const remove = useCallback(async (item: ConnectionItem) => {
    const ok = await confirmAlert({
      title: `Remove ${item.peer.display_name}?`,
      message: `${first} and ${item.peer.display_name} will no longer see each other's work.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await revoke(item.id);
    } catch (err) {
      showAlert('Could not remove that friend', extractApiError(err).message);
    }
  }, [first, revoke]);

  const sendCode = useCallback(async () => {
    if (code.trim().length !== 8) return;
    setSending(true);
    try {
      await requestFriend({ code, studentId });
      setCode('');
      showAlert('Request sent', `The other student, or their parent, will see it next.`);
      await refetch();
    } catch (err) {
      showAlert('Could not send that request', extractApiError(err).message);
    } finally {
      setSending(false);
    }
  }, [code, studentId, refetch]);

  const getChildCode = useCallback(async () => {
    setSending(true);
    try {
      setChildCode(await issueCode(studentId));
    } catch (err) {
      showAlert('Could not create a code', extractApiError(err).message);
    } finally {
      setSending(false);
    }
  }, [studentId]);

  const shareChildCode = useCallback(async () => {
    if (!childCode) return;
    const link = inviteLinkFor(childCode.code);
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(link);
        showAlert('Link copied', 'Send it to the other family. It works for a week.');
      } else {
        await Share.share(Platform.OS === 'ios'
          ? { url: link, message: `Be ${first}'s friend on Optio` }
          : { message: `Be ${first}'s friend on Optio: ${link}` });
      }
    } catch {
      // dismissed
    }
  }, [childCode, first]);

  const { active, incoming, outgoing, awaiting_approval: awaiting } = connections;
  const sources = policy?.request_sources || [];
  const friendsCan = policy?.friends_can || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <HStack className="items-center px-4 py-3" space="sm">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.icon} />
        </Pressable>
        <VStack className="flex-1 min-w-0">
          <Heading size="md" numberOfLines={1}>{first}'s friends</Heading>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Your parent view</UIText>
        </VStack>
      </HStack>

      {policyLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={c.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
            <VStack space="lg">
              {/* The policy */}
              <Card variant="elevated" size="lg">
                <VStack space="sm">
                  <HStack className="items-center gap-3">
                    <Ionicons name="people-outline" size={24} color={enabled ? c.brand : c.iconMuted} />
                    <VStack className="flex-1">
                      <UIText size="md" className="font-poppins-semibold">Friends: {enabled ? 'On' : 'Off'}</UIText>
                      <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
                        {policy?.origin === 'module_off'
                          ? `Friends is not turned on at ${first}'s school.`
                          : !canSet
                            ? (policy?.reason || 'Another adult on this account decides this setting.')
                            : enabled
                              ? `${first} can be friends with other students. Friends see each other's work and can leave encouragement on it. You are told each time a friend is added.`
                              : `Turning Friends on is your consent to share ${first}'s work with the friends they make.`}
                      </UIText>
                    </VStack>
                  </HStack>
                  {canSet && policy?.origin !== 'module_off' && (
                    enabled
                      ? <Button variant="outline" action="secondary" onPress={turnOff} disabled={saving} testID="friends-turn-off"><ButtonText>Turn off</ButtonText></Button>
                      : <Button onPress={turnOn} disabled={saving} testID="friends-turn-on"><ButtonText>Turn on</ButtonText></Button>
                  )}

                  {canSet && enabled && (
                    <>
                      <Divider className="my-2" />
                      <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">New friends</UIText>
                      <Toggle
                        label="Ask me first"
                        help="Nothing is shared until you approve each friend."
                        value={policy?.approval_mode === 'ask_first'}
                        onChange={(v) => patch({ approval_mode: v ? 'ask_first' : 'auto' })}
                        disabled={saving}
                      />
                      <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500 mt-2">Who can ask {first}</UIText>
                      {REQUEST_SOURCES.map((src) => (
                        <Toggle
                          key={src.key}
                          label={src.label}
                          help={src.help}
                          value={sources.includes(src.key)}
                          onChange={(v) => patch({ request_sources: v ? [...sources, src.key] : sources.filter((k) => k !== src.key) })}
                          disabled={saving}
                        />
                      ))}
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">You can always connect {first} with a friend yourself.</UIText>
                      <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500 mt-2">Friends can</UIText>
                      <Toggle label={`See ${first}'s work`} value disabled onChange={() => {}} />
                      <Toggle
                        label={`Comment on ${first}'s work`}
                        value={friendsCan.includes('comment')}
                        onChange={(v) => patch({ friends_can: v ? [...friendsCan.filter((k) => k !== 'comment'), 'comment'] : friendsCan.filter((k) => k !== 'comment') })}
                        disabled={saving}
                      />
                      <Toggle
                        label={`Message ${first}`}
                        help={`Only with friends whose family also allows it. Every message is checked by our safety screen, and you can read ${first}'s messages from the Messages tab.`}
                        value={friendsCan.includes('message')}
                        onChange={(v) => patch({ friends_can: v ? [...friendsCan.filter((k) => k !== 'message'), 'message'] : friendsCan.filter((k) => k !== 'message') })}
                        disabled={saving}
                      />
                    </>
                  )}
                </VStack>
              </Card>

              {enabled && (
                <>
                  {/* Requests the parent answers, and the ones in flight */}
                  {(incoming.length > 0 || awaiting.length > 0 || outgoing.length > 0) && (
                    <Card variant="outline" size="md">
                      <VStack space="xs">
                        <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">Requests</UIText>
                        {incoming.map((item) => (
                          <Row key={item.id} item={item} subtitle={item.source === 'parent' ? 'Sent by their parent' : `Wants to be ${first}'s friend`}>
                            <Button size="sm" onPress={() => answer(item, true)} disabled={busy}><ButtonText>Accept</ButtonText></Button>
                            <Button size="sm" variant="outline" action="secondary" onPress={() => answer(item, false)} disabled={busy}><ButtonText>Decline</ButtonText></Button>
                          </Row>
                        ))}
                        {awaiting.map((item) => <Row key={item.id} item={item} subtitle="Waiting on a parent's answer" />)}
                        {outgoing.map((item) => <Row key={item.id} item={item} subtitle="Waiting for them to accept" />)}
                      </VStack>
                    </Card>
                  )}

                  {/* The list */}
                  <Card variant="outline" size="md">
                    <VStack space="xs">
                      <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">
                        Friends{active.length ? ` · ${active.length}` : ''}
                      </UIText>
                      {loading ? (
                        <ActivityIndicator color={c.brand} className="my-3" />
                      ) : active.length === 0 ? (
                        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 py-2">No friends yet.</UIText>
                      ) : active.map((item) => (
                        <Row key={item.id} item={item} subtitle={item.activated_at ? `Friends since ${formatRelativeTime(item.activated_at)}` : undefined}>
                          <Pressable onPress={() => remove(item)} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.peer.display_name}`}>
                            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Remove</UIText>
                          </Pressable>
                        </Row>
                      ))}
                    </VStack>
                  </Card>

                  {/* Connect with a friend */}
                  <Card variant="outline" size="md">
                    <VStack space="sm">
                      <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">Connect {first} with a friend</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Ask the other family for their child's code, or send them {first}'s.</UIText>
                      <TextInput
                        value={code}
                        onChangeText={(v) => setCode(v.toUpperCase())}
                        placeholder="Their code, e.g. ABCD2345"
                        placeholderTextColor={c.iconMuted}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={8}
                        accessibilityLabel="Enter their code"
                        style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, color: c.text, fontFamily: 'Poppins_600SemiBold', letterSpacing: 2 }}
                      />
                      <Button onPress={sendCode} disabled={sending || code.trim().length !== 8}><ButtonText>Send request</ButtonText></Button>
                      <Divider className="my-1" />
                      {childCode ? (
                        <VStack space="sm" className="items-center">
                          <View style={{ padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                            <QRCode value={inviteLinkFor(childCode.code)} size={140} color="#1F1B2D" backgroundColor="#FFFFFF" />
                          </View>
                          <UIText size="lg" className="font-poppins-bold text-optio-purple tracking-widest" style={{ fontSize: 24, lineHeight: 32 }}>{childCode.code}</UIText>
                          <HStack className="gap-2">
                            <Button size="sm" variant="outline" onPress={shareChildCode}><ButtonText>Share link</ButtonText></Button>
                            <Button size="sm" variant="outline" action="secondary" onPress={getChildCode} disabled={sending}><ButtonText>New code</ButtonText></Button>
                          </HStack>
                        </VStack>
                      ) : (
                        <Button variant="outline" onPress={getChildCode} disabled={sending}><ButtonText>Get {first}'s code</ButtonText></Button>
                      )}
                    </VStack>
                  </Card>

                  {/* What happened lately */}
                  <Card variant="outline" size="md">
                    <VStack space="xs">
                      <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">Last 30 days</UIText>
                      {!activity ? (
                        <ActivityIndicator color={c.brand} className="my-3" />
                      ) : activity.comments.length + activity.reactions.length + activity.holds.length === 0 ? (
                        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 py-2">No comments or reactions yet.</UIText>
                      ) : (
                        <>
                          {activity.holds.map((h) => (
                            <VStack key={`h-${h.id}`} className="py-2 border-b border-surface-100 dark:border-dark-surface-300" testID={`hold-${h.id}`}>
                              <HStack className="items-center gap-1.5">
                                <Ionicons name="hand-left-outline" size={13} color={c.textMuted} />
                                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 flex-1">
                                  {h.stage === 'refused'
                                    ? `${first} wrote ${h.surface === 'message' ? 'a message' : 'a comment'} to ${h.peer.display_name} that was held. It was not sent.`
                                    : `${first} sent ${h.surface === 'message' ? 'a message' : 'a comment'} to ${h.peer.display_name} that was hidden afterwards.`} · {formatRelativeTime(h.created_at)}
                                </UIText>
                              </HStack>
                              <UIText size="sm">{h.text}</UIText>
                              {h.reasons.length > 0 && (
                                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{h.reasons.join('; ')}</UIText>
                              )}
                            </VStack>
                          ))}
                          {activity.comments.map((e) => (
                            <VStack key={`c-${e.id}`} className="py-2 border-b border-surface-100 dark:border-dark-surface-300">
                              <HStack className="items-center">
                                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 flex-1">
                                  {e.direction === 'received' ? `${e.peer.display_name} commented on ${first}'s work` : `${first} commented on ${e.peer.display_name}'s work`} · {formatRelativeTime(e.created_at)}
                                </UIText>
                                {e.direction === 'received' && !e.hidden_at && (
                                  <Pressable onPress={() => hideComment(e)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide this comment" testID={`hide-comment-${e.id}`}>
                                    <UIText size="xs" className="text-error-600 dark:text-error-400">Hide</UIText>
                                  </Pressable>
                                )}
                              </HStack>
                              <UIText size="sm" className={e.hidden_at ? 'text-typo-300 line-through' : ''}>{e.text}</UIText>
                              {e.hidden_at && (
                                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{HIDDEN_BY[e.hidden_reason || ''] || 'Hidden'}</UIText>
                              )}
                            </VStack>
                          ))}
                          {activity.reactions.map((e) => (
                            <UIText key={`r-${e.id}`} size="xs" className="text-typo-500 dark:text-dark-typo-500 py-1.5">
                              {e.direction === 'received' ? `${e.peer.display_name} → ${first}` : `${first} → ${e.peer.display_name}`}: {e.label} · {formatRelativeTime(e.created_at)}
                            </UIText>
                          ))}
                        </>
                      )}
                    </VStack>
                  </Card>
                </>
              )}
            </VStack>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
