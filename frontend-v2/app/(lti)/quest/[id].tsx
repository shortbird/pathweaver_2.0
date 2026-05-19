/**
 * Student quest detail (Canvas iframe).
 *
 * Reached after a student opens an Optio assignment in Canvas. We
 * auto-enroll, surface the AI personalization wizard until there's at
 * least one task, then list tasks with the multi-format LtiEvidenceEditor
 * (text / link / image / video / file — parity with the rest of Optio).
 *
 * Renders inside LtiShell so it sizes the Canvas iframe and stays
 * width-constrained. Quest auto-completes when all tasks are done; the
 * backend then triggers AGS grade sync.
 */

import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuestDetail } from '@/src/hooks/useQuestDetail';
import { LtiShell } from '@/src/components/lti/LtiShell';
import { LtiEvidenceEditor } from '@/src/components/lti/LtiEvidenceEditor';
import {
  VStack, HStack, UIText, Card, Button, ButtonText, Badge, BadgeText, Input, InputField,
} from '@/src/components/ui';

export default function LtiQuestDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const questId = params.id || null;
  const { quest, loading, error, enroll, completeTask, generateTasks, acceptTask, refetch } =
    useQuestDetail(questId);

  const [enrollAttempted, setEnrollAttempted] = useState(false);
  useEffect(() => {
    if (!quest || enrollAttempted) return;
    setEnrollAttempted(true);
    if (!quest.user_enrollment) {
      enroll().catch(() => {/* error surfaces via the hook */});
    }
  }, [quest, enrollAttempted, enroll]);

  if (loading || !quest) return <LtiShell loading />;
  if (error) return <LtiShell error={error} />;

  const taskList = quest.quest_tasks || [];
  const completedCount = taskList.filter((t) => t.is_completed).length;
  const allDone = taskList.length > 0 && completedCount === taskList.length;
  const submitted = !!quest.completed_enrollment && !quest.user_enrollment;

  return (
    <LtiShell title={quest.title} subtitle={quest.description || undefined}>
      {submitted ? (
        <Card variant="elevated" size="md">
          <VStack space="sm">
            <UIText size="md" className="font-poppins-semibold text-typo-900">
              Submitted to your teacher
            </UIText>
            <UIText size="sm" className="text-typo-600">
              Your teacher will see your evidence in Canvas SpeedGrader. You
              can keep adding to your portfolio in Optio anytime.
            </UIText>
          </VStack>
        </Card>
      ) : taskList.length === 0 ? (
        <PersonalizeCta
          onGenerate={async (interest) => {
            const generated = await generateTasks(interest);
            for (const task of (generated || []).slice(0, 3)) {
              await acceptTask(task);
            }
            await refetch();
          }}
        />
      ) : (
        <VStack space="md">
          {taskList.map((task) => (
            <Card
              key={task.id}
              variant={task.is_completed ? 'outline' : 'elevated'}
              size="sm"
            >
              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <UIText
                    size="md"
                    className="font-poppins-semibold text-typo-900 flex-1"
                  >
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
                  <LtiEvidenceEditor
                    taskId={task.id}
                    onComplete={async (blocks) => {
                      await completeTask(task.id, blocks);
                      await refetch();
                    }}
                  />
                )}
              </VStack>
            </Card>
          ))}
          {allDone && !submitted && (
            <Card variant="outline" size="sm">
              <UIText size="sm" className="text-typo-600">
                All tasks complete — your submission is on its way to Canvas.
              </UIText>
            </Card>
          )}
        </VStack>
      )}
    </LtiShell>
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
          <UIText size="md" className="font-poppins-semibold text-typo-900">
            Plan your approach
          </UIText>
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
            testID="lti-personalize-interest"
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
