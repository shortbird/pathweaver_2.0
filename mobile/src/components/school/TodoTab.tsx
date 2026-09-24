/**
 * The To do tab: what the school has asked this person to do.
 *
 * Mobile had no task screen at all until 2026-09-23 -- a parent who got "The
 * office sent you a task" on their phone was handed to a browser, and a
 * student had nowhere to go. This is the web family To do list on a phone,
 * for a guardian (audience=family) or a student (audience=student).
 *
 * One card per task, tapped open in place. The steps are where the rules
 * live, and every rule here mirrors one the server enforces, so the screen
 * never offers a control the PATCH would refuse:
 *   - a signature step is completed only by signing -- no checkbox, because a
 *     tick without a name is not a signature;
 *   - a step that asks for a file is completed by uploading one, never by a
 *     bare tick;
 *   - an approved step is locked (the office has signed it off);
 *   - an expired task is read-only, comments included.
 *
 * Every write refetches the list (useMyTasks): the task's status and its
 * done/total come from the server, which derives them from the steps.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Pressable, ScrollView, ActivityIndicator, RefreshControl, TextInput, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Badge, BadgeText, Button, ButtonText, Card, HStack, UIText, VStack, toast,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useMyTasks, taskErrorText, TASK_STATUS_LABEL,
  type MyTasks, type Task, type TaskAudience, type TaskComment, type TaskStep,
} from '@/src/hooks/useMyTasks';
import { scanDocumentToPdf } from '@/src/services/documentScanner';
import { safeOpenURL } from '@/src/utils/linking';

// ── Formatting ──

/** "Sep 30" for a YYYY-MM-DD due date. Read in UTC: a bare date parsed by
 *  Date() is midnight UTC, which is the day before in every US timezone. */
export function fmtDueDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(`${String(raw).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (d.getUTCFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  try { return d.toLocaleDateString(undefined, opts); } catch { return ''; }
}

export function dueLine(task: Pick<Task, 'due_date' | 'overdue'>): string {
  const when = fmtDueDate(task.due_date);
  if (!when) return '';
  return task.overdue ? `Overdue, due ${when}` : `Due ${when}`;
}

const STATUS_BADGE: Record<Task['status'], 'info' | 'success' | 'warning' | 'error' | 'muted'> = {
  todo: 'info',
  in_progress: 'warning',
  waiting_on_admin: 'muted',
  done: 'success',
  expired: 'muted',
};

const isTicked = (s: TaskStep) => s.status === 'complete' || s.status === 'approved';

/** The files on a step, old single-file rows included. */
const stepDocuments = (s: TaskStep) => (
  s.documents?.length
    ? s.documents
    : s.document_url ? [{ path: s.document_url, filename: 'Uploaded file' }] : []
);

/** The group a reply task's thread lives in, when it is a group thread: the
 *  Messages tab can open that one directly. A DM thread opens the list. */
const threadGroup = (link?: string | null): string | null => {
  const m = String(link || '').match(/[?&]group=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

// ── A step ──

function StepRow({ task, step, readOnly, statement, tasks }: {
  task: Task;
  step: TaskStep;
  readOnly: boolean;
  statement: string | null;
  tasks: MyTasks;
}) {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [signName, setSignName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const ticked = isTicked(step);
  const approved = step.status === 'approved';
  const docs = stepDocuments(step);
  const id = `${task.id}-${step.key}`;

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(taskErrorText(e, (e as Error)?.message || fallback));
    } finally {
      setBusy(false);
    }
  };

  const openDoc = (path: string) => run(async () => {
    const url = /^https?:/i.test(path) ? path : await tasks.documentUrl(task.id, path);
    if (!url || !(await safeOpenURL(url))) toast.error('Could not open the file');
  }, 'Could not open the file');

  const openSignDoc = (docId: string) => run(async () => {
    const url = await tasks.signDocumentUrl(task.id, docId);
    if (!url || !(await safeOpenURL(url))) toast.error('Could not open the document');
  }, 'Could not open the document');

  const pickPhoto = () => run(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    await tasks.uploadStepFile(task.id, step.key, {
      uri: a.uri, name: a.fileName || 'photo.jpg', type: a.mimeType || 'image/jpeg',
    });
    toast.success('File added');
  }, 'Could not upload the file');

  // Paper forms are the common case: the OS scanner turns a photo of a page
  // into a clean PDF, which is what the office wants on file.
  const scan = () => run(async () => {
    const pdf = await scanDocumentToPdf();
    if (!pdf) return;
    await tasks.uploadStepFile(task.id, step.key, {
      uri: pdf.uri, name: pdf.name, type: 'application/pdf',
    });
    toast.success('File added');
  }, 'Could not scan the document');

  const sign = () => run(async () => {
    await tasks.signStep(task.id, step.key, signName.trim());
    toast.success('Signed');
  }, 'Could not save your signature');

  // What completes this step decides its leading control: a signature step
  // and a file step show a status icon, never a checkbox.
  const plain = !step.needs_signature && !step.needs_document;
  const canTick = plain && !readOnly && !approved;
  const icon = ticked ? 'checkmark-circle' : 'ellipse-outline';

  return (
    <View className="py-3 border-t border-surface-100 dark:border-dark-surface-200" testID={`todo-step-${id}`}>
      <HStack className="items-start gap-3">
        {canTick ? (
          <Pressable
            onPress={() => run(() => tasks.setStepDone(task.id, step.key, !ticked), 'Could not save that step')}
            disabled={busy}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ticked, disabled: busy }}
            accessibilityLabel={step.title}
            hitSlop={8}
            testID={`todo-step-check-${id}`}
          >
            <Ionicons name={ticked ? 'checkbox' : 'square-outline'} size={22} color={ticked ? c.brand : c.iconMuted} />
          </Pressable>
        ) : (
          <View testID={`todo-step-state-${id}`}>
            <Ionicons name={approved ? 'shield-checkmark' : icon} size={22} color={ticked ? c.brand : c.iconMuted} />
          </View>
        )}

        <View className="flex-1">
          <UIText size="sm" className={`font-poppins-medium ${ticked ? 'text-typo-400 dark:text-dark-typo-400' : ''}`}>
            {step.title}
            {step.required === false ? (
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-regular">  (optional)</UIText>
            ) : null}
          </UIText>
          {step.description ? (
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-0.5">{step.description}</UIText>
          ) : null}
          {step.due_date ? (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">Due {fmtDueDate(step.due_date)}</UIText>
          ) : null}
          {approved ? (
            <UIText size="xs" className="text-green-700 dark:text-green-400 mt-0.5">Approved by the office</UIText>
          ) : step.needs_approval && step.status === 'complete' ? (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">Waiting for the office to review</UIText>
          ) : null}
          {step.status === 'rejected' ? (
            <UIText size="xs" className="text-error-600 mt-0.5" testID={`todo-step-rejected-${id}`}>
              The office asked for a change{step.admin_notes ? `: ${step.admin_notes}` : '.'}
            </UIText>
          ) : null}

          {step.link ? (
            <Pressable onPress={() => safeOpenURL(step.link)} accessibilityRole="link" className="flex-row items-center gap-1 mt-1.5 active:opacity-60" testID={`todo-step-link-${id}`}>
              <Ionicons name="open-outline" size={14} color={c.brand} />
              <UIText size="xs" className="text-optio-purple font-poppins-semibold">Open link</UIText>
            </Pressable>
          ) : null}

          {/* Files this person uploaded for the step. */}
          {docs.length > 0 && (
            <VStack space="xs" className="mt-1.5">
              {docs.map((d) => (
                <HStack key={d.path} className="items-center gap-2">
                  <Pressable onPress={() => openDoc(d.path)} className="flex-row items-center gap-1 flex-1 active:opacity-60" accessibilityRole="link">
                    <Ionicons name="document-attach-outline" size={14} color={c.brand} />
                    <UIText size="xs" className="text-optio-purple" numberOfLines={1}>{d.filename || 'Uploaded file'}</UIText>
                  </Pressable>
                  {!readOnly && !approved && step.documents?.length ? (
                    <Pressable
                      onPress={() => run(() => tasks.removeStepFile(task.id, step.key, d.path), 'Could not remove the file')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${d.filename || 'file'}`}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={c.iconMuted} />
                    </Pressable>
                  ) : null}
                </HStack>
              ))}
            </VStack>
          )}

          {/* A step that asks for a file: upload is the only way to finish it. */}
          {step.needs_document && !readOnly && !approved && (
            <HStack className="gap-2 mt-2 flex-wrap">
              {Platform.OS !== 'web' && (
                <Button size="xs" variant="outline" onPress={scan} disabled={busy} testID={`todo-step-scan-${id}`}>
                  <ButtonText>Scan a document</ButtonText>
                </Button>
              )}
              <Button size="xs" variant="outline" onPress={pickPhoto} disabled={busy} testID={`todo-step-upload-${id}`}>
                <ButtonText>{docs.length ? 'Add another photo' : 'Add a photo'}</ButtonText>
              </Button>
            </HStack>
          )}

          {/* A step that asks for a signature: signing is the only way to finish it. */}
          {step.needs_signature && (
            step.signature ? (
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1.5" testID={`todo-step-signed-${id}`}>
                Signed by {step.signature.name}{step.signature.signed_at ? ` on ${fmtDueDate(step.signature.signed_at)}` : ''}
              </UIText>
            ) : Array.isArray(step.sign_docs) && step.sign_docs.length === 0 ? (
              // The office has not attached the document yet; a sign box now
              // would be a signature on nothing.
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1.5" testID={`todo-step-nodoc-${id}`}>
                Your document is not here yet
              </UIText>
            ) : readOnly ? null : (
              <View className="mt-2" testID={`todo-step-sign-${id}`}>
                {(step.sign_docs || []).map((d) => (
                  <Pressable key={d.id} onPress={() => openSignDoc(d.id)} accessibilityRole="link" className="flex-row items-center gap-1 mb-1.5 active:opacity-60">
                    <Ionicons name="document-text-outline" size={14} color={c.brand} />
                    <UIText size="xs" className="text-optio-purple font-poppins-semibold">Read {d.title}</UIText>
                  </Pressable>
                ))}
                <TextInput
                  value={signName}
                  onChangeText={setSignName}
                  placeholder="Your full name"
                  placeholderTextColor={c.iconMuted}
                  autoCapitalize="words"
                  accessibilityLabel="Your full name"
                  testID={`todo-step-sign-name-${id}`}
                  className="border border-surface-300 dark:border-dark-surface-300 rounded-xl px-3 py-2 text-sm bg-white dark:bg-dark-surface-100 text-typo dark:text-dark-typo"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
                <Pressable
                  onPress={() => setAgreed((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                  testID={`todo-step-sign-agree-${id}`}
                  className="flex-row items-start gap-2 mt-2"
                >
                  <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={18} color={agreed ? c.brand : c.iconMuted} />
                  <UIText size="xs" className="flex-1 text-typo-500 dark:text-dark-typo-500">
                    {statement || 'I agree that typing my name is my signature.'}
                  </UIText>
                </Pressable>
                <Button
                  size="xs"
                  className="self-start mt-2"
                  onPress={sign}
                  disabled={busy || !agreed || !signName.trim()}
                  testID={`todo-step-sign-submit-${id}`}
                >
                  <ButtonText>Sign</ButtonText>
                </Button>
              </View>
            )
          )}
        </View>
        {busy ? <ActivityIndicator size="small" color={c.brand} /> : null}
      </HStack>
    </View>
  );
}

// ── Comments ──

function Comments({ task, readOnly, tasks }: { task: Task; readOnly: boolean; tasks: MyTasks }) {
  const c = useThemeColors();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const { loadComments } = tasks;

  useEffect(() => {
    let active = true;
    loadComments(task.id)
      .then((list) => { if (active) setComments(list); })
      .catch(() => { if (active) setComments([]); });
    return () => { active = false; };
  }, [task.id, loadComments]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const comment = await tasks.addComment(task.id, body);
      if (comment) setComments((prev) => [...(prev || []), comment]);
      setDraft('');
    } catch (e) {
      toast.error(taskErrorText(e, 'Could not send your comment'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="mt-3 pt-3 border-t border-surface-100 dark:border-dark-surface-200" testID={`todo-comments-${task.id}`}>
      <UIText size="xs" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500 mb-2">Comments</UIText>
      {comments === null ? (
        <ActivityIndicator size="small" color={c.brand} />
      ) : comments.length === 0 ? (
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">No comments yet.</UIText>
      ) : (
        <VStack space="sm">
          {comments.map((m) => (
            <View key={m.id}>
              <UIText size="xs" className="font-poppins-semibold">
                {m.author_name || 'Someone'}
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-regular">  {fmtDueDate(m.created_at)}</UIText>
              </UIText>
              <UIText size="sm">{m.body}</UIText>
            </View>
          ))}
        </VStack>
      )}
      {!readOnly && (
        <HStack className="items-end gap-2 mt-3">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask the office a question"
            placeholderTextColor={c.iconMuted}
            multiline
            maxLength={2000}
            accessibilityLabel="Write a comment"
            testID={`todo-comment-input-${task.id}`}
            className="flex-1 border border-surface-300 dark:border-dark-surface-300 rounded-xl px-3 py-2 text-sm bg-white dark:bg-dark-surface-100 text-typo dark:text-dark-typo"
            style={{ fontFamily: 'Poppins_400Regular', maxHeight: 120 }}
          />
          <Button size="sm" onPress={send} disabled={sending || !draft.trim()} testID={`todo-comment-send-${task.id}`}>
            <ButtonText>Send</ButtonText>
          </Button>
        </HStack>
      )}
    </View>
  );
}

// ── A task ──

function TaskCard({ task, expanded, onToggle, statement, tasks }: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  statement: string | null;
  tasks: MyTasks;
}) {
  const c = useThemeColors();
  const readOnly = task.status === 'expired';
  const due = dueLine(task);
  const urgent = task.priority === 'high' || task.priority === 'urgent';
  const total = task.total_count ?? task.items.length;
  const done = task.done_count ?? task.items.filter(isTicked).length;

  return (
    <Card size="sm" className="bg-white dark:bg-dark-surface-100" testID={`todo-task-${task.id}`}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={task.title}
        testID={`todo-task-toggle-${task.id}`}
        className="active:opacity-70"
      >
        <HStack className="items-start gap-2">
          <View className="flex-1">
            <UIText size="md" className="font-poppins-semibold">{task.title}</UIText>
            <HStack className="flex-wrap gap-1.5 mt-1.5">
              <Badge action={STATUS_BADGE[task.status]}>
                <BadgeText>{TASK_STATUS_LABEL[task.status] || task.status}</BadgeText>
              </Badge>
              {urgent && (
                <Badge action="error" testID={`todo-task-priority-${task.id}`}>
                  <BadgeText>{task.priority === 'urgent' ? 'Urgent' : 'High priority'}</BadgeText>
                </Badge>
              )}
            </HStack>
            {due ? (
              <UIText size="xs" className={`mt-1.5 ${task.overdue ? 'text-error-600 font-poppins-medium' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                {due}
              </UIText>
            ) : null}
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">
              {[
                task.assigned_by_name ? `From ${task.assigned_by_name}` : null,
                total > 0 ? `${done} of ${total} done` : null,
                task.comment_count ? `${task.comment_count} comment${task.comment_count === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join('  ·  ')}
            </UIText>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.iconMuted} />
        </HStack>
      </Pressable>

      {expanded && (
        <View className="mt-2" testID={`todo-task-body-${task.id}`}>
          {task.description ? (
            <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700 mb-2">{task.description}</UIText>
          ) : null}

          {task.action === 'reply' && (
            <View className="rounded-xl bg-optio-purple/10 p-3 mb-2" testID={`todo-task-reply-${task.id}`}>
              <UIText size="sm" className="font-poppins-medium">The school asked you to reply</UIText>
              <Button
                size="xs"
                variant="outline"
                className="self-start mt-2"
                onPress={() => {
                  const group = threadGroup(task.thread_link);
                  router.push({ pathname: '/(app)/(tabs)/messages', ...(group ? { params: { group } } : {}) } as any);
                }}
                testID={`todo-task-open-messages-${task.id}`}
              >
                <ButtonText>Open Messages</ButtonText>
              </Button>
            </View>
          )}

          {readOnly && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mb-1" testID={`todo-task-expired-${task.id}`}>
              This task has expired and can no longer be changed.
            </UIText>
          )}

          {task.items.map((step) => (
            <StepRow key={step.key} task={task} step={step} readOnly={readOnly} statement={statement} tasks={tasks} />
          ))}

          <Comments task={task} readOnly={readOnly} tasks={tasks} />
        </View>
      )}
    </Card>
  );
}

// ── The tab ──

export function TodoTab({ organizationId, audience, initialTaskId }: {
  organizationId?: string | null;
  audience: TaskAudience;
  /** A notification names one task; the tab opens with it expanded. */
  initialTaskId?: string | null;
}) {
  const c = useThemeColors();
  const tasks = useMyTasks({ organizationId, audience });
  const { tasks: list, loading, error, includeDone, setIncludeDone, refresh, signatureStatement } = tasks;
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialTaskId ? [initialTaskId] : []),
  );
  const [refreshing, setRefreshing] = useState(false);

  // A link opened while the tab is already up changes the prop in place.
  useEffect(() => {
    if (initialTaskId) setExpanded((prev) => (prev.has(initialTaskId) ? prev : new Set(prev).add(initialTaskId)));
  }, [initialTaskId]);

  // The linked task may already be finished (a reminder that arrived after
  // the work was done), and the list hides finished tasks by default. Show
  // them rather than open on a list that does not contain what was tapped.
  useEffect(() => {
    if (!loading && initialTaskId && !includeDone && !list.some((t) => t.id === initialTaskId)) {
      setIncludeDone(true);
    }
  }, [loading, initialTaskId, includeDone, list, setIncludeDone]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-12 max-w-3xl w-full md:mx-auto"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      testID="school-tab-todo"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
    >
      <HStack className="justify-end mb-3">
        <Pressable
          onPress={() => setIncludeDone(!includeDone)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: includeDone }}
          testID="todo-show-finished"
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <Ionicons name={includeDone ? 'checkbox' : 'square-outline'} size={18} color={includeDone ? c.brand : c.iconMuted} />
          <UIText size="sm" className="font-poppins-medium">Show finished</UIText>
        </Pressable>
      </HStack>

      {loading ? (
        <View className="py-12 items-center"><ActivityIndicator color={c.brand} /></View>
      ) : error && !list.length ? (
        <UIText size="sm" className="text-error-600 text-center py-8" testID="todo-error">{error}</UIText>
      ) : !list.length ? (
        <View className="items-center pt-12 gap-3" testID="todo-empty">
          <Ionicons name="checkmark-done-outline" size={44} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
            Nothing to do right now.
          </UIText>
        </View>
      ) : (
        <VStack space="md">
          {list.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              expanded={expanded.has(t.id)}
              onToggle={() => toggle(t.id)}
              statement={signatureStatement}
              tasks={tasks}
            />
          ))}
        </VStack>
      )}
    </ScrollView>
  );
}

export default TodoTab;
