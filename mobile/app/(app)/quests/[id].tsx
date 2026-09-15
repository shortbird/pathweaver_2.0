/**
 * Quest Detail route — the signed-in learner's own quest, or, for a parent in
 * family scope, the CHILD's copy of it.
 *
 * The screen itself lives in QuestDetailView. A parent reaches it from the
 * Family tab, the family quests section, the OEA credits page and old
 * `/parent/quest/<sid>/<qid>` links alike: every one of them points the
 * family scope (stores/familyStore) at the child and lands here. The second
 * route that used to carry the child in its path went on 2026-09-15.
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
