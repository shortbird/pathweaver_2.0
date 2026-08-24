/**
 * Carpool board — families post ride offers and needs, then arrange between
 * themselves over in-app messaging: every post has "Message {name}", addressed
 * by POST id (the author's account id never reaches the client), and the reply
 * lands in Messages. No phone numbers on the board, on purpose.
 *
 * Students see the board (it may explain their own ride) but cannot post or
 * message — the backend enforces both; `canPost` only hides the buttons.
 */

import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Badge, BadgeText, BottomSheet, Button, ButtonText, HStack, Heading,
  Input, InputField, UIText, VStack, toast,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { confirmAlert } from '@/src/utils/alerts';
import type { CarpoolPost } from '@/src/hooks/useSchool';
import { SchoolSection } from './SchoolSection';
import { fmtDate } from './format';

const TYPE_BADGE: Record<string, { label: string; badge: string; text: string }> = {
  offer: { label: 'Offering seats', badge: 'bg-optio-purple/10', text: 'text-optio-purple' },
  need: { label: 'Looking for a ride', badge: 'bg-optio-pink/10', text: 'text-optio-pink' },
};

const EMPTY_FORM = { type: 'offer' as 'offer' | 'need', message: '', area: '', days: '' };

interface CarpoolBoardProps {
  posts: CarpoolPost[];
  canPost: boolean;
  canModerate: boolean;
  onPost: (form: typeof EMPTY_FORM) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onMessage: (id: string, message: string) => Promise<void>;
  /** Open on arrival — the dedicated carpool screen, where the board is the page. */
  defaultOpen?: boolean;
}

export default function CarpoolBoard({ posts, canPost, canModerate, onPost, onRemove, onMessage, defaultOpen }: CarpoolBoardProps) {
  const c = useThemeColors();
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [messageFor, setMessageFor] = useState<CarpoolPost | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState<Set<string>>(() => new Set());

  if (!posts.length && !canPost) return null;

  const submitPost = async () => {
    if (!form.message.trim()) {
      toast.error('Say what you are offering or looking for');
      return;
    }
    setSaving(true);
    try {
      await onPost(form);
      toast.success('Posted to the board');
      setForm(EMPTY_FORM);
      setComposerOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not post');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async (id: string) => {
    const confirmed = await confirmAlert({
      title: 'Remove this post?',
      message: 'It comes off the board for everyone.',
      confirmText: 'Remove',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await onRemove(id);
      toast.success('Post removed');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not remove the post');
    }
  };

  const sendMessage = async () => {
    if (!messageFor || !messageText.trim()) return;
    setSending(true);
    try {
      await onMessage(messageFor.id, messageText.trim());
      setSentFor((prev) => new Set(prev).add(messageFor.id));
      setMessageFor(null);
      setMessageText('');
      toast.success('Sent — replies land in Messages');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <SchoolSection title="Carpool board" icon="car-outline" defaultOpen={defaultOpen}>
      {posts.length === 0 ? (
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">
          No posts yet. Offering seats or looking for a ride? Start the board.
        </UIText>
      ) : (
        <VStack space="sm">
          {posts.map((post) => {
            const badge = TYPE_BADGE[post.type] || TYPE_BADGE.offer;
            const canRemove = post.mine || canModerate;
            return (
              <View
                key={post.id}
                testID={`carpool-${post.id}`}
                className="rounded-lg border border-surface-100 dark:border-dark-surface-300 bg-surface-50/60 dark:bg-dark-surface-200 p-3.5"
              >
                <HStack className="items-center gap-2">
                  <Badge className={`${badge.badge} rounded-full`}>
                    <BadgeText className={`${badge.text} text-[11px] normal-case`}>{badge.label}</BadgeText>
                  </Badge>
                  <View className="flex-1" />
                  <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{fmtDate(post.created_at)}</UIText>
                </HStack>
                <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700 mt-2">{post.message}</UIText>
                {(post.area || post.days) ? (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1">
                    {[post.area, post.days].filter(Boolean).join(' · ')}
                  </UIText>
                ) : null}
                <HStack className="items-center justify-between mt-2.5">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    {post.author_name || 'A family'}
                  </UIText>
                  <HStack className="items-center gap-3">
                    {canRemove && (
                      <Pressable onPress={() => confirmRemove(post.id)} hitSlop={8} testID={`carpool-remove-${post.id}`}>
                        <UIText size="xs" className="text-error-600 font-poppins-medium">Remove</UIText>
                      </Pressable>
                    )}
                    {canPost && !post.mine && (
                      sentFor.has(post.id) ? (
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Sent ✓</UIText>
                      ) : (
                        <Pressable
                          onPress={() => { setMessageFor(post); setMessageText(''); }}
                          hitSlop={8}
                          testID={`carpool-message-${post.id}`}
                        >
                          <UIText size="xs" className="text-optio-purple font-poppins-semibold">
                            Message {post.author_name?.split(' ')[0] || 'them'}
                          </UIText>
                        </Pressable>
                      )
                    )}
                  </HStack>
                </HStack>
              </View>
            );
          })}
        </VStack>
      )}

      {canPost && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-optio-purple/40"
          onPress={() => setComposerOpen(true)}
          testID="carpool-open-composer"
        >
          <Ionicons name="add" size={16} color={c.brand} />
          <ButtonText className="text-optio-purple">Post to the board</ButtonText>
        </Button>
      )}

      {/* Composer */}
      <BottomSheet visible={composerOpen} onClose={() => setComposerOpen(false)}>
        <VStack space="md">
          <Heading size="lg">Post to the carpool board</Heading>
          <HStack space="sm">
            {(['offer', 'need'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setForm({ ...form, type: t })}
                className={`px-4 py-2 rounded-full ${form.type === t ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}
                testID={`carpool-type-${t}`}
              >
                <UIText size="xs" className={form.type === t ? 'text-white font-poppins-medium' : 'text-typo-500 dark:text-dark-typo-500'}>
                  {TYPE_BADGE[t].label}
                </UIText>
              </Pressable>
            ))}
          </HStack>
          <Input>
            <InputField
              placeholder={form.type === 'offer' ? 'e.g. Two seats, mornings from Provo' : 'e.g. Looking for a ride on studio days'}
              value={form.message}
              onChangeText={(v: string) => setForm({ ...form, message: v })}
              multiline
              testID="carpool-message-input"
            />
          </Input>
          <HStack space="sm">
            <Input className="flex-1">
              <InputField
                placeholder="Area (optional)"
                value={form.area}
                onChangeText={(v: string) => setForm({ ...form, area: v })}
              />
            </Input>
            <Input className="flex-1">
              <InputField
                placeholder="Days (optional)"
                value={form.days}
                onChangeText={(v: string) => setForm({ ...form, days: v })}
              />
            </Input>
          </HStack>
          <Button onPress={submitPost} disabled={saving} testID="carpool-submit">
            <ButtonText>{saving ? 'Posting…' : 'Post'}</ButtonText>
          </Button>
        </VStack>
      </BottomSheet>

      {/* First-contact message. The reply arrives as a normal DM. */}
      <BottomSheet visible={messageFor !== null} onClose={() => setMessageFor(null)}>
        <VStack space="md">
          <Heading size="lg">Message {messageFor?.author_name || 'this family'}</Heading>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            Sent privately. Replies arrive in your Messages.
          </UIText>
          <Input>
            <InputField
              placeholder="e.g. Is the Tuesday seat still open?"
              value={messageText}
              onChangeText={setMessageText}
              multiline
              autoFocus
              testID="carpool-dm-input"
            />
          </Input>
          <Button onPress={sendMessage} disabled={sending || !messageText.trim()} testID="carpool-dm-send">
            <ButtonText>{sending ? 'Sending…' : 'Send'}</ButtonText>
          </Button>
        </VStack>
      </BottomSheet>
    </SchoolSection>
  );
}
