/**
 * Parent Journal View — a parent's window into one child's learning journal.
 *
 * Reached from the kid's page on the Family tab. This is intentionally the
 * SAME screen the student sees on their Journal tab — we render the shared
 * JournalScreen with a `studentId`, which routes data + mutations through the
 * parent-scoped endpoints, limits edits to moments the parent captured, and
 * hides the student-only actions that have no parent backend.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import JournalScreen from '@/app/(app)/(tabs)/journal';
import { useMyChildren } from '@/src/hooks/useParent';

export default function ParentJournalPage() {
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  // Resolve the child's name from the linked-children list as a fallback, so
  // the header is correct on deep-link/refresh (nav params can drop).
  const { children } = useMyChildren();
  const child = children.find((c) => c.id === studentId);
  const resolvedName = (name as string) || child?.first_name || child?.display_name?.split(' ')[0] || '';
  const title = resolvedName ? `${resolvedName}'s Journal` : 'Learning Journal';

  return <JournalScreen studentId={studentId} headerTitle={title} />;
}
