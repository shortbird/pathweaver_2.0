/**
 * AddKidSheet - Minimal dependent-creation form for parents.
 *
 * Posts to /api/dependents/create with display_name + date_of_birth. Backend
 * caps dependents at 13 (older kids need their own login). Avatars and other
 * fine-grained profile setup happen later from the Family tab.
 */

import React, { useState } from 'react';
import { Pressable, TextInput, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';

interface AddKidSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddKidSheet({ visible, onClose, onCreated }: AddKidSheetProps) {
  const [name, setName] = useState('');
  // Stored as YYYY-MM-DD; we collect month/day/year separately to avoid a
  // native date-picker dep just for this single field.
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setMonth('');
    setDay('');
    setYear('');
    setError(null);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (!m || !d || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) {
      setError('Enter a valid date of birth');
      return;
    }
    const dob = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    setSaving(true);
    try {
      await api.post('/api/dependents/create', {
        display_name: name.trim(),
        date_of_birth: dob,
      });
      reset();
      onClose();
      onCreated?.();
      Alert.alert('Added', `${name.trim()}'s profile was created.`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.error
        || err.response?.data?.message
        || 'Could not add the kid. Please try again.';
      setError(typeof msg === 'string' ? msg : 'Could not add the kid.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <Heading size="lg">Add a kid</Heading>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color="#6B7280" />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500">
          Create a profile for your child. Kids under 13 are managed from your account.
        </UIText>

        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
            Their name
          </UIText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Charlie"
            placeholderTextColor="#9CA3AF"
            className="bg-surface-50 rounded-xl p-4 text-base font-poppins"
            maxLength={60}
            autoFocus
          />
        </VStack>

        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
            Date of birth
          </UIText>
          <HStack className="gap-2">
            <TextInput
              value={month}
              onChangeText={(v) => setMonth(v.replace(/[^0-9]/g, '').slice(0, 2))}
              placeholder="MM"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className="flex-1 bg-surface-50 rounded-xl p-4 text-base font-poppins text-center"
            />
            <TextInput
              value={day}
              onChangeText={(v) => setDay(v.replace(/[^0-9]/g, '').slice(0, 2))}
              placeholder="DD"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className="flex-1 bg-surface-50 rounded-xl p-4 text-base font-poppins text-center"
            />
            <TextInput
              value={year}
              onChangeText={(v) => setYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="YYYY"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className="flex-[1.5] bg-surface-50 rounded-xl p-4 text-base font-poppins text-center"
            />
          </HStack>
        </VStack>

        {error && (
          <View className="bg-red-50 p-3 rounded-lg">
            <UIText size="sm" className="text-red-600">{error}</UIText>
          </View>
        )}

        <Button
          size="lg"
          onPress={handleSubmit}
          loading={saving}
          disabled={saving}
          className="w-full"
        >
          <ButtonText>{saving ? 'Adding…' : 'Add kid'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
