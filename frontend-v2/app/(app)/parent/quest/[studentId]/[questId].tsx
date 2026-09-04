/**
 * Parent Quest View — a kid's quest, shown exactly as the kid sees it.
 *
 * This route used to be its own read-mostly page: a stripped task list with an
 * evidence uploader, no big_idea, no journal moments, no class credit ring, and
 * task authoring only for under-13 dependents. Parents asked for the real
 * screen, so it renders the same QuestDetailView the learner's own route does,
 * pointed at the child.
 *
 * Everything about the delegation — which endpoint each write goes to, which
 * controls a parent gets at all — lives in QuestDetailView and useQuestDetail.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { QuestDetailView } from '@/src/components/quests/QuestDetailView';

export default function ParentQuestViewPage() {
  const { studentId, questId } = useLocalSearchParams<{ studentId: string; questId: string }>();
  return <QuestDetailView questId={questId || null} studentId={studentId || null} />;
}
