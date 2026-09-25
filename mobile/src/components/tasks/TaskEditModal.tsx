/**
 * TaskEditModal - Edit a quest task's pillar, diploma (transcript) subjects and
 * Definition of Done (success_criteria).
 *
 * Feature: "Allow me to edit the pillar and diploma subject on a task." Saves via
 * PUT /api/tasks/:id (which supports pillar, diploma_subjects, success_criteria).
 * The Definition of Done is required where the learner's school says so, and
 * locked once the task was sent for credit (server: 409 success_criteria_locked).
 */

import React, { useState } from 'react';
import { View, Modal, Pressable, ScrollView, Platform } from 'react-native';
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
}

export const CRITERIA_LOCKED_NOTE = 'Locked because this task was sent for credit';

export function TaskEditModal({ visible, task, studentId = null, onClose, onSaved }: TaskEditModalProps) {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state whenever a different task is opened.
  React.useEffect(() => {
    if (task) {
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
        ...(hidePillars ? {} : { pillar }),
        diploma_subjects: subjects,
        // A locked Definition of Done is not sent at all: the server refuses
        // any write to it once the task went for credit.
        ...(criteriaLocked ? {} : { success_criteria: cleaned }),
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
            {task?.title ? (
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mb-4" numberOfLines={2}>
                {task.title}
              </UIText>
            ) : null}

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
          </View>
        </View>
      </View>
    </Modal>
  );
}
