/**
 * DefinitionOfDoneEditor - the list of short, checkable statements that say
 * when a task is done (the `success_criteria` field).
 *
 * Shared by the write-your-own step of TaskCreationWizard and TaskEditModal so
 * both forms look and validate the same way. Same name and visual language as
 * the read-only "Definition of Done" block on the quest screen.
 */

import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export const MAX_CRITERIA = 5;
export const MAX_CRITERION_LENGTH = 200;

/** The lines worth sending: trimmed, non-empty, at most five. */
export function cleanCriteria(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().slice(0, MAX_CRITERION_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_CRITERIA);
}

/**
 * The machine code on a refused write. The task routes send it at the top level
 * (`{code, error}`), which extractApiError does not read -- it only looks inside
 * a nested `{error: {code}}`.
 */
export function apiErrorCode(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { code?: unknown; error?: { code?: unknown } } } } | null)
    ?.response?.data;
  if (typeof data?.code === 'string') return data.code;
  if (typeof data?.error?.code === 'string') return data.error.code;
  return undefined;
}

/** What the editor starts from: the task's lines, or one empty line to type in. */
export function criteriaForEditing(raw: unknown): string[] {
  const lines = cleanCriteria(raw);
  return lines.length ? lines : [''];
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
  readOnly?: boolean;
  /** Shown under the heading when read-only. */
  readOnlyNote?: string;
  error?: string | null;
}

export function DefinitionOfDoneEditor({
  value, onChange, required = false, readOnly = false, readOnlyNote, error,
}: Props) {
  const c = useThemeColors();
  const lines = value.length ? value : [''];

  const setLine = (i: number, text: string) => {
    onChange(lines.map((l, idx) => (idx === i ? text : l)));
  };
  const removeLine = (i: number) => {
    const next = lines.filter((_, idx) => idx !== i);
    onChange(next.length ? next : ['']);
  };
  const addLine = () => {
    if (lines.length >= MAX_CRITERIA) return;
    onChange([...lines, '']);
  };

  if (readOnly) {
    const shown = cleanCriteria(lines);
    return (
      <VStack space="xs" className="p-3 rounded-lg bg-surface-100 dark:bg-dark-surface-200">
        <UIText size="xs" className="font-poppins-semibold text-typo-400 dark:text-dark-typo-400 uppercase">
          Definition of Done
        </UIText>
        {readOnlyNote ? (
          <HStack className="items-center gap-1">
            <Ionicons name="lock-closed-outline" size={12} color={c.icon} />
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{readOnlyNote}</UIText>
          </HStack>
        ) : null}
        {shown.length === 0 ? (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">None written.</UIText>
        ) : shown.map((criterion, i) => (
          <HStack key={i} className="items-start gap-2">
            <Ionicons name="checkmark-circle-outline" size={15} color="#22c55e" style={{ marginTop: 1 }} />
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 flex-1 leading-5">{criterion}</UIText>
          </HStack>
        ))}
      </VStack>
    );
  }

  return (
    <VStack space="xs">
      <UIText size="sm" className="font-poppins-medium">
        Definition of Done{required ? ' *' : ' (optional)'}
      </UIText>
      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
        How will you know it is finished? Write one short line for each thing you will have done.
      </UIText>
      {lines.map((line, i) => (
        <HStack key={i} className="items-center gap-2">
          <Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" />
          <TextInput
            value={line}
            onChangeText={(t) => setLine(i, t)}
            placeholder={i === 0 ? 'You played 5 games' : 'You...'}
            placeholderTextColor={c.textFaint}
            maxLength={MAX_CRITERION_LENGTH}
            accessibilityLabel={`Definition of Done line ${i + 1}`}
            className="flex-1 bg-surface-50 dark:bg-dark-surface-50 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3 text-sm"
            style={{ fontFamily: 'Poppins_400Regular' }}
          />
          {lines.length > 1 || line.length > 0 ? (
            <Pressable
              onPress={() => removeLine(i)}
              hitSlop={8}
              accessibilityLabel={`Remove Definition of Done line ${i + 1}`}
              className="w-8 h-8 rounded-full items-center justify-center"
            >
              <Ionicons name="close" size={16} color={c.icon} />
            </Pressable>
          ) : (
            <View className="w-8 h-8" />
          )}
        </HStack>
      ))}
      {lines.length < MAX_CRITERIA && (
        <Pressable onPress={addLine} accessibilityLabel="Add a Definition of Done line" className="self-start py-1">
          <HStack className="items-center gap-1">
            <Ionicons name="add" size={16} color={c.brand} />
            <UIText size="xs" className="font-poppins-medium text-optio-purple">Add a line</UIText>
          </HStack>
        </Pressable>
      )}
      {error ? (
        <UIText size="xs" className="text-error-600 dark:text-error-400">{error}</UIText>
      ) : null}
    </VStack>
  );
}

export default DefinitionOfDoneEditor;
