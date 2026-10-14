/**
 * TaskEditModal - Edit a quest task's title, pillar, diploma (transcript)
 * subjects and Definition of Done (success_criteria), or make a copy of it.
 *
 * Title: ticket 03ee5c2d, Karen Boyd (parent, Optio Academy): "everything but
 * the title can be edited." Duplicate: ticket 4476c061, "copy an existing task
 * to create a new one by just changing the title while keeping the same task
 * description and evidence requirements" (POST /api/tasks/:id/duplicate). Both
 * name the child (`student_id`) in parent mode, which PUT and duplicate accept
 * through @student_scope.
 *
 * Feature: "Allow me to edit the pillar and diploma subject on a task." Saves via
 * PUT /api/tasks/:id (which supports pillar, diploma_subjects, success_criteria).
 * The Definition of Done is required where the learner's school says so, and
 * locked once the task was sent for credit (server: 409 success_criteria_locked).
 */

import React, { useState } from 'react';
import { View, Modal, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';
import { PILLARS, DIPLOMA_SUBJECTS, subjectNames } from '@/src/hooks/useQuestDetail';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useTaskAuthoringRules } from '@/src/hooks/useTaskAuthoringRules';
import {
  DefinitionOfDoneEditor, cleanCriteria, criteriaForEditing, apiErrorCode,
} from '@/src/components/tasks/DefinitionOfDoneEditor';
import { HStack, Heading, UIText, Button, ButtonText,
} from '@/src/components/ui';

const pillarChip: Record<string, { active: string; text: string }> = {
  stem: { active: 'bg-pillar-stem', text: 'text-pillar-stem' },
  art: { active: 'bg-pillar-art', text: 'text-pillar-art' },
  communication: { active: 'bg-pillar-communication', text: 'text-pillar-communication' },
  civics: { active: 'bg-pillar-civics', text: 'text-pillar-civics' },
  wellness: { active: 'bg-pillar-wellness', text: 'text-pillar-wellness' },
};

interface TaskEditModalProps {
  visible: boolean;
  task: any | null;
  /** Parent mode: the child whose task this is, so the rules are the child's
   *  school's. */
  studentId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  /** The copy "Duplicate task" made. The screen opens the editor on it so the
   *  title can change. Without it the button is not offered. */
  onDuplicated?: (copy: { id: string; [key: string]: unknown }) => void;
}

export const CRITERIA_LOCKED_NOTE = 'Locked because this task was sent for credit';

export function TaskEditModal({ visible, task, studentId = null, onClose, onSaved, onDuplicated }: TaskEditModalProps) {
  const c = useThemeColors();
  const { rules } = useTaskAuthoringRules({
    studentId, taskId: task?.id ?? null, enabled: visible && !!task?.id,
  });
  const [criteria, setCriteria] = useState<string[]>(criteriaForEditing(task?.success_criteria));
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  // Set when the server refuses the edit as locked, in case the rules read
  // failed or went stale while the sheet was open.
  const [lockedByServer, setLockedByServer] = useState(false);
  const criteriaLocked = rules.criteriaLocked || lockedByServer;
  // No pillar picker for a learner 13+ (or a school with the pillars off): the
  // server re-derives the pillar from the subject (routes/tasks/crud.py).
  const hidePillars = rules.hidePillars;
  const [pillar, setPillar] = useState<string>(task?.pillar || 'stem');
  const [subjects, setSubjects] = useState<string[]>(
    subjectNames(task?.diploma_subjects ?? task?.school_subjects)
  );
  const [title, setTitle] = useState<string>(task?.title || '');
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeBody = studentId ? { student_id: studentId } : {};

  // Re-seed local state whenever a different task is opened.
  React.useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setPillar(task.pillar || 'stem');
      setSubjects(subjectNames(task.diploma_subjects ?? task.school_subjects));
      setCriteria(criteriaForEditing(task.success_criteria));
      setCriteriaError(null);
      setLockedByServer(false);
      setError(null);
    }
  }, [task?.id]);

  const toggleSubject = (s: string) => {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleSave = async () => {
    if (!task || saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Give the task a title.');
      return;
    }
    const cleaned = cleanCriteria(criteria);
    if (!criteriaLocked && rules.requiresSuccessCriteria && cleaned.length === 0) {
      setCriteriaError('Your school asks for a Definition of Done. Add at least one line.');
      return;
    }
    setSaving(true);
    setError(null);
    setCriteriaError(null);
    try {
      await api.put(`/api/tasks/${task.id}`, {
        title: trimmedTitle,
        ...(hidePillars ? {} : { pillar }),
        diploma_subjects: subjects,
        // A locked Definition of Done is not sent at all: the server refuses
        // any write to it once the task went for credit.
        ...(criteriaLocked ? {} : { success_criteria: cleaned }),
        ...scopeBody,
      });
      onSaved();
    } catch (e) {
      const apiErr = extractApiError(e, 'Could not save changes. Please try again.');
      if (apiErrorCode(e) === 'success_criteria_locked') {
        setLockedByServer(true);
        setCriteria(criteriaForEditing(task.success_criteria));
        setError(apiErr.message);
      } else if (apiErrorCode(e) === 'success_criteria_required') {
        setCriteriaError(apiErr.message);
      } else {
        setError(apiErr.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!task || copying || !onDuplicated) return;
    setCopying(true);
    setError(null);
    try {
      const res = await api.post(`/api/tasks/${task.id}/duplicate`, { ...scopeBody });
      const copy = res?.data?.task;
      if (copy) onDuplicated(copy);
    } catch (e) {
      setError(extractApiError(e, 'Could not copy the task. Please try again.').message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable className="flex-1" onPress={onClose} />
        <View
          style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}
        >
          <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mt-3 mb-1" />
          <HStack className="items-center justify-between px-6 pt-2 pb-3">
            <Heading size="md">Edit task</Heading>
            <Pressable onPress={onClose} hitSlop={8} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
              <Ionicons name="close" size={18} color={c.icon} />
            </Pressable>
          </HStack>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-semibold mb-2">TITLE</UIText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={200}
              accessibilityLabel="Task title"
              placeholderTextColor={c.textFaint}
              className="bg-surface-50 dark:bg-dark-surface-50 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3 text-sm mb-5"
              style={{ fontFamily: 'Poppins_400Regular' }}
            />

            {/* Pillar — single select. Hidden for a learner 13+. */}
            {!hidePillars && (
              <>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-semibold mb-2">PILLAR</UIText>
              <HStack className="flex-wrap gap-2 mb-5">
                {PILLARS.map((p) => {
                  const selected = pillar === p.key;
                  const chip = pillarChip[p.key] || pillarChip.stem;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => setPillar(p.key)}
                      className={`px-3 py-2 rounded-full border ${selected ? `${chip.active} border-transparent` : 'border-surface-200 dark:border-dark-surface-300'}`}
                    >
                      <UIText size="sm" className={selected ? 'text-white font-poppins-semibold' : chip.text}>
                        {p.label}
                      </UIText>
                    </Pressable>
                  );
                })}
              </HStack>
              </>
            )}

            {/* Diploma subjects — multi select. Include any subject the task
                already carries even if it isn't in the canonical list (e.g.
                legacy "Electives" vs "Elective"), so the current value always
                shows as selected and is editable. */}
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-semibold mb-2">DIPLOMA SUBJECTS</UIText>
            <HStack className="flex-wrap gap-2 mb-2">
              {[...DIPLOMA_SUBJECTS, ...subjects.filter((s) => !DIPLOMA_SUBJECTS.includes(s))].map((s) => {
                const selected = subjects.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleSubject(s)}
                    className={`flex-row items-center gap-1 px-3 py-2 rounded-full border ${selected ? 'bg-optio-purple border-transparent' : 'border-surface-200 dark:border-dark-surface-300'}`}
                  >
                    {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
                    <UIText size="sm" className={selected ? 'text-white font-poppins-medium' : 'text-typo-500 dark:text-dark-typo-500'}>
                      {s}
                    </UIText>
                  </Pressable>
                );
              })}
            </HStack>

            <View className="mt-4">
              <DefinitionOfDoneEditor
                value={criteria}
                onChange={(next) => { setCriteriaError(null); setCriteria(next); }}
                required={rules.requiresSuccessCriteria}
                readOnly={criteriaLocked}
                readOnlyNote={criteriaLocked ? CRITERIA_LOCKED_NOTE : undefined}
                error={criteriaError}
              />
            </View>

            {error ? (
              <UIText size="xs" className="text-error-600 dark:text-error-400 mt-2">{error}</UIText>
            ) : null}
          </ScrollView>

          <View className="px-6 pt-2" style={{ paddingBottom: Platform.OS === 'ios' ? 32 : 16 }}>
            <Button size="lg" className="w-full" onPress={handleSave} loading={saving} accessibilityLabel="Save changes">
              <ButtonText>
                <UIText className="text-white font-poppins-semibold">Save changes</UIText>
              </ButtonText>
            </Button>
            {onDuplicated ? (
              <Pressable
                onPress={handleDuplicate}
                disabled={copying || saving}
                accessibilityRole="button"
                accessibilityLabel="Duplicate task"
                className="py-3 items-center"
                style={{ minHeight: 44, justifyContent: 'center', opacity: copying ? 0.5 : 1 }}
              >
                <UIText size="sm" className="text-optio-purple font-poppins-medium">
                  {copying ? 'Copying...' : 'Duplicate task'}
                </UIText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
