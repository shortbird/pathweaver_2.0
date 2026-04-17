/**
 * FeedItemMenu - overflow menu for feed cards.
 *
 * Lets the user report a feed item or block the student who posted it.
 * Required for App Store Guideline 1.2 (user-generated content moderation).
 */

import React, { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText, Button, ButtonText, VStack, Divider, BottomSheet } from '../ui';
import api from '@/src/services/api';

type Reason = 'spam' | 'harassment' | 'inappropriate' | 'self_harm' | 'other';
type TargetType = 'learning_event' | 'task_completion';

const REASONS: Array<{ value: Reason; label: string; description: string }> = [
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
  onBlocked?: () => void;
}

export function FeedItemMenu({
  visible,
  onClose,
  targetType,
  targetId,
  studentId,
  studentName,
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
      Alert.alert('Thanks', 'We received your report and will review it.');
      reset();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not submit report.');
      setStage('reason');
    }
  };

  const blockStudent = async () => {
    if (!studentId) {
      reset();
      return;
    }
    Alert.alert(
      `Unfollow ${studentName}?`,
      `You will no longer see ${studentName}'s posts in your feed. They will not be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/api/moderation/block', { blocked_id: studentId });
              onBlocked?.();
              reset();
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.error || 'Could not unfollow user.');
            }
          },
        },
      ],
    );
  };

  return (
    <BottomSheet visible={visible} onClose={reset}>
      {stage === 'root' && (
        <VStack space="sm">
          <Pressable onPress={() => setStage('reason')} className="py-3">
            <HStackRow icon="flag-outline" label="Report this post" />
          </Pressable>
          {studentId && (
            <>
              <Divider />
              <Pressable onPress={blockStudent} className="py-3">
                <HStackRow
                  icon="close-circle"
                  label={`Unfollow ${studentName}`}
                  destructive
                />
              </Pressable>
            </>
          )}
          <Divider />
          <Pressable onPress={reset} className="py-3">
            <UIText size="md" className="text-typo-500 text-center">Cancel</UIText>
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
                <UIText size="xs" className="text-typo-400">{r.description}</UIText>
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
          <UIText size="sm" className="text-typo-500">Submitting…</UIText>
        </View>
      )}
    </BottomSheet>
  );
}

function HStackRow({ icon, label, destructive }: { icon: any; label: string; destructive?: boolean }) {
  const color = destructive ? '#DC2626' : '#111827';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Ionicons name={icon} size={20} color={color} />
      <UIText size="md" style={{ color }}>{label}</UIText>
    </View>
  );
}
