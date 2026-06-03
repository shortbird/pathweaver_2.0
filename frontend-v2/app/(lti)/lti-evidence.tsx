/**
 * Teacher evidence review — Canvas SpeedGrader target.
 *
 * Opened unauthenticated by the grading teacher. The only credential is the
 * signed `lti_token` in the URL (minted by grade-sync, scoped to one
 * user+quest). We hit GET /lti/evidence?lti_token=... which derives the
 * (student, quest) from the token itself and returns ONLY that quest's
 * tasks + non-private evidence + earned XP — never the full portfolio.
 *
 * Read-only. Renders inside LtiShell so it sizes the Canvas iframe and
 * stays width-constrained in the cramped SpeedGrader pane.
 *
 * NOTE: not yet wired to AGS. grade-sync keeps pointing at the v1
 * /public/diploma URL until the staged v2-as-LTI-host cutover (Phase 4).
 */

import { useEffect, useState } from 'react';
import { Image, Linking, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/src/services/api';
import { LtiShell } from '@/src/components/lti/LtiShell';
import {
  VStack, HStack, UIText, Card, Badge, BadgeText, Divider,
} from '@/src/components/ui';

interface EvidenceBlock {
  block_type: string | null;
  content: Record<string, unknown> | null;
  order_index: number | null;
}
interface EvidenceTask {
  id: string;
  title: string | null;
  pillar: string | null;
  xp_value: number | null;
  is_completed: boolean;
  completed_at: string | null;
  evidence_blocks: EvidenceBlock[];
}
interface EvidencePayload {
  student: { display_name: string | null };
  quest: { id: string; title: string | null };
  earned_xp: number;
  tasks: EvidenceTask[];
}

function blockUrl(b: EvidenceBlock): string | null {
  const c = (b.content || {}) as Record<string, unknown>;
  return (
    (c.url as string) ||
    (c.file_url as string) ||
    (c.link as string) ||
    null
  );
}

function EvidenceBlockView({ block }: { block: EvidenceBlock }) {
  const type = (block.block_type || '').toLowerCase();
  const c = (block.content || {}) as Record<string, unknown>;

  if (type === 'text') {
    return (
      <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700">
        {(c.text as string) || ''}
      </UIText>
    );
  }
  if (type === 'image') {
    const url = blockUrl(block);
    return url ? (
      <Image
        source={{ uri: url }}
        style={{ width: '100%', height: 200, borderRadius: 8 }}
        resizeMode="cover"
        accessibilityLabel="Student image evidence"
      />
    ) : null;
  }
  // link / video / document / file → tappable URL (videos aren't inlined in
  // the cramped SpeedGrader pane; a labelled link is the pragmatic choice).
  const url = blockUrl(block);
  if (!url) return null;
  const label =
    type === 'video'
      ? '▶ Video evidence'
      : type === 'link'
        ? `🔗 ${(c.title as string) || url}`
        : `📄 ${(c.file_name as string) || (c.title as string) || 'Attached file'}`;
  return (
    <Pressable onPress={() => Linking.openURL(url)}>
      <UIText size="sm" className="text-primary-600 underline">
        {label}
      </UIText>
    </Pressable>
  );
}

export default function LtiEvidence() {
  const params = useLocalSearchParams<{ lti_token?: string }>();
  const [data, setData] = useState<EvidencePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.lti_token;
    if (!token) {
      setError('This evidence link is missing its access token.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = api.defaults.baseURL || '';
        // Direct fetch (not the api instance) so the unauthenticated
        // SpeedGrader context doesn't trip the 401 refresh interceptor.
        const res = await fetch(
          `${base}/lti/evidence?lti_token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(
            res.status === 401
              ? 'This evidence link is invalid or has expired. Re-open it from the Canvas gradebook.'
              : 'Could not load the student evidence.',
          );
          return;
        }
        setData((await res.json()) as EvidencePayload);
      } catch {
        if (!cancelled) setError('Could not load the student evidence.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.lti_token]);

  if (loading) return <LtiShell loading />;
  if (error || !data) return <LtiShell error={error || 'No evidence found.'} />;

  const completed = data.tasks.filter((t) => t.is_completed).length;

  return (
    <LtiShell
      title={data.quest.title || 'Quest'}
      subtitle={data.student.display_name || undefined}
    >
      <VStack space="md">
        <HStack space="sm" className="items-center">
          <Badge>
            <BadgeText>{data.earned_xp} XP earned</BadgeText>
          </Badge>
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
            {completed}/{data.tasks.length} tasks complete
          </UIText>
        </HStack>
        <Divider />
        {data.tasks.length === 0 ? (
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
            This student hasn't created any tasks for this quest yet.
          </UIText>
        ) : (
          data.tasks.map((task) => (
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
                    <BadgeText>{task.xp_value ?? 0} XP</BadgeText>
                  </Badge>
                </HStack>
                {task.is_completed ? (
                  <UIText size="xs" className="text-success-600">
                    Completed
                  </UIText>
                ) : (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    Not yet completed
                  </UIText>
                )}
                {task.evidence_blocks.length > 0 ? (
                  <VStack space="sm" className="mt-1">
                    {task.evidence_blocks.map((b, i) => (
                      <EvidenceBlockView key={i} block={b} />
                    ))}
                  </VStack>
                ) : task.is_completed ? (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    (No evidence attached)
                  </UIText>
                ) : null}
              </VStack>
            </Card>
          ))
        )}
      </VStack>
    </LtiShell>
  );
}
