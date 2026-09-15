/**
 * WeeklyXpGoalLine - a child's weekly XP goal as one line on their card:
 * label, earned / target, a thin bar, and Change or Set a goal. The editor
 * unfolds beneath it: preset chips, a number, an optional note, Save and
 * Remove. Renders nothing for a school without the feature, and nothing
 * while loading, so the card never jumps.
 */

import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { HStack, UIText, VStack, Button, ButtonText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useWeeklyXpGoal, XP_GOAL_PRESETS } from '@/src/hooks/useWeeklyXpGoal';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

export function WeeklyXpGoalLine({ studentId }: { studentId: string }) {
  const c = useThemeColors();
  const { goal, loading, saving, save, clear } = useWeeklyXpGoal(studentId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  if (loading || !goal?.enabled) return null;

  const target = goal.target_xp;
  const earned = goal.xp_earned || 0;
  const percent = goal.percent || 0;

  const openEditor = () => {
    setDraft(target ? String(target) : '');
    setNote(goal.note || '');
    setEditing(true);
  };

  const onSave = async () => {
    try {
      await save(Number(draft), note.trim() || null);
      setEditing(false);
    } catch (err) {
      showAlert('Could not save the goal', extractApiError(err).message);
    }
  };

  const onClear = async () => {
    try {
      await clear();
      setEditing(false);
    } catch (err) {
      showAlert('Could not remove the goal', extractApiError(err).message);
    }
  };

  return (
    <VStack className="mt-3" space="xs">
      <HStack className="items-center justify-between gap-2">
        <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">
          Weekly goal
        </UIText>
        <HStack className="items-center gap-2">
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
            {target
              ? `${earned.toLocaleString()} / ${target.toLocaleString()} XP${goal.met ? ' · met' : ''}`
              : `${earned.toLocaleString()} XP this week · no goal`}
          </UIText>
          {goal.can_edit && !editing && (
            <Pressable onPress={openEditor} hitSlop={8} accessibilityRole="button">
              <UIText size="xs" className="font-poppins-medium text-optio-purple dark:text-optio-purple-light">
                {target ? 'Change' : 'Set a goal'}
              </UIText>
            </Pressable>
          )}
        </HStack>
      </HStack>
      {target ? (
        <View
          className="h-1.5 w-full rounded-full bg-surface-100 dark:bg-dark-surface-200 overflow-hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          accessibilityLabel="Weekly XP goal progress"
        >
          <View
            className={`h-full rounded-full ${goal.met ? 'bg-green-500' : 'bg-optio-purple'}`}
            style={{ width: `${percent}%` }}
          />
        </View>
      ) : null}

      {editing && (
        <VStack className="mt-2 pt-3 border-t border-surface-100 dark:border-dark-surface-200" space="sm">
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">XP to earn each week</UIText>
          <HStack className="flex-wrap gap-2">
            {XP_GOAL_PRESETS.map((preset) => {
              const on = String(preset) === draft;
              return (
                <Pressable
                  key={preset}
                  onPress={() => setDraft(String(preset))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={`rounded-full px-3 py-1.5 border ${on ? 'border-optio-purple bg-optio-purple/10' : 'border-surface-200 dark:border-dark-surface-300'}`}
                >
                  <UIText size="xs" className={on ? 'text-optio-purple font-poppins-semibold' : 'text-typo-500 dark:text-dark-typo-500'}>
                    {preset.toLocaleString()}
                  </UIText>
                </Pressable>
              );
            })}
          </HStack>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            keyboardType="number-pad"
            placeholder="Or type a number"
            placeholderTextColor={c.textFaint}
            accessibilityLabel="XP to earn each week"
            className="bg-surface-50 dark:bg-dark-surface-50 text-typo dark:text-dark-typo rounded-xl px-3 py-2 text-sm font-poppins"
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={280}
            placeholder="A note for the student (optional)"
            placeholderTextColor={c.textFaint}
            className="bg-surface-50 dark:bg-dark-surface-50 text-typo dark:text-dark-typo rounded-xl px-3 py-2 text-sm font-poppins"
          />
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            This goal keeps applying every week until someone changes it.
          </UIText>
          <HStack className="flex-wrap gap-2">
            <Button size="sm" onPress={onSave} disabled={saving || !draft} loading={saving}>
              <ButtonText>Save goal</ButtonText>
            </Button>
            <Button size="sm" variant="outline" action="secondary" onPress={() => setEditing(false)} disabled={saving}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            {target ? (
              <Button size="sm" variant="link" action="secondary" onPress={onClear} disabled={saving}>
                <ButtonText>Remove goal</ButtonText>
              </Button>
            ) : null}
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}
