/**
 * ChildConnections - one child's friends, on their card.
 *
 * A request waiting on the parent renders in full: it is the consent, and
 * the consent text stays where it is stated -- what the other student would
 * be able to see, and that it can be undone later. A consent screen that
 * says "approve connection?" and nothing else is a click, not a consent.
 * The connections already approved sit under it with the way to end them:
 * revocation was always in the API, but with no surface a parent who
 * changed their mind had to email support.
 *
 * Since 2026-09-16 the card also carries the way INTO the child's Friends
 * screen (parent/friends/<id>): the policy, the whole list, the requests a
 * parent answers on a dependent's behalf, and the "connect with a friend"
 * flow. The card stays a summary.
 */

import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { HStack, UIText, VStack, Button, ButtonText, Card } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { confirmAlert, showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import type { ApprovedConnection, ConnectionApprovals, PendingConnection } from '@/src/hooks/useConnectionApprovals';

const DISCLOSURE = [
  "They would each be able to see the other's portfolio and work",
  'They would each be able to leave comments on that work',
  "They would not see each other's email address or birthday",
  'You can undo this at any time',
];

interface Props {
  connections: ConnectionApprovals;
  busy: boolean;
  onDecide: (connectionId: string, approve: boolean) => Promise<void>;
  onRevoke: (connectionId: string) => Promise<void>;
  /** The child this card is about; opens their Friends screen. */
  childId?: string;
  childFirstName?: string;
}

function PendingCard({ request, busy, onDecide }: { request: PendingConnection; busy: boolean; onDecide: Props['onDecide'] }) {
  const decide = async (approve: boolean) => {
    try {
      await onDecide(request.connection_id, approve);
    } catch (err) {
      showAlert('Could not save your answer', extractApiError(err).message);
    }
  };
  return (
    <Card variant="outline" size="sm">
      <VStack space="sm">
        <UIText size="sm" className="font-poppins-semibold">
          {request.child.display_name} wants to connect with {request.peer.display_name}
        </UIText>
        <VStack space="xs">
          {DISCLOSURE.map((line) => (
            <UIText key={line} size="xs" className="text-typo-500 dark:text-dark-typo-500">{'•'} {line}</UIText>
          ))}
        </VStack>
        {request.approver_kind === 'org_admin' && (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            You are being asked as this student's school administrator, because no parent or guardian account is linked to them.
          </UIText>
        )}
        <HStack className="gap-2">
          <Button size="sm" onPress={() => decide(true)} disabled={busy}>
            <ButtonText>Approve</ButtonText>
          </Button>
          <Button size="sm" variant="outline" action="secondary" onPress={() => decide(false)} disabled={busy}>
            <ButtonText>Decline</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Card>
  );
}

function ActiveRow({ connection, busy, onRevoke }: { connection: ApprovedConnection; busy: boolean; onRevoke: Props['onRevoke'] }) {
  const c = useThemeColors();
  const revoke = async () => {
    const ok = await confirmAlert({
      title: 'Remove this connection?',
      message: `${connection.child.display_name} and ${connection.peer.display_name} will no longer see each other's work.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await onRevoke(connection.connection_id);
    } catch (err) {
      showAlert('Could not remove that connection', extractApiError(err).message);
    }
  };
  return (
    <HStack className="items-center gap-2 rounded-lg border border-surface-200 dark:border-dark-surface-300 px-3 py-2">
      <Ionicons name="people-outline" size={14} color={c.iconMuted} />
      <UIText size="sm" className="flex-1" numberOfLines={1}>Connected with {connection.peer.display_name}</UIText>
      <Pressable
        onPress={revoke}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove the connection with ${connection.peer.display_name}`}
      >
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Remove</UIText>
      </Pressable>
    </HStack>
  );
}

export function ChildConnections({ connections, busy, onDecide, onRevoke, childId, childFirstName }: Props) {
  const c = useThemeColors();
  const { pending, approved } = connections;
  const open = childId ? () => router.push(`/(app)/parent/friends/${childId}` as any) : undefined;
  return (
    <VStack className="mt-3" space="xs">
      <HStack className="items-center gap-1.5">
        <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">
          Friends
        </UIText>
        {pending.length > 0 && (
          <UIText size="xs" className="rounded-full bg-optio-pink px-1.5 text-white font-poppins-bold" style={{ fontSize: 10, lineHeight: 16 }}>
            {pending.length}
          </UIText>
        )}
      </HStack>
      {pending.map((r) => <PendingCard key={r.connection_id} request={r} busy={busy} onDecide={onDecide} />)}
      {approved.map((a) => <ActiveRow key={a.connection_id} connection={a} busy={busy} onRevoke={onRevoke} />)}
      {open && (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`Manage ${childFirstName || 'this child'}'s friends`}
          testID={`child-friends-${childId}`}
          className="flex-row items-center gap-2 py-2"
        >
          <Ionicons name="people-outline" size={16} color={c.brand} />
          <UIText size="sm" className="flex-1 text-optio-purple font-poppins-medium">
            {approved.length > 0 || pending.length > 0 ? 'Manage friends and settings' : `Friends settings for ${childFirstName || 'this child'}`}
          </UIText>
          <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
        </Pressable>
      )}
    </VStack>
  );
}
