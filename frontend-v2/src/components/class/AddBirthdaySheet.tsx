/**
 * AddBirthdaySheet - collects a missing date of birth so a student can start
 * a class.
 *
 * OAuth signups skip the registration form, so those accounts have no DOB and
 * the 13+ class gate can never pass. This sheet unblocks them in place: pick a
 * birthday, save to the profile, and continue into CreateClassSheet. The
 * backend enforces COPPA (rejects a self-service DOB under 13), so the age
 * check stays server-side.
 */

import React, { useRef, useState } from 'react';
import { Platform, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';

const DateTimePicker = Platform.OS === 'web'
  ? null
  : require('@react-native-community/datetimepicker').default;

interface AddBirthdaySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fires after the DOB saved successfully (user reloaded in the auth store). */
  onSaved: () => void;
}

const DEFAULT_DOB = new Date(2010, 0, 1);

export function AddBirthdaySheet({ visible, onClose, onSaved }: AddBirthdaySheetProps) {
  const c = useThemeColors();
  const loadUser = useAuthStore((s) => s.loadUser);
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Deferred until the close animation finishes — on iOS a second Modal won't
  // present while this one is still dismissing (see BottomSheet.onClosed).
  const pendingSavedRef = useRef(false);

  const handleClose = () => {
    setDob(null);
    setShowPicker(false);
    onClose();
  };

  const handleClosed = () => {
    if (!pendingSavedRef.current) return;
    pendingSavedRef.current = false;
    onSaved();
  };

  const onPick = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event?.type === 'dismissed' || !selected) return;
    setDob(selected);
  };

  const handleSave = async () => {
    if (!dob || saving) return;
    setSaving(true);
    try {
      const y = dob.getFullYear();
      const m = String(dob.getMonth() + 1).padStart(2, '0');
      const d = String(dob.getDate()).padStart(2, '0');
      await api.put('/api/users/profile', { date_of_birth: `${y}-${m}-${d}` });
      await loadUser();
      pendingSavedRef.current = true;
      handleClose();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.error
        || 'Could not save your birthday.';
      Alert.alert('Could not save', typeof msg === 'string' ? msg : 'Could not save your birthday.');
    } finally {
      setSaving(false);
    }
  };

  const dobLabel = dob
    ? dob.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Select your birthday';

  return (
    <BottomSheet visible={visible} onClose={handleClose} onClosed={handleClosed}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <Heading size="lg">Add your birthday</Heading>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
          Classes are for students 13 and up. Add your date of birth to continue.
        </UIText>

        <Pressable
          testID="add-birthday-field"
          onPress={() => setShowPicker(true)}
          className="rounded-xl border border-surface-200 dark:border-dark-surface-300 px-4 py-3"
        >
          <UIText size="md" className={dob ? '' : 'text-typo-400 dark:text-dark-typo-400'}>
            {dobLabel}
          </UIText>
        </Pressable>

        {showPicker && DateTimePicker && (
          <DateTimePicker
            value={dob ?? DEFAULT_DOB}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={onPick}
          />
        )}

        <Button
          testID="add-birthday-save"
          onPress={handleSave}
          disabled={!dob || saving}
          className={!dob || saving ? 'opacity-50' : ''}
        >
          <ButtonText>{saving ? 'Saving…' : 'Save and continue'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
