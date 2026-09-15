/**
 * ChildConnections - the friend requests waiting on the parent's yes, for
 * one child. The "ask me first" half of the Friends policy.
 *
 * A request waiting on the parent renders in full: it is the consent, and
 * the consent text stays where it is stated -- what the other student would
 * be able to see, and that it can be undone later. A consent screen that
 * says "approve connection?" and nothing else is a click, not a consent.
 *
 * This sat on the child's Family-tab card until 2026-09-15, next to a
 * second list of the same friendships with a second Remove; the card now
 * carries a one-line count that opens the child's Friends screen
 * (parent/friends/<id>), and this section lives there, above the policy
 * that produced it. The approved list it used to carry is the Friends list
 * on that screen.
 */

import React from 'react';
import { UIText, VStack, HStack, Button, ButtonText, Card } from '@/src/components/ui';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import type { ConnectionApprovals, PendingConnection } from '@/src/hooks/useConnectionApprovals';

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

export function ChildConnections({ connections, busy, onDecide }: Props) {
  const { pending } = connections;
  if (pending.length === 0) return null;
  return (
    <Card variant="outline" size="md" testID="child-connections">
      <VStack space="xs">
        <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">
          Waiting on you
        </UIText>
        {pending.map((r) => <PendingCard key={r.connection_id} request={r} busy={busy} onDecide={onDecide} />)}
      </VStack>
    </Card>
  );
}
