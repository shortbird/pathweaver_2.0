/**
 * Iframe quest detail.
 *
 * Reached after a student clicks an Optio assignment in Canvas. The launch
 * handler resolves the quest_id, mints tokens, and redirects here. We
 * auto-enroll the student if they haven't started, surface the AI
 * personalization wizard until they have at least one task, then show the
 * task list with text-evidence inputs.
 *
 * Quest auto-completes when all required tasks are done — at that point
 * the backend's atomic_quest_service triggers AGS grade sync to Canvas.
 * UX-wise we just confirm "Submitted to your teacher" once the quest's
 * `completed_enrollment` flips to non-null.
 *
 * This is a deliberately compact iframe view — the full Notion-style
 * (app)/quests/[id] page is too dense for a Canvas embed. Behavior parity
 * is what matters: same backend endpoints, same personalization flow.
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuestDetail } from '@/src/hooks/useQuestDetail';
import api from '@/src/services/api';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Input, InputField,
} from '@/src/components/ui';

export default function LtiQuestDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const questId = params.id || null;
  const { quest, loading, error, enroll, completeTask, generateTasks, acceptTask, refetch } =
    useQuestDetail(questId);

  // Auto-enroll on first render so the student doesn't need to press a button.
  const [enrollAttempted, setEnrollAttempted] = useState(false);
  useEffect(() => {
    if (!quest || enrollAttempted) return;
    setEnrollAttempted(true);
    if (!quest.user_enrollment) {
      enroll().catch(() => {/* swallow — UI shows error state otherwise */});
    }
  }, [quest, enrollAttempted, enroll]);

  const taskList = quest?.quest_tasks || [];
  const completedCount = taskList.filter((t) => t.is_completed).length;
  const allDone = taskList.length > 0 && completedCount === taskList.length;
  const submitted = !!quest?.completed_enrollment && !quest?.user_enrollment;

  if (loading || !quest) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <UIText size="sm" className="text-error-600 text-center">
          {error}
        </UIText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <VStack space="lg" className="max-w-3xl mx-auto w-full">
        <VStack space="xs">
          <Heading size="xl">{quest.title}</Heading>
          {quest.description ? (
            <UIText size="md" className="text-typo-600">
              {quest.description}
            </UIText>
          ) : null}
        </VStack>

        {submitted ? (
          <Card variant="elevated" size="md">
            <VStack space="sm">
              <UIText size="md" className="font-poppins-semibold text-typo-900">
                Submitted to your teacher
              </UIText>
              <UIText size="sm" className="text-typo-600">
                Your teacher will see your evidence in Canvas SpeedGrader.
                You can keep adding to your portfolio in Optio anytime.
              </UIText>
            </VStack>
          </Card>
        ) : (
          <>
            {taskList.length === 0 ? (
              <PersonalizeCta
                onGenerate={async (interest) => {
                  const generated = await generateTasks(interest);
                  // Accept up to 3 generated tasks so the student has a starting point.
                  for (const task of generated.slice(0, 3)) {
                    await acceptTask(task);
                  }
                  await refetch();
                }}
              />
            ) : (
              <TaskList
                tasks={taskList}
                onComplete={async (taskId, text) => {
                  await completeTask(taskId, [
                    { type: 'text', content: { text } },
                  ]);
                  await refetch();
                }}
              />
            )}
            {allDone && !submitted && (
              <Card variant="outlined" size="sm">
                <UIText size="sm" className="text-typo-600">
                  All tasks complete — your submission is on its way to Canvas.
                </UIText>
              </Card>
            )}
          </>
        )}
      </VStack>
    </ScrollView>
  );
}

function PersonalizeCta({
  onGenerate,
}: {
  onGenerate: (interest: string) => Promise<void>;
}) {
  const [interest, setInterest] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card variant="elevated" size="md">
      <VStack space="md">
        <VStack space="xs">
          <Heading size="md">Plan your approach</Heading>
          <UIText size="sm" className="text-typo-600">
            Tell Optio what you're into — sports, music, video games, code,
            cooking, anything — and we'll generate tasks that connect this
            assignment to it.
          </UIText>
        </VStack>
        <Input>
          <InputField
            placeholder="e.g. skateboarding, robotics, baking"
            value={interest}
            onChangeText={setInterest}
          />
        </Input>
        {err && <UIText size="sm" className="text-error-600">{err}</UIText>}
        <HStack className="justify-end">
          <Button
            action="primary"
            disabled={busy}
            onPress={async () => {
              setErr(null);
              setBusy(true);
              try {
                await onGenerate(interest.trim());
              } catch (e: unknown) {
                setErr(e instanceof Error ? e.message : 'Could not generate tasks');
              } finally {
                setBusy(false);
              }
            }}
          >
            <ButtonText>{busy ? 'Generating…' : 'Generate tasks'}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Card>
  );
}

function TaskList({
  tasks,
  onComplete,
}: {
  tasks: Array<{ id: string; title: string; description: string; pillar: string; xp_value: number; is_completed: boolean }>;
  onComplete: (taskId: string, evidenceText: string) => Promise<void>;
}) {
  return (
    <VStack space="md">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onComplete={onComplete} />
      ))}
    </VStack>
  );
}

function TaskRow({
  task,
  onComplete,
}: {
  task: { id: string; title: string; description: string; pillar: string; xp_value: number; is_completed: boolean };
  onComplete: (taskId: string, evidenceText: string) => Promise<void>;
}) {
  const [evidence, setEvidence] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card variant={task.is_completed ? 'outlined' : 'elevated'} size="sm">
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <UIText size="md" className="font-poppins-semibold text-typo-900">
            {task.title}
          </UIText>
          <Badge>
            <BadgeText>{task.xp_value} XP</BadgeText>
          </Badge>
        </HStack>
        {task.description ? (
          <UIText size="sm" className="text-typo-600">
            {task.description}
          </UIText>
        ) : null}
        {task.is_completed ? (
          <UIText size="sm" className="text-success-600">
            Completed
          </UIText>
        ) : (
          <>
            <Input>
              <InputField
                placeholder="Write what you did, learned, or made"
                value={evidence}
                onChangeText={setEvidence}
                multiline
                numberOfLines={3}
              />
            </Input>
            {err && <UIText size="sm" className="text-error-600">{err}</UIText>}
            <HStack className="justify-end">
              <Button
                disabled={submitting || !evidence.trim()}
                onPress={async () => {
                  setErr(null);
                  setSubmitting(true);
                  try {
                    await onComplete(task.id, evidence.trim());
                  } catch (e: unknown) {
                    setErr(
                      e instanceof Error ? e.message : 'Could not mark complete',
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <ButtonText>{submitting ? 'Submitting…' : 'Mark complete'}</ButtonText>
              </Button>
            </HStack>
          </>
        )}
      </VStack>
    </Card>
  );
}
