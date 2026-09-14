/**
 * Quest Detail route — the signed-in learner's own quest, or, for a parent in
 * family scope, the CHILD's copy of it.
 *
 * The screen itself lives in QuestDetailView. A parent reaches it two ways:
 * from anywhere in the child's own screens (this route, with the child from
 * stores/familyStore) and from the explicit deep link
 * app/(app)/parent/quest/[studentId]/[questId].tsx. One component, so the
 * views cannot drift apart.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { QuestDetailView } from '@/src/components/quests/QuestDetailView';
import { useIsParent } from '@/src/hooks/useStartSomething';
import { useSelectedChild } from '@/src/stores/familyStore';

export default function QuestDetailScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const isParent = useIsParent();
  const scopedChild = useSelectedChild();
  // `new=1` comes from CreateQuestSheet: a quest the learner just wrote has no
  // tasks, so open the task wizard on its AI step instead of an empty list.
  return (
    <QuestDetailView
      questId={id || null}
      studentId={isParent ? scopedChild?.id || null : null}
      autoOpenTaskWizard={isNew === '1'}
    />
  );
}
