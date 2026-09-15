/**
 * FeedItemMenu - overflow menu for feed cards.
 *
 * Lets the user report a feed item or block the student who posted it.
 * Required for App Store Guideline 1.2 (user-generated content moderation).
 *
 * The block row said "Unfollow" until 2026-09-16, which was the wrong word
 * once the person could be a friend: a block is a block (it hides them, ends
 * the friendship, and beats every other grant), and a friend gets a gentler
 * "Remove friend" beside it that ends the friendship and nothing more.
 */

import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText, Button, ButtonText, VStack, Divider, BottomSheet } from '../ui';
import api from '@/src/services/api';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { showAlert, confirmAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

type Reason = 'spam' | 'harassment' | 'inappropriate' | 'self_harm' | 'other';
type TargetType = 'learning_event' | 'task_completion';

const REASONS: { value: Reason; label: string; description: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate content', description: 'Contains offensive or unsafe content.' },
  { value: 'harassment', label: 'Harassment or bullying', description: 'Targets or threatens someone.' },
  { value: 'spam', label: 'Spam', description: 'Unwanted promotional or repetitive content.' },
  { value: 'self_harm', label: 'Self-harm', description: 'Suggests self-harm or dangerous behavior.' },
  { value: 'other', label: 'Other', description: 'Something else that needs review.' },
];

export interface FeedItemMenuProps {
  visible: boolean;
  onClose: () => void;
  targetType: TargetType;
  targetId: string;
  studentId: string | null;
  studentName: string;
  /** The poster is a connected friend of the viewer. */
  isFriend?: boolean;
  onBlocked?: () => void;
}

export function FeedItemMenu({
  visible,
  onClose,
  targetType,
  targetId,
  studentId,
  studentName,
  isFriend = false,
  onBlocked,
}: FeedItemMenuProps) {
  const [stage, setStage] = useState<'root' | 'reason' | 'submitting'>('root');

  const reset = () => {
    setStage('root');
    onClose();
  };

  const submitReport = async (reason: Reason) => {
    setStage('submitting');
    try {
      await api.post('/api/moderation/report', {
        target_type: targetType,
        target_id: targetId,
        reason,
      });
      showAlert('Thanks', 'We received your report and will review it.');
      reset();
    } catch (err: unknown) {
      showAlert('Error', extractApiError(err, 'Could not submit report.').message);
      setStage('reason');
    }
  };

  const blockStudent = async () => {
    if (!studentId) {
      reset();
      return;
    }
    const confirmed = await confirmAlert({
      title: `Block ${studentName}?`,
      message: `You will no longer see ${studentName}'s posts, and they will not see yours. They will not be notified.`,
      confirmText: 'Block',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.post('/api/moderation/block', { blocked_id: studentId });
      onBlocked?.();
      reset();
    } catch (err: unknown) {
      showAlert('Error', extractApiError(err, 'Could not block this user.').message);
    }
  };

  const removeFriend = async () => {
    if (!studentId) {
      reset();
      return;
    }
    const confirmed = await confirmAlert({
      title: `Remove ${studentName} as a friend?`,
      message: "You will no longer see each other's work. They will not be told.",
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      // The connection id is not on the card; the list knows it.
      const res = await api.get('/api/connections');
      const active: { id: string; peer?: { id?: string } }[] = (res.data?.data || res.data || {}).active || [];
      const conn = active.find((x) => x?.peer?.id === studentId);
      if (conn) await api.post(`/api/connections/${conn.id}/revoke`, {});
      onBlocked?.();
      reset();
    } catch (err: unknown) {
      showAlert('Error', extractApiError(err, 'Could not remove this friend.').message);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={reset}>
      {stage === 'root' && (
        <VStack space="sm">
          <Pressable onPress={() => setStage('reason')} className="py-3">
            <HStackRow icon="flag-outline" label="Report this post" />
          </Pressable>
          {studentId && isFriend && (
            <>
              <Divider />
              <Pressable onPress={removeFriend} className="py-3">
                <HStackRow icon="person-remove-outline" label={`Remove ${studentName} as a friend`} />
              </Pressable>
            </>
          )}
          {studentId && (
            <>
              <Divider />
              <Pressable onPress={blockStudent} className="py-3">
                <HStackRow
                  icon="close-circle"
                  label={`Block ${studentName}`}
                  destructive
                />
              </Pressable>
            </>
          )}
          <Divider />
          <Pressable onPress={reset} className="py-3">
            <UIText size="md" className="text-typo-500 dark:text-dark-typo-500 text-center">Cancel</UIText>
          </Pressable>
        </VStack>
      )}

      {stage === 'reason' && (
        <VStack space="sm">
          <Heading size="md">Why are you reporting this?</Heading>
          {REASONS.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => submitReport(r.value)}
              className="py-3"
            >
              <VStack>
                <UIText size="sm" className="font-poppins-medium">{r.label}</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{r.description}</UIText>
              </VStack>
            </Pressable>
          ))}
          <Button variant="outline" onPress={reset}>
            <ButtonText>Cancel</ButtonText>
          </Button>
        </VStack>
      )}

      {stage === 'submitting' && (
        <View className="items-center py-8">
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Submitting…</UIText>
        </View>
      )}
    </BottomSheet>
  );
}

function HStackRow({ icon, label, destructive }: { icon: keyof typeof Ionicons.glyphMap; label: string; destructive?: boolean }) {
  const c = useThemeColors();
  const color = destructive ? '#DC2626' : c.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Ionicons name={icon} size={20} color={color} />
      <UIText size="md" style={{ color }}>{label}</UIText>
    </View>
  );
}
