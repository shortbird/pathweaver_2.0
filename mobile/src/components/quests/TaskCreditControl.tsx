/**
 * Diploma credit on a completed task: the Request Credit button, or where the
 * request stands. Mounted only inside an opened, completed task row, so the
 * status read happens when somebody is looking at it, not once per task in
 * the list.
 *
 * Whether to mount it at all is offersTaskCredit's call (hooks/useTaskCredit).
 * The web twin is the credit cluster in
 * web/src/components/quest/taskWorkspace/TaskEvidenceSection.jsx.
 */

import React from 'react';
import { Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, UIText } from '@/src/components/ui';
import { useTaskCredit, type DiplomaStatus } from '@/src/hooks/useTaskCredit';
import { CreditPrecheckSheet } from '@/src/components/quests/CreditPrecheckSheet';

const STATUS_CHIP: Partial<Record<DiplomaStatus, { label: string; tone: string; text: string; color: string }>> = {
  pending_review: {
    label: 'Credit requested · awaiting review',
    tone: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-500', color: '#B45309',
  },
  pending_org_approval: {
    label: 'Credit requested · awaiting your school',
    tone: 'bg-optio-purple/10', text: 'text-optio-purple', color: '#6d469b',
  },
  finalized: {
    label: 'Credit approved',
    tone: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-500', color: '#16A34A',
  },
};

export function TaskCreditControl({ taskId, studentId = null }: { taskId: string; studentId?: string | null }) {
  const credit = useTaskCredit(taskId, { studentId });
  const { status } = credit;
  if (!status) return null;

  const chip = STATUS_CHIP[status];
  if (chip) {
    return (
      <HStack
        testID="task-credit-status"
        className={`self-start items-center gap-1.5 px-2.5 py-1 rounded-full ${chip.tone}`}
        accessibilityLabel={chip.label}
      >
        <Ionicons name="school-outline" size={14} color={chip.color} />
        <UIText size="xs" className={`font-poppins-medium ${chip.text}`}>{chip.label}</UIText>
      </HStack>
    );
  }

  if (status !== 'none' && status !== 'grow_this') return null;
  const isResubmit = status === 'grow_this';
  const label = isResubmit ? 'Resubmit for credit' : 'Request credit';
  const busy = credit.submitting && !credit.precheckOpen;

  return (
    <>
      <Pressable
        testID="request-credit-btn"
        onPress={(e) => { e.stopPropagation(); if (!busy) credit.requestCredit(); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Sends this task to a reviewer for diploma credit"
        className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-optio-purple/30 active:bg-optio-purple/10"
        style={{ minHeight: 44 }}
      >
        {busy ? <ActivityIndicator size="small" /> : <Ionicons name="school-outline" size={18} color="#6d469b" />}
        <UIText size="sm" className="text-optio-purple font-poppins-semibold">{label}</UIText>
      </Pressable>
      {isResubmit && (
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
          A reviewer asked for more on this one. Add to your evidence, then resubmit.
        </UIText>
      )}
      {!!credit.error && !credit.precheckOpen && (
        <UIText size="xs" className="text-amber-700 dark:text-amber-500">{credit.error}</UIText>
      )}
      <CreditPrecheckSheet
        visible={credit.precheckOpen}
        precheck={credit.precheck}
        submitting={credit.submitting}
        isResubmit={isResubmit}
        error={credit.error}
        onSubmit={credit.submit}
        onClose={credit.closePrecheck}
      />
    </>
  );
}
