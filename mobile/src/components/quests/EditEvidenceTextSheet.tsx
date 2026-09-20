/**
 * EditEvidenceTextSheet — fix the words on a text block already on a task.
 *
 * Tami Eastman, iCreate, 2026-09-20: "Is there a way to submit evidence and
 * then go back and edit it rather than having to delete the entire post? I
 * just noticed some spelling errors." Until then a block could be taken off a
 * task and put back, never changed. The web could edit; the app could not.
 *
 * Text only. A photo, a scan, a clip has nothing to edit in place; a wrong
 * one comes off and the right one goes on, which the X already does.
 */

import React, { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { BottomSheet, Button, ButtonText, Heading, HStack, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

/** Where a text block keeps its words. Task evidence writes `content.text`;
 *  older rows and moment mirrors used `content.value`. Read either, write both
 *  so whichever reader comes next finds it. */
export function textOfBlock(block: any): string {
  const content = block?.content || {};
  return content.text || content.value || '';
}

/** The block list with one text block's words replaced. Nothing else on the
 *  block moves: its id, its position, who added it. Same array if the block is
 *  not in the list, so a stale reference cannot invent a row. */
export function replaceBlockText(blocks: any[], target: any, text: string): any[] {
  return blocks.map((b) => (
    b === target
      ? { ...b, content: { ...(b.content || {}), text, value: text } }
      : b
  ));
}

interface Props {
  visible: boolean;
  block: any | null;
  onClose: () => void;
  /** Resolves once the new words are saved. Rejects to keep the sheet open. */
  onSave: (text: string) => Promise<void>;
}

export function EditEvidenceTextSheet({ visible, block, onClose, onSave }: Props) {
  const c = useThemeColors();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed from the block each time the sheet opens on one.
  useEffect(() => {
    if (visible && block) {
      setText(textOfBlock(block));
      setError(null);
    }
  }, [visible, block]);

  const trimmed = text.trim();
  const unchanged = trimmed === textOfBlock(block).trim();

  const save = async () => {
    if (!trimmed || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch {
      setError("That couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <VStack space="md" className="pb-2">
        <Heading size="md">Edit evidence</Heading>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={5}
          autoFocus
          accessibilityLabel="Evidence text"
          placeholder="Describe what you did, what you learned..."
          placeholderTextColor={c.textFaint}
          className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 text-base font-poppins text-typo dark:text-dark-typo min-h-[120px]"
          style={{ textAlignVertical: 'top' }}
        />
        {error && (
          <UIText size="xs" className="text-amber-700 dark:text-amber-500">{error}</UIText>
        )}
        <HStack space="sm" className="justify-end">
          <Button variant="outline" action="secondary" onPress={onClose} isDisabled={saving}>
            <ButtonText>Cancel</ButtonText>
          </Button>
          <Button onPress={save} isDisabled={saving || !trimmed || unchanged} accessibilityLabel="Save evidence text">
            <ButtonText>{saving ? 'Saving…' : 'Save'}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
