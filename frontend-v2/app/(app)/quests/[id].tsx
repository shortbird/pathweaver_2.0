/**
 * Quest Detail route — the signed-in learner's own quest.
 *
 * The screen itself lives in QuestDetailView, which a parent renders too (see
 * app/(app)/parent/quest/[studentId]/[questId].tsx) pointed at their kid. One
 * component, so the two views cannot drift apart.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { QuestDetailView } from '@/src/components/quests/QuestDetailView';

export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <QuestDetailView questId={id || null} />;
}
